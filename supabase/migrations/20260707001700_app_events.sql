-- App event bus backing table (lib/events/bus.ts)
-- Not explicitly listed in ARCHITECTURE.md's Data model section, but
-- required by "Technical architecture" / PLAN.md P0 #4 (lib/events/bus.ts
-- writes to a Postgres app_events table; consumers subscribe by event key).

create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index app_events_event_key_created_at_idx
  on public.app_events (event_key, created_at desc);

create index app_events_unprocessed_idx
  on public.app_events (created_at)
  where processed_at is null;
