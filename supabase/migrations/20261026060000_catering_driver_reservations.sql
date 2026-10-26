-- Catering driver reservations (ARCHITECTURE.md "Catering" > "Driver
-- reservations" and "Driver reminders"). Delivery orders need a driver
-- reserved in Roadway or ezCater; neither talks to this app, so a leader
-- marks the reservation here and the every-minute cron
-- (app/api/cron/catering-drivers) reminds the posted shift leader until they
-- do.
--
-- Deploy order: safe before the code. Nothing reads these tables until the
-- Drivers page and the cron ship, and the new column has a default.

-- Platform -------------------------------------------------------------------
-- Which app the driver is reserved in. ezCater orders are re-keyed into CFA
-- online and arrive through the same email ingest, so the app cannot tell
-- them apart; a leader flips the order. It is order detail, so it rides the
-- existing catering_orders policies (catering.manage), like every other field.

alter table public.catering_orders
  add column if not exists delivery_platform text not null default 'roadway';

alter table public.catering_orders
  add constraint catering_orders_delivery_platform_check
    check (delivery_platform in ('roadway', 'ezcater'));

-- Tables ---------------------------------------------------------------------

create table public.catering_drivers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  car_size text not null default 'small' check (car_size in ('small', 'large')),
  has_roadway_app boolean not null default false,
  has_ezcater_app boolean not null default false,
  active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Add/remove only (no update policy). The primary key makes marking the same
-- driver twice a no-op, which is the double-tap guard.
create table public.catering_order_drivers (
  order_id uuid not null references public.catering_orders(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reserved_by uuid references public.profiles(id),
  reserved_at timestamptz not null default now(),
  primary key (order_id, profile_id)
);

create index catering_order_drivers_profile_idx
  on public.catering_order_drivers (profile_id);

-- One row per reminder per order. The cron runs every minute and two runs can
-- overlap, so it inserts these with on-conflict-do-nothing and only sends for
-- the rows its own insert returned: the unique key is the once-only guard.
-- folded = due but not sent, because a leader was pinged about the same order
-- moments earlier. The scorecard reads escalations and recipients from here.
create table public.catering_driver_reminders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.catering_orders(id) on delete cascade,
  kind text not null check (kind in (
    'night_ping',
    'night_last_call',
    'night_escalation',
    'morning_ping',
    'morning_last_call',
    'arrival',
    'before_60',
    'before_30_escalation'
  )),
  recipient_ids uuid[] not null default '{}',
  folded boolean not null default false,
  sent_at timestamptz not null default now(),
  unique (order_id, kind)
);

create index catering_driver_reminders_sent_at_idx
  on public.catering_driver_reminders (sent_at);

-- Single row (id is always true), so "who gets escalations" is one setting.
-- reminders_live_from is stamped when this migration runs. On day one every
-- delivery is unreserved in FIQ, even ones already reserved in Roadway, so
-- the cron skips orders whose night pass ran before go-live (unless they
-- arrived after it) instead of escalating all of today's deliveries at once.
create table public.catering_driver_settings (
  id boolean primary key default true check (id),
  escalation_profile_id uuid references public.profiles(id) on delete set null,
  reminders_live_from timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.catering_driver_settings (id)
values (true)
on conflict (id) do nothing;

-- RLS ------------------------------------------------------------------------
-- Reads follow the rest of catering (catering.view). Writes need
-- catering.drivers, granted below to Shift Supervisor and above. Reminder rows
-- are written only by the cron's service-role client, so they get no write
-- policy at all.

alter table public.catering_drivers enable row level security;
alter table public.catering_order_drivers enable row level security;
alter table public.catering_driver_reminders enable row level security;
alter table public.catering_driver_settings enable row level security;

create policy catering_drivers_select on public.catering_drivers
  for select to authenticated
  using (public.has_permission('catering.view') or public.has_permission('catering.drivers'));

create policy catering_drivers_write on public.catering_drivers
  for all to authenticated
  using (public.has_permission('catering.drivers'))
  with check (public.has_permission('catering.drivers'));

create policy catering_order_drivers_select on public.catering_order_drivers
  for select to authenticated
  using (public.has_permission('catering.view') or public.has_permission('catering.drivers'));

-- The action checks the same two things; repeating them here means a direct
-- insert cannot reserve someone off the roster or put a driver on a pickup or
-- closed order.
create policy catering_order_drivers_insert on public.catering_order_drivers
  for insert to authenticated
  with check (
    public.has_permission('catering.drivers')
    and exists (
      select 1
      from public.catering_drivers d
      where d.profile_id = catering_order_drivers.profile_id
        and d.active
    )
    and exists (
      select 1
      from public.catering_orders o
      where o.id = catering_order_drivers.order_id
        and o.fulfillment = 'delivery'
        and o.stage in ('new', 'confirm', 'setup', 'out')
    )
  );

create policy catering_order_drivers_delete on public.catering_order_drivers
  for delete to authenticated
  using (public.has_permission('catering.drivers'));

create policy catering_driver_reminders_select on public.catering_driver_reminders
  for select to authenticated
  using (public.has_permission('catering.view') or public.has_permission('catering.drivers'));

create policy catering_driver_settings_select on public.catering_driver_settings
  for select to authenticated
  using (public.has_permission('catering.view') or public.has_permission('settings.manage'));

create policy catering_driver_settings_update on public.catering_driver_settings
  for update to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

-- Permission -----------------------------------------------------------------
-- Shift Supervisor and above, read from role rank rather than a list of
-- names so a re-ranked or renamed senior role keeps it. Idempotent:
-- role_permissions has primary key (role_id, permission_key).

insert into public.role_permissions (role_id, permission_key)
select r.id, 'catering.drivers'
from public.roles r
where r.rank is not null
  and r.rank <= (select s.rank from public.roles s where s.name = 'Shift Supervisor')
on conflict (role_id, permission_key) do nothing;

-- Event keys -----------------------------------------------------------------
-- app_events_insert_authenticated lets any signed-in user insert an unlisted
-- key, and these three fan out as pushes and Discord posts. Reminders and
-- escalations come only from the cron's service-role client (which bypasses
-- RLS), so no signed-in user may insert them; otherwise anyone could push
-- made-up text to the escalation contact and the leaders channel. The driver
-- notice needs the same key as the action that sends it. Every other branch
-- is copied unchanged from 20260801000000_waste_hardening.sql, the policy's
-- last definition.

drop policy if exists app_events_insert_authenticated on public.app_events;
create policy app_events_insert_authenticated on public.app_events
  for insert to authenticated with check (
    case event_key
      when 'recognition' then public.has_permission('tokens.award')
      when 'gift_sent' then public.has_permission('tokens.gift')
      when 'reward_claim' then public.has_permission('rewards.claim')
      when 'top_performer' then public.has_permission('setups.post')
      when 'broadcast' then public.has_permission('feed.post_broadcast')
      when 'infraction_issued' then
        (public.has_permission('accountability.issue') or public.has_permission('accountability.manage'))
      when 'disciplinary_triggered' then
        (public.has_permission('accountability.issue') or public.has_permission('accountability.manage'))
      when 'waste_logged' then public.has_permission('waste.log')
      when 'waste_entry_deleted' then public.has_permission('waste.manage')
      when 'waste_item_changed' then public.has_permission('waste.manage')
      when 'waste_category_changed' then public.has_permission('waste.manage')
      when 'catering_driver_reminder' then false
      when 'catering_driver_escalation' then false
      when 'catering_driver_assigned' then public.has_permission('catering.drivers')
      else true
    end
  );

-- Discord routes -------------------------------------------------------------
-- Leader reminders post where new catering orders already post; escalations
-- post where overdue tasks already post (the leaders channel). Both stay
-- editable in /settings/discord, and a route set by hand is left alone.

insert into public.discord_event_routes (event_key, channel_id, enabled)
select 'catering_driver_reminder', r.channel_id, r.enabled
from public.discord_event_routes r
where r.event_key = 'catering_order_new'
on conflict (event_key) do nothing;

insert into public.discord_event_routes (event_key, channel_id, enabled)
select 'catering_driver_escalation', r.channel_id, r.enabled
from public.discord_event_routes r
where r.event_key = 'task_overdue'
on conflict (event_key) do nothing;
