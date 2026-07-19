-- PPL2b (HIGH, privacy — DB layer): move profile PII off the store-member-
-- readable `profiles` table into a locked `profiles_private` table.
--
-- Background: `profiles_select_store_member`
-- (20260707001850_people_teams_rls.sql) lets ANY active store member SELECT
-- every column of every other member's profiles row. RLS is row-level, so the
-- policy that (correctly) exposes name/role/avatar for the roster and pickers
-- also exposes phone, email, birthdate, hired_on, and discord_user_id. A plain
-- Team Member could read a minor's birthday, everyone's phone/email, etc. via
-- raw PostgREST (`GET /rest/v1/profiles?select=phone,birthdate,...`). The UI
-- fix (PPL2) hid these on the profile page render, but the DB still served
-- them.
--
-- Fix: split the five PII columns into `public.profiles_private`, keyed 1:1 to
-- profiles, with RLS that only lets the person themselves or a `people.manage`
-- holder read/write them. The store-member-readable `profiles` table keeps
-- only non-PII (id, store_id, name, avatar_url, role_id, active, created_at),
-- so the roster/org-chart/pickers still work and the raw-REST hole is closed
-- BY CONSTRUCTION: the sensitive columns no longer exist on the table that
-- `profiles_select_store_member` exposes.
--
-- The privilege guards are preserved, not weakened:
--   * The profiles guard (enforce_profile_privilege_guard) keeps its
--     role_id/active/store_id/name blocks plus the PPL1 self/rank role rules.
--     Its discord_user_id/email blocks MOVE to the new profiles_private guard
--     (enforce_profile_private_guard) because those columns moved.
--   * hired_on becomes people.manage-only to write (it was un-guarded before,
--     so this only tightens; the app never offered self-service hired_on).
--   * phone and birthdate stay genuinely self-editable, matching the pre-move
--     self-service surface (updateOwnProfile).
--
-- Idempotent: create-table IF NOT EXISTS; drop-policy-if-exists before each
-- create; create-or-replace functions; drop-trigger-if-exists before create;
-- the backfill+column-drop is guarded on the old columns still existing so a
-- re-run is a no-op. Timestamp is after 20260718010300 per the audit ordering.

-- 1. The locked PII table (1:1 with profiles, cascades on profile delete).
create table if not exists public.profiles_private (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  email text not null,
  birthdate date,
  hired_on date,
  discord_user_id text,
  created_at timestamptz not null default now()
);

-- 2. RLS: self OR people.manage, for both read and write. No default_deny
-- policy exists for this table (900_rls_default_deny only looped over tables
-- that existed when it ran), so enabling RLS with only these permissive
-- policies denies everything else by default — exactly what we want.
alter table public.profiles_private enable row level security;

drop policy if exists profiles_private_select_self_or_manager on public.profiles_private;
create policy profiles_private_select_self_or_manager on public.profiles_private
  for select
  using (profile_id = auth.uid() or public.has_permission('people.manage'));

drop policy if exists profiles_private_update_self_or_manager on public.profiles_private;
create policy profiles_private_update_self_or_manager on public.profiles_private
  for update
  using (profile_id = auth.uid() or public.has_permission('people.manage'))
  with check (profile_id = auth.uid() or public.has_permission('people.manage'));

-- Rows are created by the auth trigger (below) and by the backfill; the app
-- only ever UPDATEs. A narrow manager insert policy covers admin repair; the
-- security-definer trigger inserts bypass RLS as the table owner.
drop policy if exists profiles_private_insert_manager on public.profiles_private;
create policy profiles_private_insert_manager on public.profiles_private
  for insert
  with check (public.has_permission('people.manage'));

-- PostgREST role grants. RLS is the row gate; anon gets nothing. No DELETE
-- grant: rows are removed via ON DELETE CASCADE from profiles only.
grant select, insert, update on public.profiles_private to authenticated;
revoke all on public.profiles_private from anon;

-- 3. Write guard for the identity/privileged private columns. email,
-- discord_user_id, and hired_on may only change when the actor holds
-- people.manage or is the trusted service-role client (this is the
-- discord/email guard from 20260707080200 and 20260718000000, relocated to
-- where those columns now live). phone and birthdate stay self-editable.
create or replace function public.enforce_profile_private_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service_role boolean := (auth.uid() is null or auth.role() = 'service_role');
begin
  if new.email is distinct from old.email
     or new.discord_user_id is distinct from old.discord_user_id
     or new.hired_on is distinct from old.hired_on then
    if not (public.has_permission('people.manage') or is_service_role) then
      raise exception
        'insufficient privilege: cannot change email/discord_user_id/hired_on'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_private_guard on public.profiles_private;
create trigger profile_private_guard
  before update on public.profiles_private
  for each row
  execute function public.enforce_profile_private_guard();

-- 4. Auth signup trigger: write email into profiles_private instead of
-- profiles (email no longer lives on profiles). The bare profiles row is still
-- created first so the FK on profile_id resolves.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_store_id uuid;
  default_role_id uuid;
begin
  select id into default_store_id from public.stores order by created_at asc limit 1;
  select id into default_role_id from public.roles order by rank desc nulls last limit 1;

  if default_store_id is null then
    return new;
  end if;

  insert into public.profiles (id, store_id, name, role_id)
  values (
    new.id,
    default_store_id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    default_role_id
  )
  on conflict (id) do nothing;

  insert into public.profiles_private (profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

-- 5. Relocate the profiles privilege guard: drop the discord_user_id/email
-- references (those columns are leaving profiles) while preserving every other
-- block, including the PPL1 self/rank role-assignment rules. Must run BEFORE
-- the column drop so the trigger never references a dropped column.
create or replace function public.enforce_profile_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  is_service_role boolean := (auth.uid() is null or auth.role() = 'service_role');
  actor_rank int;
  target_rank int;
begin
  -- Identity/privileged columns still on profiles: role_id, active, store_id,
  -- name. Changeable only by a people.manage holder or the service-role client.
  if new.role_id is distinct from old.role_id
     or new.active is distinct from old.active
     or new.store_id is distinct from old.store_id
     or new.name is distinct from old.name then
    if not (public.has_permission('people.manage') or is_service_role) then
      raise exception
        'insufficient privilege: cannot change role_id/active/store_id/name'
        using errcode = '42501';
    end if;
  end if;

  -- PPL1: role-assignment guards (unchanged). Real user acting with their own
  -- JWT; service-role stays exempt for bootstrap/invite.
  if new.role_id is distinct from old.role_id and not is_service_role then
    if new.id = actor_id then
      raise exception
        'insufficient privilege: you cannot change your own role'
        using errcode = '42501';
    end if;

    select r.rank into actor_rank
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = actor_id;

    select rank into target_rank from public.roles where id = new.role_id;

    if target_rank is not null
       and (actor_rank is null or target_rank < actor_rank) then
      raise exception
        'insufficient privilege: cannot assign a role senior to your own'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 6. Backfill the private table from the existing columns, then drop them.
-- Guarded on the old columns still existing so re-running the migration after
-- the drop is a no-op (a bare `select ... phone ...` would otherwise error).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    insert into public.profiles_private (profile_id, phone, email, birthdate, hired_on, discord_user_id)
    select id, phone, email, birthdate, hired_on, discord_user_id
    from public.profiles
    on conflict (profile_id) do nothing;

    alter table public.profiles
      drop column if exists phone,
      drop column if exists email,
      drop column if exists birthdate,
      drop column if exists hired_on,
      drop column if exists discord_user_id;
  end if;
end $$;
