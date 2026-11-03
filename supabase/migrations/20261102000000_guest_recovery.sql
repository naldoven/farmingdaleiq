-- Guest Recovery (ARCHITECTURE.md "Guest Recovery"). A guest calls about a wrong
-- or missing order, a leader logs it, the guest gets a link and QR by email and
-- text, and a leader hands over the missed items on the next visit.
--
-- Deploy order: safe before the code. Nothing reads these tables until the
-- Guest Recovery screens ship.
--
-- Writes to guest_recoveries and its items go only through the three functions
-- below (no insert, update or delete policy for signed-in users), so a header
-- and its items are always saved together, the redeem token is always minted
-- here, and Given and Void can only move a recovery that is still owed.

-- Menu --------------------------------------------------------------------------
-- The recovery menu is its own list, separate from the catering menu. family
-- groups sizes of one item so reporting counts all Mac & Cheese together.

create table public.recovery_menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  family text not null check (char_length(btrim(family)) between 1 and 80),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  sort int not null default 0,
  active boolean not null default true
);

-- Recoveries ----------------------------------------------------------------------

create table public.guest_recoveries (
  id uuid primary key default gen_random_uuid(),
  -- The form makes this id once, so a double tap or a retry after a dropped
  -- connection finds the recovery it already made instead of making a second.
  submission_id uuid not null unique,
  -- 64 hex characters from two random uuids. Never an id, never sequential.
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    check (token ~ '^[0-9a-f]{64}$'),
  guest_name text not null check (char_length(btrim(guest_name)) between 1 and 80),
  guest_email text check (
    guest_email is null
    or (char_length(guest_email) <= 254 and guest_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  -- E.164, US numbers only. The app normalizes before it gets here.
  guest_phone text check (guest_phone is null or guest_phone ~ '^\+1[2-9][0-9]{9}$'),
  order_number text check (order_number is null or char_length(order_number) <= 40),
  note text check (note is null or char_length(note) <= 300),
  sms_consent boolean not null default false,
  status text not null default 'owed' check (status in ('owed', 'given', 'void')),
  logged_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  given_at timestamptz,
  given_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  constraint guest_recoveries_has_contact check (guest_email is not null or guest_phone is not null),
  constraint guest_recoveries_given_consistent check ((status = 'given') = (given_at is not null)),
  constraint guest_recoveries_void_consistent check ((status = 'void') = (voided_at is not null))
);

create index guest_recoveries_status_created_idx
  on public.guest_recoveries (status, created_at);
create index guest_recoveries_created_idx
  on public.guest_recoveries (created_at desc);

create table public.guest_recovery_items (
  id uuid primary key default gen_random_uuid(),
  recovery_id uuid not null references public.guest_recoveries(id) on delete cascade,
  menu_item_id uuid references public.recovery_menu_items(id) on delete set null,
  -- Snapshots, so renaming or hiding a menu item does not rewrite history.
  name text not null check (char_length(btrim(name)) between 1 and 80),
  family text not null check (char_length(btrim(family)) between 1 and 80),
  qty int not null default 1 check (qty between 1 and 20)
);

create index guest_recovery_items_recovery_idx
  on public.guest_recovery_items (recovery_id);

-- One row per send attempt. Written only by the server's service-role client.
-- sending = claimed and not yet answered. A row stuck on sending means the
-- outcome is unknown (the request may have gone out), so it is never retried
-- automatically; a leader decides with Resend.
create table public.guest_recovery_sends (
  id uuid primary key default gen_random_uuid(),
  recovery_id uuid not null references public.guest_recoveries(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  kind text not null check (kind in ('initial', 'resend')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- The once-only guard: a recovery gets one initial email and one initial text,
-- however many times the confirm button is tapped.
create unique index guest_recovery_sends_initial_once
  on public.guest_recovery_sends (recovery_id, channel)
  where kind = 'initial';

create index guest_recovery_sends_recovery_idx
  on public.guest_recovery_sends (recovery_id, created_at desc);

-- Numbers the carrier said have opted out. Read and written only by the server.
create table public.guest_sms_optouts (
  phone text primary key check (phone ~ '^\+1[2-9][0-9]{9}$'),
  opted_out_at timestamptz not null default now()
);

-- RLS ----------------------------------------------------------------------------

alter table public.recovery_menu_items enable row level security;
alter table public.guest_recoveries enable row level security;
alter table public.guest_recovery_items enable row level security;
alter table public.guest_recovery_sends enable row level security;
alter table public.guest_sms_optouts enable row level security;

create policy recovery_menu_items_select on public.recovery_menu_items
  for select to authenticated
  using (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));

create policy recovery_menu_items_insert on public.recovery_menu_items
  for insert to authenticated
  with check (public.has_permission('guest_recovery.manage'));

-- Rename, re-sort and hide. There is no delete: old recoveries point at items.
create policy recovery_menu_items_update on public.recovery_menu_items
  for update to authenticated
  using (public.has_permission('guest_recovery.manage'))
  with check (public.has_permission('guest_recovery.manage'));

-- Guest name, email and phone are readable only by people who can log and hand
-- over recoveries, or who run the stats (which read the same rows). No write
-- policy on the next three: see the functions below.
create policy guest_recoveries_select on public.guest_recoveries
  for select to authenticated
  using (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));

create policy guest_recovery_items_select on public.guest_recovery_items
  for select to authenticated
  using (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));

create policy guest_recovery_sends_select on public.guest_recovery_sends
  for select to authenticated
  using (public.has_permission('guest_recovery.log') or public.has_permission('guest_recovery.manage'));

-- guest_sms_optouts: RLS on, no policy. Signed-in users never read it.

-- Functions ------------------------------------------------------------------------

-- Saves a recovery and its items together. Idempotent on p_submission_id: the
-- same leader sending the same form twice gets the same recovery back with
-- out_created = false. Items come from the active menu (name and family are
-- copied from the menu row, never from the client) or are a free-text "other"
-- line with no menu id.
create or replace function public.log_guest_recovery(
  p_submission_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_order_number text,
  p_note text,
  p_sms_consent boolean,
  p_items jsonb
)
returns table (out_id uuid, out_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_menu public.recovery_menu_items;
  v_qty int;
  v_name text;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to log a guest recovery' using errcode = '42501';
  end if;

  select r.id into v_id
  from public.guest_recoveries r
  where r.submission_id = p_submission_id and r.logged_by = auth.uid();
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Pick at least one missing item (up to 20)' using errcode = '22023';
  end if;

  begin
    insert into public.guest_recoveries (
      submission_id, guest_name, guest_email, guest_phone, order_number, note, sms_consent, logged_by
    ) values (
      p_submission_id,
      btrim(p_guest_name),
      nullif(lower(btrim(p_guest_email)), ''),
      nullif(btrim(p_guest_phone), ''),
      nullif(btrim(p_order_number), ''),
      nullif(btrim(p_note), ''),
      coalesce(p_sms_consent, false),
      auth.uid()
    ) returning id into v_id;
  exception when unique_violation then
    -- Two taps raced: the other one won. Hand back its recovery, but never
    -- another leader's.
    select r.id into v_id
    from public.guest_recoveries r
    where r.submission_id = p_submission_id and r.logged_by = auth.uid();
    if v_id is null then
      raise exception 'That recovery id is already in use' using errcode = '23505';
    end if;
    return query select v_id, false;
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

  return query select v_id, true;
end;
$$;

revoke all on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb)
  to authenticated;

-- Hands the items over. Returns what happened so a second scan can say so:
-- 'given' (this call did it), 'already_given', 'void' or 'not_found'. Only an
-- owed recovery moves, so a double tap or a second scan changes nothing.
create or replace function public.give_guest_recovery(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to hand over a recovery' using errcode = '42501';
  end if;

  update public.guest_recoveries
  set status = 'given', given_at = now(), given_by = auth.uid()
  where id = p_id and status = 'owed';
  if found then
    return 'given';
  end if;

  select status into v_status from public.guest_recoveries where id = p_id;
  if v_status is null then
    return 'not_found';
  end if;
  if v_status = 'given' then
    return 'already_given';
  end if;
  return v_status;
end;
$$;

revoke all on function public.give_guest_recovery(uuid) from public, anon, authenticated;
grant execute on function public.give_guest_recovery(uuid) to authenticated;

-- Voids a recovery that is still owed (logged by mistake, guest changed their
-- mind). A recovery already handed over stays handed over. Returns 'void' (this
-- call did it), 'already_void', 'given' or 'not_found'.
create or replace function public.void_guest_recovery(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to void a recovery' using errcode = '42501';
  end if;

  update public.guest_recoveries
  set status = 'void', voided_at = now(), voided_by = auth.uid()
  where id = p_id and status = 'owed';
  if found then
    return 'void';
  end if;

  select status into v_status from public.guest_recoveries where id = p_id;
  if v_status is null then
    return 'not_found';
  end if;
  if v_status = 'void' then
    return 'already_void';
  end if;
  return v_status;
end;
$$;

revoke all on function public.void_guest_recovery(uuid) from public, anon, authenticated;
grant execute on function public.void_guest_recovery(uuid) to authenticated;

-- Claims the right to send one message. Called only by the server's
-- service-role client, after the leader's permission was checked. Returns the
-- new send row's id, or null when the send must not go out:
--   initial: one per channel per recovery, ever (the unique index). A second
--            claim gets null, so a double tap cannot double-send.
--   resend:  refused when any send for that channel started in the last 30
--            seconds, so a double tap on Resend sends once. The advisory lock
--            makes the check and the insert one step.
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
  if p_channel not in ('email', 'sms') or p_kind not in ('initial', 'resend') then
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

revoke all on function public.claim_guest_recovery_send(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_guest_recovery_send(uuid, text, text) to service_role;

-- Permissions ------------------------------------------------------------------------
-- guest_recovery.log: log, resend, hand over and void. Team Leader and above,
-- read from role rank so a re-ranked senior role keeps it.
-- guest_recovery.manage: the recovery menu and the stats. Shift Supervisor and
-- above. Idempotent: role_permissions has primary key (role_id, permission_key).

insert into public.role_permissions (role_id, permission_key)
select r.id, 'guest_recovery.log'
from public.roles r
where r.rank is not null
  and r.rank <= (select s.rank from public.roles s where s.name = 'Team Leader')
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'guest_recovery.manage'
from public.roles r
where r.rank is not null
  and r.rank <= (select s.rank from public.roles s where s.name = 'Shift Supervisor')
on conflict (role_id, permission_key) do nothing;

-- Menu seed --------------------------------------------------------------------------
-- The Chick-fil-A menu as guests name it on the phone. Editable in the app
-- (/guest-recovery/menu). Sizes and counts are separate rows so the leader
-- picks exactly what was missing; family groups them for reporting.

insert into public.recovery_menu_items (name, family, category, sort)
values
  ('Entire order', 'Entire order', 'Whole order', 1),
  ('Entire meal', 'Entire meal', 'Whole order', 2),

  ('Chick-fil-A Chicken Sandwich', 'Chick-fil-A Chicken Sandwich', 'Sandwiches', 10),
  ('Spicy Chicken Sandwich', 'Spicy Chicken Sandwich', 'Sandwiches', 11),
  ('Chick-fil-A Deluxe Sandwich', 'Chick-fil-A Deluxe Sandwich', 'Sandwiches', 12),
  ('Spicy Deluxe Sandwich', 'Spicy Deluxe Sandwich', 'Sandwiches', 13),
  ('Grilled Chicken Sandwich', 'Grilled Chicken Sandwich', 'Sandwiches', 14),
  ('Grilled Chicken Club Sandwich', 'Grilled Chicken Club Sandwich', 'Sandwiches', 15),
  ('Cool Wrap', 'Cool Wrap', 'Sandwiches', 16),

  ('8-count Chick-fil-A Nuggets', 'Nuggets', 'Nuggets and Strips', 20),
  ('12-count Chick-fil-A Nuggets', 'Nuggets', 'Nuggets and Strips', 21),
  ('30-count Chick-fil-A Nuggets', 'Nuggets', 'Nuggets and Strips', 22),
  ('8-count Grilled Nuggets', 'Grilled Nuggets', 'Nuggets and Strips', 23),
  ('12-count Grilled Nuggets', 'Grilled Nuggets', 'Nuggets and Strips', 24),
  ('2-count Chick-n-Strips', 'Chick-n-Strips', 'Nuggets and Strips', 25),
  ('3-count Chick-n-Strips', 'Chick-n-Strips', 'Nuggets and Strips', 26),
  ('4-count Chick-n-Strips', 'Chick-n-Strips', 'Nuggets and Strips', 27),

  ('Cobb Salad', 'Cobb Salad', 'Salads', 30),
  ('Spicy Southwest Salad', 'Spicy Southwest Salad', 'Salads', 31),
  ('Market Salad', 'Market Salad', 'Salads', 32),
  ('Side Salad', 'Side Salad', 'Salads', 33),

  ('Small Waffle Potato Fries', 'Waffle Potato Fries', 'Sides', 40),
  ('Medium Waffle Potato Fries', 'Waffle Potato Fries', 'Sides', 41),
  ('Large Waffle Potato Fries', 'Waffle Potato Fries', 'Sides', 42),
  ('Small Mac & Cheese', 'Mac & Cheese', 'Sides', 43),
  ('Medium Mac & Cheese', 'Mac & Cheese', 'Sides', 44),
  ('Large Mac & Cheese', 'Mac & Cheese', 'Sides', 45),
  ('Small Fruit Cup', 'Fruit Cup', 'Sides', 46),
  ('Medium Fruit Cup', 'Fruit Cup', 'Sides', 47),
  ('Large Fruit Cup', 'Fruit Cup', 'Sides', 48),
  ('Kale Crunch Side', 'Kale Crunch Side', 'Sides', 49),
  ('Chicken Noodle Soup', 'Chicken Noodle Soup', 'Sides', 50),

  ('Small Lemonade', 'Lemonade', 'Drinks', 60),
  ('Medium Lemonade', 'Lemonade', 'Drinks', 61),
  ('Large Lemonade', 'Lemonade', 'Drinks', 62),
  ('Small Sunjoy', 'Sunjoy', 'Drinks', 63),
  ('Medium Sunjoy', 'Sunjoy', 'Drinks', 64),
  ('Large Sunjoy', 'Sunjoy', 'Drinks', 65),
  ('Small Iced Tea', 'Iced Tea', 'Drinks', 66),
  ('Medium Iced Tea', 'Iced Tea', 'Drinks', 67),
  ('Large Iced Tea', 'Iced Tea', 'Drinks', 68),
  ('Small Fountain Drink', 'Fountain Drink', 'Drinks', 69),
  ('Medium Fountain Drink', 'Fountain Drink', 'Drinks', 70),
  ('Large Fountain Drink', 'Fountain Drink', 'Drinks', 71),
  ('Gallon Beverage', 'Gallon Beverage', 'Drinks', 72),
  ('Iced Coffee', 'Iced Coffee', 'Drinks', 73),
  ('Bottled Water', 'Bottled Water', 'Drinks', 74),
  ('Milk', 'Milk', 'Drinks', 75),
  ('Orange Juice', 'Orange Juice', 'Drinks', 76),

  ('Kid''s Meal (Nuggets)', 'Kid''s Meal', 'Kids', 80),
  ('Kid''s Meal (Grilled Nuggets)', 'Kid''s Meal', 'Kids', 81),
  ('Kid''s Meal (Chick-n-Strips)', 'Kid''s Meal', 'Kids', 82),

  ('Icedream Cone', 'Icedream', 'Desserts', 90),
  ('Icedream Cup', 'Icedream', 'Desserts', 91),
  ('Chocolate Chunk Cookie', 'Cookie', 'Desserts', 92),
  ('Chocolate Fudge Brownie', 'Brownie', 'Desserts', 93),
  ('Milkshake', 'Milkshake', 'Desserts', 94),
  ('Frosted Lemonade', 'Frosted Lemonade', 'Desserts', 95),
  ('Frosted Coffee', 'Frosted Coffee', 'Desserts', 96),

  ('Chicken Biscuit', 'Chicken Biscuit', 'Breakfast', 100),
  ('Spicy Chicken Biscuit', 'Spicy Chicken Biscuit', 'Breakfast', 101),
  ('Egg White Grill', 'Egg White Grill', 'Breakfast', 102),
  ('Bacon, Egg & Cheese Biscuit', 'Bacon, Egg & Cheese Biscuit', 'Breakfast', 103),
  ('Chick-n-Minis', 'Chick-n-Minis', 'Breakfast', 104),
  ('Hash Browns', 'Hash Browns', 'Breakfast', 105),

  ('Sauce', 'Sauce', 'Extras', 110),
  ('Napkins and utensils', 'Napkins and utensils', 'Extras', 111),
  ('Extra pickles', 'Extra pickles', 'Extras', 112)
on conflict (name) do nothing;
