-- FIQ-06 (med): stop a user from self-editing privileged/identity profile
-- fields via PostgREST.
--
-- profiles_update_self (20260707001850_people_teams_rls.sql) allows a user to
-- UPDATE their own row with no column restriction, and the existing
-- enforce_profile_privilege_guard (20260707002000_profile_privilege_guard.sql)
-- only blocked role_id/active/store_id. That left discord_user_id, name, and
-- email self-editable: a user could set discord_user_id to a bogus or another
-- employee's Discord ID and misroute their own @mention notifications
-- (accountability/disciplinary pings), and spoof their display name/email.
--
-- This extends the guard to also reject changes to discord_user_id, name, and
-- email unless the actor holds people.manage (an admin acting with their own
-- JWT, matching updateProfile's gate) or is the service-role client (the
-- server-side invite/link-collection flow). Genuinely personal fields (phone,
-- birthdate, avatar_url) stay self-editable.
--
-- Idempotent: create-or-replace on the function; the trigger is unchanged and
-- keeps pointing at it.

create or replace function public.enforce_profile_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is distinct from old.role_id
     or new.active is distinct from old.active
     or new.store_id is distinct from old.store_id
     or new.discord_user_id is distinct from old.discord_user_id
     or new.name is distinct from old.name
     or new.email is distinct from old.email then
    -- Allow when the actor is a store manager acting with their own JWT,
    -- or the trusted server-side service-role client.
    if public.has_permission('people.manage')
       or auth.role() = 'service_role' then
      return new;
    end if;
    raise exception
      'insufficient privilege: cannot change role_id/active/store_id/discord_user_id/name/email'
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
