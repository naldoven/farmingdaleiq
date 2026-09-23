-- Vendor settings access
-- Anyone with directory access can add, edit, deactivate/reactivate, and
-- delete unlinked vendor records. Server actions use vendors.view and this
-- policy keeps RLS in sync.

drop policy if exists vendors_write_manager on public.vendors;

create policy vendors_write_directory_access on public.vendors
  for all
  using (public.has_permission('vendors.view'))
  with check (public.has_permission('vendors.view'));
