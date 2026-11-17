-- Target-side rank rule for profile changes (docs/STAFF-SIGN-IN-PLAN.md, Step 6).
--
-- Background: enforce_profile_privilege_guard (latest body in
-- 20260718020000_profiles_private_pii.sql) stops a user changing their own role
-- and stops assigning a role senior to the actor's own. It never looked at the
-- TARGET's current rank. An Assistant Director (rank 3) could therefore send
-- `PATCH /rest/v1/profiles?id=eq.<a Director>` with `{role_id: null}` or any
-- junior role, or deactivate a Director, using their own JWT. With the new
-- setup-link and temporary-password tools that is an account takeover: demote
-- the Director, then the app's rank guard sees a junior and hands out their
-- sign-in. The app-side guard (lib/auth/rank-guard.ts) cannot stop a raw API
-- call, so the database has to.
--
-- New rule (c): a role_id or active change made by a real user (not the
-- service role) may only touch a profile whose CURRENT role ranks strictly
-- below the actor's (a lower rank number is more senior). A profile with no
-- role holds no permissions and may be changed by any ranked manager. A role
-- with no rank, or an actor with no ranked role, is refused. This mirrors
-- canActOn in lib/auth/rank-guard.ts. Same rank is refused on purpose: two
-- Directors cannot demote or deactivate each other.
--
-- Callers checked: assignRole and updateProfile (people.manage, now also
-- rank-guarded in the app); inviteUser (target is a brand-new account on the
-- lowest role, so it passes); stampPassport (an enrollee who outranks the
-- stamper was already refused by rule (b), since the passport's target role is
-- then senior to the stamper). The service-role client (bootstrapFirstAdmin,
-- scripts) stays exempt.
--
-- Every existing block is preserved verbatim. Idempotent: create-or-replace,
-- grants re-applied to match 20260926233807.

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
  old_rank int;
begin
  -- Identity/privileged columns on profiles: role_id, active, store_id, name.
  -- Changeable only by a people.manage holder or the service-role client.
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

  if (new.role_id is distinct from old.role_id or new.active is distinct from old.active)
     and not is_service_role then
    select r.rank into actor_rank
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = actor_id;

    -- (c) Only someone ranked strictly below you. A profile with no role is
    -- fair game; a role with a null rank, or an unranked actor, is refused.
    if old.role_id is not null then
      select rank into old_rank from public.roles where id = old.role_id;
      if actor_rank is null or old_rank is null or old_rank <= actor_rank then
        raise exception
          'insufficient privilege: you can only change people ranked below you'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- PPL1: role-assignment guards (unchanged).
  if new.role_id is distinct from old.role_id and not is_service_role then
    -- (a) You cannot change your own role.
    if new.id = actor_id then
      raise exception
        'insufficient privilege: you cannot change your own role'
        using errcode = '42501';
    end if;

    -- (b) You cannot assign a role senior to your own.
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

revoke all on function public.enforce_profile_privilege_guard() from public, anon, authenticated;
