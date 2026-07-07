-- Privilege-escalation guard for public.profiles (security-critical).
--
-- The RLS policy profiles_update_self (20260707001850_people_teams_rls.sql)
-- lets a signed-in user UPDATE their own profiles row with no column
-- restriction. Through PostgREST that lets any non-admin change their own
-- role_id / active / store_id directly, escalating to any role and bypassing
-- the app's requirePermission-gated actions.
--
-- RLS column restrictions (with-check on specific columns) cannot express
-- "unchanged unless privileged", so we enforce it with a BEFORE UPDATE
-- trigger. The three privileged columns may only change when the actor holds
-- people.manage (an admin acting with their own JWT) or is the service-role
-- client (the server-side inviteUser flow). Everyone else is blocked even
-- though the row-level policy would otherwise allow the write.

create or replace function public.enforce_profile_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is distinct from old.role_id
     or new.active is distinct from old.active
     or new.store_id is distinct from old.store_id then
    -- Allow when the actor is a store manager acting with their own JWT,
    -- or the trusted server-side service-role client.
    if public.has_permission('people.manage')
       or auth.role() = 'service_role' then
      return new;
    end if;
    raise exception
      'insufficient privilege: cannot change role_id/active/store_id'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_privilege_guard on public.profiles;

create trigger profile_privilege_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profile_privilege_guard();
