-- Close a token double-mint hole and its whole grant-class.
--
-- THE HOLE (proven live): public.token_processed_events shipped with RLS
-- DISABLED and anon+authenticated retained their full default grants,
-- including TRUNCATE, while the table is PostgREST-exposed. It is the token
-- ledger's idempotency guard: the tokens cron (app/api/cron/tokens/route.ts)
-- records "has this event already minted tokens" here. Any anon caller could
-- DELETE or TRUNCATE the guard and force already-processed token-earning
-- events to reprocess = double-mint.
--
-- The earlier tokens RLS migration (20260707030000) assumed this table "keeps
-- the plain default-deny policy from P0", but no default-deny policy and no
-- `enable row level security` ever actually landed on it, so it was wide open.
--
-- Why locking it is safe: redeem_reward()/gift_tokens() are SECURITY DEFINER
-- owned by postgres (which has BYPASSRLS), and the cron path runs as
-- service_role (also BYPASSRLS). None of those code paths depend on the
-- anon/authenticated grants or on RLS being permissive, so revoking app-role
-- access and enabling default-deny does not break the ledger or the cron.
--
-- KEY SUBTLETY handled below: RLS default-deny stops DML (select/insert/
-- update/delete) for anon/authenticated, but TRUNCATE is a TABLE privilege and
-- is NEVER governed by RLS. A table can be RLS-locked yet still TRUNCATE-able
-- by any role that holds the TRUNCATE grant. So the fix does BOTH: it locks
-- this one table hard, and it sweeps TRUNCATE off the entire public schema for
-- these roles (they never legitimately need TRUNCATE anywhere), including
-- future tables via ALTER DEFAULT PRIVILEGES.
--
-- Idempotent: policy is dropped-if-exists before creation; REVOKEs and ALTER
-- DEFAULT PRIVILEGES ... REVOKE are naturally idempotent (revoking a privilege
-- that is already absent is a no-op).

-- =====================================================================
-- 1a. token_processed_events: enable RLS, default-deny, strip app grants.
-- =====================================================================
alter table public.token_processed_events enable row level security;

drop policy if exists token_processed_events_default_deny on public.token_processed_events;
create policy token_processed_events_default_deny on public.token_processed_events
  for all to public
  using (false)
  with check (false);

-- Removes INSERT/UPDATE/DELETE and, critically, TRUNCATE from the app roles.
-- The SECURITY DEFINER / service-role paths (BYPASSRLS owners) are unaffected.
revoke all privileges on public.token_processed_events from anon, authenticated;

-- =====================================================================
-- 1b. TRUNCATE-class sweep across the whole public schema.
-- anon/authenticated never legitimately need TRUNCATE on any table, and RLS
-- cannot protect against it, so strip it everywhere. This deliberately does
-- NOT touch select/insert/update/delete on the other tables -- those are
-- correctly RLS-filtered and the app depends on them.
-- =====================================================================
revoke truncate on all tables in schema public from anon, authenticated;

-- Future tables created in public must not re-grant TRUNCATE to these roles.
-- Set for both the migration role and postgres so tables created by either
-- owner inherit the restriction.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;
