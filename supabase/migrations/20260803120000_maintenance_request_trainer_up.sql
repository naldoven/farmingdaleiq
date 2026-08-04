-- Maintenance requests become trainer-and-above (leader decision
-- 2026-08-03; supersedes the original "any team member submits" spec in
-- ARCHITECTURE.md "Requests" and the base_keys grant in
-- 20260707001900_seed_store_config.sql).
--
-- Dropping maintenance.request from the below-trainer roles removes, in one
-- move: the whole Maintenance section (every /maintenance* page and the nav
-- entries require this key), request submission and work-order comments
-- (server actions and the RLS insert policies in
-- 20260707012000_vendors_maintenance_rls.sql re-check it), and photo
-- uploads (storage policy maintenance_photos_insert_requester in
-- 20260803000000_maintenance_photos_bucket.sql).
--
-- Matched by rank, not name: ranks 1-8 run Location Manager down through
-- BOH Trainer, so rank >= 9 is exactly the below-trainer tier (FOH Brand
-- Ambassadors, Team Member) even if a role is later renamed.

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and rp.permission_key = 'maintenance.request'
  and r.rank >= 9;
