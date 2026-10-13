-- Accountability records are an append-only audit trail. All supported
-- writes go through the permission-checked server action, which uses the
-- service role only after validating the recipient, active type, point value,
-- issuer, and duplicate-submission guard. Leaving direct table write policies
-- in place let an accountability.issue holder bypass those safeguards through
-- PostgREST, including forging points or issued_by.
--
-- Do not run this migration manually in production. It is applied through the
-- normal reviewed deployment migration process.

drop policy if exists infractions_insert_issuer on public.infractions;
drop policy if exists infractions_write_manager on public.infractions;
drop policy if exists infractions_delete_manager on public.infractions;
