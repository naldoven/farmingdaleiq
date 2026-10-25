-- Waste costs and item setup become managers-only (owner decision, Naldo,
-- 2026-10-25): Shift Supervisors lose waste.manage.
--
-- waste.manage gates the waste admin side: creating, editing and deleting
-- waste items and categories (including each item's unit cost) and deleting
-- a logged entry. The server actions in app/(app)/waste/actions.ts call
-- requirePermission('waste.manage') before any of those writes, and the RLS
-- policies in 20260707010500_waste_rls.sql and 20260801000000_waste_hardening.sql
-- re-check the same key.
--
-- The seed (20260707001900_seed_store_config.sql) put waste.manage in
-- supervisor_keys, so it started at Shift Supervisor and every tier above
-- inherited it. After this migration it starts at Operations Lead:
-- Operations Lead, Assistant Director, Director and Location Manager keep it.
--
-- waste.log (counting waste) is a base key held by every role and is NOT
-- touched here. Trainers, Team Leaders and Shift Supervisors keep logging
-- waste exactly as before; only the manage side moves up.
--
-- The role is matched by its exact seeded name. Idempotent: a re-run finds no
-- row to delete.

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.name = 'Shift Supervisor'
  and rp.permission_key = 'waste.manage';
