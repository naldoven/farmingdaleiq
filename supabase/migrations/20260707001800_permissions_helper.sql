-- has_permission(key) SQL helper
-- ARCHITECTURE.md "Technical architecture": "RLS policies check permission
-- membership via a has_permission(key) SQL helper."
--
-- security definer: profiles/role_permissions are default-deny under RLS
-- (see 900_rls_default_deny.sql), so this function must bypass RLS to read
-- the current user's role. It only ever returns a boolean derived from
-- auth.uid(), so it cannot be used to read anyone else's data.

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid()
      and p.active = true
      and rp.permission_key = has_permission.permission_key
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- current_store_id(): security-definer helper so store-scoped RLS policies
-- (e.g. on profiles) don't have to self-reference public.profiles from
-- inside a profiles policy, which would recurse.
create or replace function public.current_store_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select store_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_store_id() from public;
grant execute on function public.current_store_id() to authenticated;
