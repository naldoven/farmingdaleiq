-- Notifications & Discord
-- ARCHITECTURE.md "Data model (Postgres)" > Notifications, Discord

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- webhook_url is server-side only: no RLS SELECT policy exposes it to the
-- browser (P1 S10 owns the RLS policies for this table).
create table public.discord_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  webhook_url text not null,
  purpose text,
  active boolean not null default true
);

create table public.discord_event_routes (
  event_key text primary key,
  channel_id uuid references public.discord_channels(id),
  enabled boolean not null default true
);

create table public.discord_outbox (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.discord_channels(id),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- notify_discord + discord_channel_id columns, per ARCHITECTURE.md Discord section
alter table public.tasks
  add column notify_discord boolean not null default false,
  add column discord_channel_id uuid references public.discord_channels(id);

alter table public.task_templates
  add column notify_discord boolean not null default false,
  add column discord_channel_id uuid references public.discord_channels(id);

alter table public.checklist_schedules
  add column notify_discord boolean not null default false,
  add column discord_channel_id uuid references public.discord_channels(id);

alter table public.work_orders
  add column notify_discord boolean not null default false,
  add column discord_channel_id uuid references public.discord_channels(id);

alter table public.pm_schedules
  add column notify_discord boolean not null default false,
  add column discord_channel_id uuid references public.discord_channels(id);
