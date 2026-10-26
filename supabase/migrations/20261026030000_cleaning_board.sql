-- Cleaning module, slice 2: the weekly board (docs/CLEANING-PLAN.md "How a
-- week runs"). Slot caps, weeks, assignments, and the three database
-- functions whose steps must land together: completing a clean, rejecting
-- one, and closing out past days.
--
-- Run after 20261026000000_cleaning_walkthrough.sql. Safe before the code
-- deploys: nothing reads these tables until the Phase 1 screens ship.

-- Date helpers --------------------------------------------------------------------
-- Sunday is the only closed day, so "next open day" skips it and Saturday
-- rolls to Monday. Weeks start Monday (isodow 1).

create or replace function public.cleaning_next_open_day(d date)
returns date
language sql
immutable
as $$
  select case when extract(isodow from d + 1) = 7 then d + 2 else d + 1 end;
$$;

create or replace function public.cleaning_week_start(d date)
returns date
language sql
immutable
as $$
  select d - (extract(isodow from d)::int - 1);
$$;

-- Slot caps -----------------------------------------------------------------------
-- How many variable cleans the Thursday build may place in each half-day.
-- 0 is allowed: some days get no variables (Naldo, 2026-10-25).

create table public.cleaning_slot_caps (
  weekday int not null check (weekday between 1 and 6),
  half text not null check (half in ('am', 'pm')),
  max_variables int not null default 2 check (max_variables between 0 and 20),
  primary key (weekday, half)
);

insert into public.cleaning_slot_caps (weekday, half, max_variables)
select d, h, 2
from generate_series(1, 6) as d
cross join (values ('am'), ('pm')) as hv(h)
on conflict (weekday, half) do nothing;

-- Weeks ---------------------------------------------------------------------------
-- One row per Monday. build_started_at is a claim so two builds racing (the
-- hourly job and a planner's "Build now") cannot both place variables;
-- built_at marks the build finished so it never runs twice. published_at is
-- stamped the Monday the week goes live, edited or not.

create table public.cleaning_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  build_started_at timestamptz,
  built_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- Assignments ---------------------------------------------------------------------
-- One clean of one item in one half-day. Unique on (item_id, date, half) so a
-- rerun of the build or the day-end close can never double-create. The week is
-- referenced by its Monday rather than an id so the row can check that its
-- date falls inside that week.

create table public.cleaning_assignments (
  id uuid primary key default gen_random_uuid(),
  week_start date not null references public.cleaning_weeks(week_start) on delete cascade,
  item_id uuid not null references public.cleaning_items(id),
  date date not null,
  half text not null check (half in ('am', 'pm')),
  origin text not null check (origin in ('constant', 'auto', 'manual', 'carry_over', 'redo')),
  carried_from_id uuid references public.cleaning_assignments(id),
  status text not null default 'planned'
    check (status in ('planned', 'done', 'not_needed', 'skipped', 'missed')),
  skip_reason text check (skip_reason is null or char_length(skip_reason) <= 200),
  owner_user_id uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  photo_path text unique check (photo_path is null or photo_path ~ '^done/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  rejected_by uuid references public.profiles(id),
  rejected_at timestamptz,
  reject_note text check (reject_note is null or char_length(reject_note) <= 300),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (item_id, date, half),
  constraint cleaning_assignments_open_day check (extract(isodow from date) between 1 and 6),
  constraint cleaning_assignments_in_week check (date between week_start and week_start + 5),
  -- No clean counts as done without a stored photo (plan "Proof").
  constraint cleaning_assignments_done_has_photo check (
    status not in ('done', 'not_needed')
    or (photo_path is not null and completed_by is not null and completed_at is not null)
  ),
  constraint cleaning_assignments_skip_has_reason check (
    status <> 'skipped' or char_length(btrim(coalesce(skip_reason, ''))) > 0
  )
);

create index cleaning_assignments_day_idx on public.cleaning_assignments (date, half);
create index cleaning_assignments_week_idx on public.cleaning_assignments (week_start);
create index cleaning_assignments_item_idx on public.cleaning_assignments (item_id, status);

-- Last clean per item. Always worked out from completions, never typed in, so
-- it cannot drift (plan "How a week runs"). A rejected clean does not count;
-- its redo does. security_invoker keeps the assignments RLS in force.
create view public.cleaning_item_last_done
with (security_invoker = true) as
select item_id, max(completed_at) as last_done_at
from public.cleaning_assignments
where status in ('done', 'not_needed')
  and rejected_at is null
group by item_id;

-- RLS -----------------------------------------------------------------------------
-- Leaders read everything; planners write. Leaders complete a clean only
-- through complete_cleaning_assignment below, which can change nothing but
-- the completion fields.

alter table public.cleaning_slot_caps enable row level security;
alter table public.cleaning_weeks enable row level security;
alter table public.cleaning_assignments enable row level security;

create policy cleaning_slot_caps_select on public.cleaning_slot_caps
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

create policy cleaning_slot_caps_write on public.cleaning_slot_caps
  for all to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_weeks_select on public.cleaning_weeks
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

-- No delete policy: deleting a week would cascade away its cleans, and with
-- them the record of who did or missed what.
create policy cleaning_weeks_insert on public.cleaning_weeks
  for insert to authenticated
  with check (public.can_plan_cleaning());

create policy cleaning_weeks_update on public.cleaning_weeks
  for update to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_assignments_select on public.cleaning_assignments
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

create policy cleaning_assignments_write on public.cleaning_assignments
  for all to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

-- RLS decides who may write; this decides what. The coordinator is herself a
-- shift leader whose misses are counted, so through the API a planner may
-- only plan: add planned cleans, move or skip or put back open ones, and
-- delete open ones. Completion, rejection, misses, owners and carry-overs
-- are written only by the functions below, which run as their owner rather
-- than as `authenticated`, and by the service-role job (PR #89 review).
create or replace function public.cleaning_assignments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'planned' then
      raise exception 'Only open cleans can be removed' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'planned'
      or new.origin not in ('constant', 'auto', 'manual')
      or new.carried_from_id is not null
      or new.owner_user_id is not null
      or new.completed_by is not null
      or new.completed_at is not null
      or new.photo_path is not null
      or new.rejected_by is not null
      or new.rejected_at is not null
      or new.reject_note is not null then
      raise exception 'New cleans start open' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status not in ('planned', 'skipped')
    or new.status not in ('planned', 'skipped')
    or new.item_id is distinct from old.item_id
    or new.origin is distinct from old.origin
    or new.carried_from_id is distinct from old.carried_from_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.completed_by is distinct from old.completed_by
    or new.completed_at is distinct from old.completed_at
    or new.photo_path is distinct from old.photo_path
    or new.rejected_by is distinct from old.rejected_by
    or new.rejected_at is distinct from old.rejected_at
    or new.reject_note is distinct from old.reject_note then
    raise exception 'Only open cleans can be moved or skipped' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cleaning_assignments_guard() from public, anon, authenticated;

create trigger cleaning_assignments_guard
  before insert or update or delete on public.cleaning_assignments
  for each row execute function public.cleaning_assignments_guard();

-- Completion photos ---------------------------------------------------------------
-- Same private bucket as the walkthrough photos, under done/. The existing
-- cleaning_photos_select policy already covers reads.

create policy cleaning_done_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cleaning-photos'
    and name ~ '^done/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
  );

-- Complete ------------------------------------------------------------------------
-- Marks one planned clean done (or "checked, not needed" for an if-needed
-- item). Locks the row, so a double tap records one completion: the second
-- call finds it done and reports 'already_done', or 'done' when it is the
-- same photo retried. The photo must already be in storage, which is what
-- makes "no clean done without a stored photo" hold even for a direct API
-- call, and it must be one the caller uploaded, so nobody can finish a clean
-- with another leader's leftover photo. Doing a clean earlier in the week
-- than planned is allowed.

create or replace function public.complete_cleaning_assignment(
  p_assignment_id uuid,
  p_photo_path text,
  p_not_needed boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cleaning_assignments%rowtype;
  v_if_needed boolean;
begin
  if not (public.has_permission('cleaning.complete') or public.can_plan_cleaning()) then
    raise exception 'cleaning.complete required' using errcode = '42501';
  end if;
  if p_photo_path is null or p_photo_path !~ '^done/[0-9a-f-]{36}\.(jpg|png|webp)$' then
    raise exception 'bad photo path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'cleaning-photos'
      and o.name = p_photo_path
      and (o.owner_id = auth.uid()::text or o.owner = auth.uid())
  ) then
    return 'no_photo';
  end if;

  select * into v_row from public.cleaning_assignments where id = p_assignment_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_row.status in ('done', 'not_needed') then
    return case when v_row.photo_path = p_photo_path then 'done' else 'already_done' end;
  end if;
  if v_row.status <> 'planned' then
    return 'not_open';
  end if;
  if coalesce(p_not_needed, false) then
    select if_needed into v_if_needed from public.cleaning_items where id = v_row.item_id;
    if not coalesce(v_if_needed, false) then
      return 'not_if_needed';
    end if;
  end if;

  update public.cleaning_assignments
     set status = case when coalesce(p_not_needed, false) then 'not_needed' else 'done' end,
         completed_by = auth.uid(),
         completed_at = now(),
         photo_path = p_photo_path
   where id = p_assignment_id;
  return 'done';
end;
$$;

revoke all on function public.complete_cleaning_assignment(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_cleaning_assignment(uuid, text, boolean) to authenticated;

-- Reject --------------------------------------------------------------------------
-- A planner rejects a completion photo with a note. The original stays done
-- but stamped rejected (so it never counts as on time), and a "redo" clean
-- opens in the first free slot from the one the app picked (the next shift).
-- Both steps in one transaction; a second tap finds it already rejected.

create or replace function public.reject_cleaning_assignment(
  p_assignment_id uuid,
  p_note text,
  p_redo_date date,
  p_redo_half text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cleaning_assignments%rowtype;
  v_date date := p_redo_date;
  v_half text := p_redo_half;
  v_new uuid;
begin
  if not public.can_plan_cleaning() then
    raise exception 'cleaning.plan required' using errcode = '42501';
  end if;
  if p_note is null or char_length(btrim(p_note)) = 0 or char_length(p_note) > 300 then
    raise exception 'note required' using errcode = '22023';
  end if;
  if v_half not in ('am', 'pm') or v_date is null then
    raise exception 'bad redo slot' using errcode = '22023';
  end if;
  if extract(isodow from v_date) = 7 then
    v_date := v_date + 1;
    v_half := 'am';
  end if;

  update public.cleaning_assignments
     set rejected_by = auth.uid(), rejected_at = now(), reject_note = btrim(p_note)
   where id = p_assignment_id
     and status in ('done', 'not_needed')
     and rejected_at is null
  returning * into v_row;
  if not found then
    -- A retry after a lost response finds its own work done; say so rather
    -- than report a failure.
    if exists (
      select 1 from public.cleaning_assignments
      where id = p_assignment_id and rejected_at is not null
    ) then
      return 'already_rejected';
    end if;
    return 'not_open';
  end if;

  -- The item may already hold the chosen slot (a constant that runs daily);
  -- walk forward one half at a time until a free one turns up.
  for i in 1..12 loop
    insert into public.cleaning_weeks (week_start)
    values (public.cleaning_week_start(v_date))
    on conflict (week_start) do nothing;

    insert into public.cleaning_assignments (week_start, item_id, date, half, origin, carried_from_id)
    values (public.cleaning_week_start(v_date), v_row.item_id, v_date, v_half, 'redo', v_row.id)
    on conflict (item_id, date, half) do nothing
    returning id into v_new;
    exit when v_new is not null;

    if v_half = 'am' then
      v_half := 'pm';
    else
      v_half := 'am';
      v_date := public.cleaning_next_open_day(v_date);
    end if;
  end loop;

  return 'rejected';
end;
$$;

revoke all on function public.reject_cleaning_assignment(uuid, text, date, text) from public, anon, authenticated;
grant execute on function public.reject_cleaning_assignment(uuid, text, date, text) to authenticated;

-- Close past days -----------------------------------------------------------------
-- Run by the hourly cleaning job with the store-local date, from 3am so the
-- closing shift can still finish last night's list after midnight. Every
-- clean still planned on an earlier day becomes a miss, owned by that day's
-- Morning (AM) or Closing (PM) Setup leader when one was posted, otherwise
-- "no owner". A miss carries over to the next open day (never earlier than
-- today), same half, exactly once: a carried clean that is missed again is
-- not carried a second time, so one undone clean cannot turn into a miss
-- every day of the week. A variable dropped that way stays overdue and the
-- next build places it first. Locking the planned rows makes a concurrent or
-- repeated run a no-op. A clean whose item was retired or whose zone was
-- hidden before its day is recorded as skipped, not missed: nobody was
-- supposed to do it any more.

create or replace function public.close_cleaning_days(p_today date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_open_today date := case when extract(isodow from p_today) = 7 then p_today + 1 else p_today end;
  v_carry date;
  v_missed int := 0;
  v_carried int := 0;
  v_n int;
begin
  update public.cleaning_assignments a
     set status = 'skipped', skip_reason = 'Taken off the list'
   where a.status = 'planned'
     and a.date < p_today
     and not exists (
       select 1
       from public.cleaning_items i
       join public.cleaning_zones z on z.id = i.zone_id
       where i.id = a.item_id and i.status = 'active' and z.active
     );

  for r in
    update public.cleaning_assignments a
       set status = 'missed',
           owner_user_id = (
             select s.shift_leader_id
             from public.setups s
             join public.day_parts d on d.id = s.day_part_id
             where s.date = a.date
               and s.posted_at is not null
               and d.name = case a.half when 'am' then 'Morning' else 'Closing' end
             order by s.posted_at desc
             limit 1
           )
     where a.status = 'planned'
       and a.date < p_today
    returning a.id, a.item_id, a.date, a.half, a.origin
  loop
    v_missed := v_missed + 1;
    if r.origin <> 'carry_over' then
      v_carry := greatest(public.cleaning_next_open_day(r.date), v_open_today);
      insert into public.cleaning_weeks (week_start)
      values (public.cleaning_week_start(v_carry))
      on conflict (week_start) do nothing;
      insert into public.cleaning_assignments (week_start, item_id, date, half, origin, carried_from_id, created_by)
      values (public.cleaning_week_start(v_carry), r.item_id, v_carry, r.half, 'carry_over', r.id, null)
      on conflict (item_id, date, half) do nothing;
      get diagnostics v_n = row_count;
      v_carried := v_carried + v_n;
    end if;
  end loop;

  return jsonb_build_object('missed', v_missed, 'carried', v_carried);
end;
$$;

revoke all on function public.close_cleaning_days(date) from public, anon, authenticated;
grant execute on function public.close_cleaning_days(date) to service_role;
