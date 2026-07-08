-- FIQ parity R7 (Notifications #7, HIGH) and R39 (Tasks, MED): the event-drain
-- consumer (lib/notify/events.ts processAppEvents) and the tasks system-task
-- consumer both re-fetch a fixed oldest-N window of app_events every run with no
-- cursor. Once cumulative volume passes the window the window never advances and
-- every newer event is silently skipped forever.
--
-- Schema-only fix: a durable per-job processing cursor keyed by job name. The
-- notifications and tasks code lanes read and advance it; the pair
-- (last_event_at, last_event_id) pages forward over app_events(created_at, id),
-- which the existing app_events_event_key_created_at_idx already supports.
--
-- Written only by the service-role cron consumers (which bypass RLS), so the
-- table carries the codebase's standard permissive default-deny policy: no
-- authenticated/anon access, service role unaffected.
--
-- Idempotent: create-if-not-exists + drop-policy-if-exists before (re)create.

create table if not exists public.job_cursors (
  job_name text primary key,
  last_event_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz not null default now()
);

comment on table public.job_cursors is
  'Durable per-job processing cursor over app_events(created_at, id). Written only by service-role cron consumers; RLS default-deny for authenticated/anon.';

alter table public.job_cursors enable row level security;

drop policy if exists default_deny on public.job_cursors;
create policy default_deny on public.job_cursors
  for all using (false) with check (false);
