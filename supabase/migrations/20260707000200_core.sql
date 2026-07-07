-- Core: stores, roles, role_permissions, profiles, teams, team_members
-- ARCHITECTURE.md "Data model (Postgres)" > Core

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false,
  -- rank: seed deliverable calls for "10 roles with rankings" (PLAN.md P0 #3);
  -- not a literal spec column but required to carry that seed data.
  rank int,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null,
  primary key (role_id, permission_key)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  name text not null,
  email text not null,
  phone text,
  avatar_url text,
  role_id uuid references public.roles(id),
  active boolean not null default true,
  birthdate date,
  hired_on date,
  -- Discord integration: profiles.discord_user_id, for @mentions
  discord_user_id text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, user_id)
);

-- Auto-create a bare profile row when a new Supabase Auth user is created,
-- as a safety net alongside the admin invite flow (People & Teams admin,
-- PLAN.md P0 #6). The invite flow is expected to update name/role/store
-- right after; this trigger just guarantees a profile always exists.
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

  insert into public.profiles (id, store_id, name, email, role_id)
  values (
    new.id,
    default_store_id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    default_role_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
