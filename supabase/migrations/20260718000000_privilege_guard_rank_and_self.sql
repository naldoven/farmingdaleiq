-- PPL1 (high, privilege escalation): harden enforce_profile_privilege_guard so
-- a people.manage holder can neither elevate THEMSELVES nor assign a role more
-- senior than their own.
--
-- Background: the guard added in 20260707002000_profile_privilege_guard.sql and
-- extended in 20260707080200_profile_discord_guard.sql only checked
-- `has_permission('people.manage')` for any change to the privileged/identity
-- columns. That let any people.manage holder (Assistant Director, rank 3, and
-- up) set their OWN profiles.role_id to any role — including Location Manager
-- (rank 1) — from the normal UI and via raw PostgREST. It also let a mid-rank
-- manager promote anyone (including themselves by proxy) into a role senior to
-- their own.
--
-- This migration REPLACES the guard function (create-or-replace; the trigger is
-- unchanged and keeps pointing at it). It preserves every existing block — the
-- role_id/active/store_id guard and the discord_user_id/name/email guard from
-- 080200 — and adds two role-assignment rules that apply ONLY to a role_id
-- change made by a real user acting with their own JWT:
--
--   (a) SELF: a user may never change their own role (new.id = auth.uid()),
--       even with people.manage. Role changes must come from someone else.
--   (b) RANK: a user may not assign a role senior to their own. Seniority is
--       the `roles.rank` column where a LOWER number is MORE senior
--       (rank 1 = Location Manager). Blocked when the target role's rank is
--       strictly less than the actor's own current role's rank. Assigning a
--       role at the actor's own rank or below (more junior) is allowed.
--
-- The service-role client (auth.uid() is null / auth.role() = 'service_role')
-- stays fully exempt so the server-side bootstrap (bootstrapFirstAdmin) and
-- invite (inviteUser) flows keep working — they are the trusted escape hatch
-- these guards were always designed around.
--
-- NOTE (leadership passport interaction): stampPassport (training) upgrades an
-- enrollee's role via the per-request client. Under rule (b) a stamper can only
-- promote to a role at or below their own rank. In practice the person running
-- a leadership passport is senior enough (a Location Manager can promote to any
-- role), so normal flows are unaffected; a junior leader trying to promote
-- someone ABOVE their own rank is now blocked, which is consistent with the
-- anti-escalation intent. Flagged here in case a senior-promotion pipeline run
-- by a junior leader is ever a real requirement (a separate permission-model
-- decision).
--
-- Idempotent: create-or-replace on the function; trigger recreated defensively.

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
  -- Existing guard: the privileged/identity columns may only change when the
  -- actor holds people.manage (an admin acting with their own JWT) or is the
  -- trusted service-role client.
  if new.role_id is distinct from old.role_id
     or new.active is distinct from old.active
     or new.store_id is distinct from old.store_id
     or new.discord_user_id is distinct from old.discord_user_id
     or new.name is distinct from old.name
     or new.email is distinct from old.email then
    if not (public.has_permission('people.manage') or is_service_role) then
      raise exception
        'insufficient privilege: cannot change role_id/active/store_id/discord_user_id/name/email'
        using errcode = '42501';
    end if;
  end if;

  -- PPL1: additional role-assignment guards. Apply only to a role_id change,
  -- and only to a real user acting with their own JWT (service-role stays
  -- exempt for bootstrap/invite). A caller reaching here for a role_id change
  -- already holds people.manage (the block above would have raised otherwise).
  if new.role_id is distinct from old.role_id and not is_service_role then
    -- (a) You cannot change your own role.
    if new.id = actor_id then
      raise exception
        'insufficient privilege: you cannot change your own role'
        using errcode = '42501';
    end if;

    -- (b) You cannot assign a role senior to your own (lower rank = senior).
    select r.rank into actor_rank
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = actor_id;

    select rank into target_rank from public.roles where id = new.role_id;

    -- A null target rank (or clearing the role to none) is never "senior", so
    -- it is allowed. A null actor rank (a manager with an unranked role) is
    -- treated as the least-senior end, so it may not assign any ranked role.
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

drop trigger if exists profile_privilege_guard on public.profiles;

create trigger profile_privilege_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profile_privilege_guard();
