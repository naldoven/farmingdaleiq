-- catering.override: manager-only undo for the catering pipeline.
--
-- The pipeline is forward-only (app/(app)/catering/logic.ts
-- cateringStageAdvanceError), and shift leaders hold catering.manage, so
-- moving an order back one step or restoring a cancelled order needs its own
-- key. The two server actions that use it (moveOrderBack, restoreOrder in
-- app/(app)/catering/actions.ts) call requirePermission('catering.override')
-- before any write, and the UI hides their controls from anyone without it.
--
-- Safe to deploy the code first: until this runs no role holds the key,
-- has_permission('catering.override') returns false, the actions refuse, and
-- the controls stay hidden.
--
-- Granted to every role that holds roles.manage today (in the seed,
-- 20260707001900_seed_store_config.sql: Location Manager and Director), read
-- from the live grants rather than hard-coded names so a role an admin has
-- since given roles.manage in the matrix gets it too. The writes themselves
-- still go through the catering_orders / catering_followups RLS policies,
-- which require catering.manage; both of those roles hold it.
--
-- Same insert shape as the role_permissions seed. Idempotent: role_permissions
-- has primary key (role_id, permission_key), so a re-run inserts nothing.

insert into public.role_permissions (role_id, permission_key)
select r.id, 'catering.override'
from public.roles r
where exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_key = 'roles.manage'
)
on conflict (role_id, permission_key) do nothing;
