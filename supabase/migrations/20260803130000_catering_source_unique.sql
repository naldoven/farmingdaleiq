-- Enforce the inbound-email duplicate guard in the database.
--
-- app/api/inbound/catering/route.ts dedupes by check-then-insert on
-- catering_orders.source ("email:<gmailMessageId>"), which has a race: two
-- overlapping Apps Script deliveries of the same email can both pass the
-- SELECT before either INSERTs (observed 2026-08-04: order
-- email:19fc6106f089d1dc landed twice, ~200ms apart, during the label-reset
-- backfill). A partial unique index closes the gap for email-sourced rows;
-- the loser of the race now gets a unique-violation error, the Apps Script
-- sees a non-200 and leaves the thread labeled/retried per its own logic,
-- and no duplicate order exists either way.
--
-- Partial, not full: manually created orders all share source = 'manual'
-- (app/(app)/catering/actions.ts createOrder), which must stay repeatable.

create unique index if not exists catering_orders_source_email_unique
  on public.catering_orders (source)
  where source like 'email:%';
