-- Guest Recovery, second round (ARCHITECTURE.md "Guest Recovery"): a required
-- reason per recovery, the Spotlight path for guests who have the Chick-fil-A
-- app (no QR, a named overseer sends the reward by hand), QR expiry, the
-- settings that drive both, and repeat-guest counts.
--
-- Deploy order: safe before the code. New columns have defaults, and the old
-- log_guest_recovery is replaced by one with two more arguments, so the code
-- that calls the new one must ship with (or right after) this migration.

-- Columns -----------------------------------------------------------------------
-- reason is null on rows logged before this migration (shown as "Not
-- recorded"); the log function below requires it for every new row.
-- expires_at is backfilled from each row's own created_at.

alter table public.guest_recoveries
  add column if not exists reason text
    check (reason is null or reason in ('missing_item', 'wrong_item', 'quality', 'too_slow', 'other')),
  add column if not exists path text not null default 'standard'
    check (path in ('standard', 'spotlight')),
  add column if not exists expires_at timestamptz,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  -- Set when a Spotlight recovery is switched to the normal message, so a retry
  -- after a crash between the switch and the send still finishes the send.
  add column if not exists switched_at timestamptz;

-- A code is good through the END of its last day in the store's time zone, so
-- "Good until Jan 31" really works all day Jan 31. Internal helper: the
-- definer functions below call it; nobody else needs to.
create or replace function public.guest_recovery_expiry(p_base timestamptz, p_days int)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.stores limit 1), 'America/New_York') as name
  )
  select (((p_base at time zone (select name from tz))::date + p_days + 1)::timestamp
          at time zone (select name from tz)) - interval '1 microsecond';
$$;

revoke all on function public.guest_recovery_expiry(timestamptz, int) from public, anon, authenticated;

update public.guest_recoveries
set expires_at = public.guest_recovery_expiry(created_at, 90)
where expires_at is null;

alter table public.guest_recoveries
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '90 days');

create index if not exists guest_recoveries_spotlight_idx
  on public.guest_recoveries (assigned_to, created_at)
  where status = 'owed' and path = 'spotlight';

-- Settings ------------------------------------------------------------------------
-- One row. Changed only through save_guest_recovery_settings and
-- set_guest_recovery_overseer_off below, so an overseer is always someone who
-- can actually work the list.

create table public.guest_recovery_settings (
  id boolean primary key default true check (id),
  expiry_days int not null default 90 check (expiry_days between 7 and 365),
  overseer_id uuid references public.profiles(id) on delete set null,
  backup_id uuid references public.profiles(id) on delete set null,
  overseer_off boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.guest_recovery_settings (id) values (true) on conflict (id) do nothing;

alter table public.guest_recovery_settings enable row level security;

create policy guest_recovery_settings_select on public.guest_recovery_settings
  for select to authenticated
  using (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));

-- No insert, update or delete policy: see the functions below.

-- Sends: a switch from Spotlight to the normal message ------------------------------
-- A guest whose app account did not come up gets the normal email, text and QR.
-- That send is its own kind so it is not blocked by the 30-second resend guard
-- (the Spotlight message may have gone seconds ago) and still happens once.

alter table public.guest_recovery_sends
  drop constraint if exists guest_recovery_sends_kind_check;
alter table public.guest_recovery_sends
  add constraint guest_recovery_sends_kind_check check (kind in ('initial', 'resend', 'switch'));

create unique index if not exists guest_recovery_sends_switch_once
  on public.guest_recovery_sends (recovery_id, channel)
  where kind = 'switch';

create or replace function public.claim_guest_recovery_send(
  p_recovery_id uuid,
  p_channel text,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_channel not in ('email', 'sms') or p_kind not in ('initial', 'resend', 'switch') then
    raise exception 'Unknown channel or kind' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('guest_recovery_send:' || p_recovery_id::text || ':' || p_channel));

  if p_kind = 'initial' then
    insert into public.guest_recovery_sends (recovery_id, channel, kind)
    values (p_recovery_id, p_channel, 'initial')
    on conflict (recovery_id, channel) where kind = 'initial' do nothing
    returning id into v_id;
    return v_id;
  end if;

  if p_kind = 'switch' then
    insert into public.guest_recovery_sends (recovery_id, channel, kind)
    values (p_recovery_id, p_channel, 'switch')
    on conflict (recovery_id, channel) where kind = 'switch' do nothing
    returning id into v_id;
    return v_id;
  end if;

  if exists (
    select 1 from public.guest_recovery_sends s
    where s.recovery_id = p_recovery_id
      and s.channel = p_channel
      and s.created_at > now() - interval '30 seconds'
  ) then
    return null;
  end if;

  insert into public.guest_recovery_sends (recovery_id, channel, kind)
  values (p_recovery_id, p_channel, 'resend')
  returning id into v_id;
  return v_id;
end;
$$;

-- Logging ----------------------------------------------------------------------------
-- Replaces the 8-argument version. Every field a leader must give is checked
-- here too (phone, email, order number, reason), not only in the app, for rows
-- written from now on. A Spotlight recovery is assigned to the overseer, or to
-- the backup while the overseer is marked off. Expiry comes from the setting
-- and applies to new recoveries only.

drop function if exists public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb);

create or replace function public.log_guest_recovery(
  p_submission_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_order_number text,
  p_note text,
  p_sms_consent boolean,
  p_items jsonb,
  p_reason text,
  p_path text
)
returns table (out_id uuid, out_created boolean, out_assigned_to uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_assigned uuid;
  v_item jsonb;
  v_menu public.recovery_menu_items;
  v_qty int;
  v_name text;
  v_settings public.guest_recovery_settings;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to log a guest recovery' using errcode = '42501';
  end if;

  select r.id, r.assigned_to into v_id, v_assigned
  from public.guest_recoveries r
  where r.submission_id = p_submission_id and r.logged_by = auth.uid();
  if v_id is not null then
    return query select v_id, false, v_assigned;
    return;
  end if;

  if nullif(btrim(p_guest_email), '') is null then
    raise exception 'Enter the guest''s email' using errcode = '22023';
  end if;
  if nullif(btrim(p_guest_phone), '') is null then
    raise exception 'Enter the guest''s phone number' using errcode = '22023';
  end if;
  if nullif(btrim(p_order_number), '') is null then
    raise exception 'Enter the order number' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('missing_item', 'wrong_item', 'quality', 'too_slow', 'other') then
    raise exception 'Pick a reason' using errcode = '22023';
  end if;
  if p_path is null or p_path not in ('standard', 'spotlight') then
    raise exception 'Pick whether the guest has the Chick-fil-A app' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Pick at least one missing item (up to 20)' using errcode = '22023';
  end if;

  select * into v_settings from public.guest_recovery_settings where id;

  -- A Spotlight recovery goes to the overseer, or the backup while the overseer
  -- is off. Someone who has left or lost access is skipped, so a reward is never
  -- assigned to a person who cannot send it.
  v_assigned := null;
  if p_path = 'spotlight' then
    if not v_settings.overseer_off
       and v_settings.overseer_id is not null
       and public.guest_recovery_can_work(v_settings.overseer_id) then
      v_assigned := v_settings.overseer_id;
    elsif v_settings.backup_id is not null
       and public.guest_recovery_can_work(v_settings.backup_id) then
      v_assigned := v_settings.backup_id;
    end if;
  end if;

  begin
    insert into public.guest_recoveries (
      submission_id, guest_name, guest_email, guest_phone, order_number, note, sms_consent,
      logged_by, reason, path, expires_at, assigned_to
    ) values (
      p_submission_id,
      btrim(p_guest_name),
      nullif(lower(btrim(p_guest_email)), ''),
      nullif(btrim(p_guest_phone), ''),
      nullif(btrim(p_order_number), ''),
      nullif(btrim(p_note), ''),
      coalesce(p_sms_consent, false),
      auth.uid(),
      p_reason,
      p_path,
      public.guest_recovery_expiry(now(), coalesce(v_settings.expiry_days, 90)),
      v_assigned
    ) returning id into v_id;
  exception when unique_violation then
    select r.id, r.assigned_to into v_id, v_assigned
    from public.guest_recoveries r
    where r.submission_id = p_submission_id and r.logged_by = auth.uid();
    if v_id is null then
      raise exception 'That recovery id is already in use' using errcode = '23505';
    end if;
    return query select v_id, false, v_assigned;
    return;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'qty', '1') !~ '^[0-9]{1,2}$' then
      raise exception 'Each quantity must be a whole number from 1 to 20' using errcode = '22023';
    end if;
    v_qty := coalesce(v_item ->> 'qty', '1')::int;
    if v_qty not between 1 and 20 then
      raise exception 'Each quantity must be a whole number from 1 to 20' using errcode = '22023';
    end if;

    if nullif(v_item ->> 'menu_item_id', '') is not null then
      if v_item ->> 'menu_item_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'That menu item is not available' using errcode = '22023';
      end if;
      select * into v_menu
      from public.recovery_menu_items m
      where m.id = (v_item ->> 'menu_item_id')::uuid and m.active;
      if not found then
        raise exception 'That menu item is not available' using errcode = '22023';
      end if;
      insert into public.guest_recovery_items (recovery_id, menu_item_id, name, family, qty)
      values (v_id, v_menu.id, v_menu.name, v_menu.family, v_qty);
    else
      v_name := btrim(coalesce(v_item ->> 'name', ''));
      if char_length(v_name) not between 1 and 80 then
        raise exception 'Name each "other" item (up to 80 characters)' using errcode = '22023';
      end if;
      insert into public.guest_recovery_items (recovery_id, menu_item_id, name, family, qty)
      values (v_id, null, v_name, 'Other', v_qty);
    end if;
  end loop;

  return query select v_id, true, v_assigned;
end;
$$;

revoke all on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb, text, text)
  to authenticated;

-- Spotlight: hand it to someone else, or switch the guest to the normal message ------------

-- Someone who can work the list: an active profile whose role holds the key.
create or replace function public.guest_recovery_can_work(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = p_profile and p.active and rp.permission_key = 'guest_recovery.log'
  );
$$;

revoke all on function public.guest_recovery_can_work(uuid) from public, anon, authenticated;
grant execute on function public.guest_recovery_can_work(uuid) to service_role;

-- Tags someone else in on a Spotlight recovery that is still owed. Allowed for
-- its current assignee, for anyone when it has no assignee, and for managers.
-- Returns 'assigned', 'not_found', 'not_spotlight', 'not_owed', 'not_allowed' or
-- 'bad_assignee'.
create or replace function public.assign_guest_recovery(p_id uuid, p_assignee uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.guest_recoveries;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to hand over a recovery' using errcode = '42501';
  end if;

  select * into v_row from public.guest_recoveries where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v_row.path <> 'spotlight' then return 'not_spotlight'; end if;
  if v_row.status <> 'owed' then return 'not_owed'; end if;
  if v_row.assigned_to is not null
     and v_row.assigned_to <> auth.uid()
     and not public.has_permission('guest_recovery.manage') then
    return 'not_allowed';
  end if;
  if p_assignee is null or not public.guest_recovery_can_work(p_assignee) then
    return 'bad_assignee';
  end if;

  update public.guest_recoveries set assigned_to = p_assignee where id = p_id;
  return 'assigned';
end;
$$;

revoke all on function public.assign_guest_recovery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_guest_recovery(uuid, uuid) to authenticated;

-- Switches an owed Spotlight recovery to the normal path (the guest's app
-- account did not come up): clears the assignee and starts a fresh expiry,
-- since the guest is only now getting a code. Returns 'switched'; or, on a
-- retry, 'already_switched' (it was switched before, so the server finishes any
-- send that never went) or 'already_standard' (it never was Spotlight); or
-- 'not_owed' / 'not_found'. Sending the message is the server's job afterwards
-- (kind 'switch').
create or replace function public.switch_guest_recovery_to_standard(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.guest_recoveries;
  v_days int;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to change a recovery' using errcode = '42501';
  end if;

  select * into v_row from public.guest_recoveries where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v_row.status <> 'owed' then return 'not_owed'; end if;
  if v_row.path = 'standard' then
    return case when v_row.switched_at is not null then 'already_switched' else 'already_standard' end;
  end if;

  select expiry_days into v_days from public.guest_recovery_settings where id;
  update public.guest_recoveries
  set path = 'standard',
      assigned_to = null,
      switched_at = now(),
      expires_at = public.guest_recovery_expiry(now(), coalesce(v_days, 90))
  where id = p_id;
  return 'switched';
end;
$$;

revoke all on function public.switch_guest_recovery_to_standard(uuid) from public, anon, authenticated;
grant execute on function public.switch_guest_recovery_to_standard(uuid) to authenticated;

-- Settings changes ----------------------------------------------------------------------

-- Managers set the expiry, the overseer and the backup. Both people must be
-- able to work the list. Applies to new recoveries only. Returns 'saved' or
-- 'bad_person'.
create or replace function public.save_guest_recovery_settings(
  p_expiry_days int,
  p_overseer uuid,
  p_backup uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.manage') then
    raise exception 'You do not have permission to change these settings' using errcode = '42501';
  end if;
  if p_expiry_days is null or p_expiry_days not between 7 and 365 then
    raise exception 'Expiry must be between 7 and 365 days' using errcode = '22023';
  end if;
  if (p_overseer is not null and not public.guest_recovery_can_work(p_overseer))
     or (p_backup is not null and not public.guest_recovery_can_work(p_backup)) then
    return 'bad_person';
  end if;

  update public.guest_recovery_settings
  set expiry_days = p_expiry_days,
      -- Naming a different overseer starts them "on": the old person's day off
      -- must not silence the new one.
      overseer_off = case when overseer_id is distinct from p_overseer then false else overseer_off end,
      overseer_id = p_overseer,
      backup_id = p_backup,
      updated_by = auth.uid(),
      updated_at = now()
  where id;
  return 'saved';
end;
$$;

revoke all on function public.save_guest_recovery_settings(int, uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_guest_recovery_settings(int, uuid, uuid) to authenticated;

-- The overseer marks themselves off (or back on) so new Spotlight recoveries go
-- to the backup. Allowed for the overseer and for managers.
create or replace function public.set_guest_recovery_overseer_off(p_off boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overseer uuid;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to change these settings' using errcode = '42501';
  end if;
  select overseer_id into v_overseer from public.guest_recovery_settings where id;
  if v_overseer is distinct from auth.uid() and not public.has_permission('guest_recovery.manage') then
    return 'not_allowed';
  end if;
  update public.guest_recovery_settings
  set overseer_off = coalesce(p_off, false), updated_by = auth.uid(), updated_at = now()
  where id;
  return 'saved';
end;
$$;

revoke all on function public.set_guest_recovery_overseer_off(boolean) from public, anon, authenticated;
grant execute on function public.set_guest_recovery_overseer_off(boolean) to authenticated;

-- Repeat guests -----------------------------------------------------------------------------
-- A repeat is another recovery, not voided, for the same phone or email in the
-- 90 days before this one. Phones are already E.164 and emails lower-cased on the
-- way in. These return counts only, never contact details.

create or replace function public.guest_recovery_prior_counts(p_ids uuid[])
returns table (out_id uuid, out_prior int)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
    (
      select count(*)::int
      from public.guest_recoveries o
      where o.id <> r.id
        and o.status <> 'void'
        and o.created_at < r.created_at
        and o.created_at >= r.created_at - interval '90 days'
        and (
          (r.guest_phone is not null and o.guest_phone = r.guest_phone)
          or (r.guest_email is not null and o.guest_email = r.guest_email)
        )
    )
  from public.guest_recoveries r
  where r.id = any (p_ids)
    and (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));
$$;

revoke all on function public.guest_recovery_prior_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.guest_recovery_prior_counts(uuid[]) to authenticated;

-- For the stats screen (managers): of the recoveries logged in [p_from, p_to),
-- how many were repeats, and how many different guests that was.
create or replace function public.guest_recovery_repeat_summary(p_from timestamptz, p_to timestamptz)
returns table (repeat_recoveries int, repeat_guests int)
language sql
stable
security definer
set search_path = public
as $$
  with repeats as (
    select r.id, coalesce(r.guest_phone, r.guest_email) as guest_key
    from public.guest_recoveries r
    where r.created_at >= p_from and r.created_at < p_to
      and r.status <> 'void'
      and public.has_permission('guest_recovery.manage')
      and exists (
        select 1
        from public.guest_recoveries o
        where o.id <> r.id
          and o.status <> 'void'
          and o.created_at < r.created_at
          and o.created_at >= r.created_at - interval '90 days'
          and (
            (r.guest_phone is not null and o.guest_phone = r.guest_phone)
            or (r.guest_email is not null and o.guest_email = r.guest_email)
          )
      )
  )
  select count(*)::int, count(distinct guest_key)::int from repeats;
$$;

revoke all on function public.guest_recovery_repeat_summary(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.guest_recovery_repeat_summary(timestamptz, timestamptz) to authenticated;

-- Event key ----------------------------------------------------------------------------------
-- The notice that a Spotlight reward is waiting reaches the assignee in-app. It is
-- written only by the server's service-role client (which bypasses RLS), so no
-- signed-in user may insert it: otherwise anyone could push text to the overseer.
-- Every other branch is copied unchanged from
-- 20261026070000_cleaning_finds_and_trend.sql, the policy's last definition.

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
      when 'cleaning_daily_summary' then false
      when 'cleaning_week_published' then false
      when 'cleaning_misses' then false
      when 'cleaning_plan_reminder' then false
      when 'cleaning_atd_find' then (
        exists (
          select 1 from public.cleaning_atd_finds f
          where f.id::text = payload ->> 'findId'
            and f.posted_by = auth.uid()
        )
        and (payload - array['findId', 'title', 'message', 'image_url']) = '{}'::jsonb
        and not public.cleaning_find_announced(payload ->> 'findId')
      )
      when 'guest_recovery_spotlight' then false
      else true
    end
  );
