-- Public maintenance portal: anonymous submissions are written only through
-- the server-side route handler, so this migration intentionally adds no
-- anon RLS policy. The client-generated id makes a retry of the same form
-- submission idempotent without attributing a request to a staff account.

alter table public.maintenance_requests
  add column if not exists public_submission_id uuid;

create unique index if not exists maintenance_requests_public_submission_id_uq
  on public.maintenance_requests (public_submission_id)
  where public_submission_id is not null;
