-- Cleaning Phase 2 (docs/CLEANING-PLAN.md "Decisions": ATD log, Metrics):
-- the found-and-fixed log, and the store cleaning trend that every team
-- member sees on Home.
--
-- Safe before the code deploys: nothing reads these until the Phase 2
-- screens ship.

-- Found and fixed -----------------------------------------------------------------
-- A leader spots something dirty that is not on any list, fixes it, and posts
-- a photo, the area and a one-line note. The id is the phone's photo id, the
-- same idempotency as the walkthrough: a retried upload inserts nothing new.
-- A planner can turn a find into a master-list item (converted_item_id).

create table public.cleaning_atd_finds (
  id uuid primary key,
  zone_id uuid not null references public.cleaning_zones(id),
  note text not null check (char_length(btrim(note)) between 1 and 200),
  photo_path text not null unique,
  posted_by uuid not null references public.profiles(id) default auth.uid(),
  posted_at timestamptz not null default now(),
  converted_item_id uuid references public.cleaning_items(id) on delete set null,
  -- The path is always derived from the id, so a direct API insert cannot
  -- point a find at someone else's photo.
  constraint cleaning_atd_finds_path_matches_id check (
    photo_path ~ ('^finds/' || id::text || '\.(jpg|png|webp)$')
  )
);

create index cleaning_atd_finds_posted_idx on public.cleaning_atd_finds (posted_at desc);

alter table public.cleaning_atd_finds enable row level security;

create policy cleaning_atd_finds_select on public.cleaning_atd_finds
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

create policy cleaning_atd_finds_insert on public.cleaning_atd_finds
  for insert to authenticated
  with check (
    (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
    and posted_by = auth.uid()
    and converted_item_id is null
  );

create policy cleaning_atd_finds_update on public.cleaning_atd_finds
  for update to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_atd_finds_delete on public.cleaning_atd_finds
  for delete to authenticated
  using (public.can_plan_cleaning());

-- A planner updates a find only to link the item it became. Through the API
-- the poster, photo, area, note and time stay as posted, so the log is a
-- record of what was found, not something to rewrite later.
create or replace function public.cleaning_atd_finds_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.id is distinct from old.id
    or new.zone_id is distinct from old.zone_id
    or new.note is distinct from old.note
    or new.photo_path is distinct from old.photo_path
    or new.posted_by is distinct from old.posted_by
    or new.posted_at is distinct from old.posted_at
  ) then
    raise exception 'A find can only be linked to an item' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cleaning_atd_finds_guard() from public, anon, authenticated;

create trigger cleaning_atd_finds_guard
  before update on public.cleaning_atd_finds
  for each row execute function public.cleaning_atd_finds_guard();

-- Find photos live in the same private bucket under finds/. The existing
-- cleaning_photos_select policy already covers reads.
create policy cleaning_find_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cleaning-photos'
    and name ~ '^finds/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
  );

-- Store trend -----------------------------------------------------------------------
-- Week by week: cleans owed, done on time, missed. Team members see this on
-- Home but cannot read the assignments themselves (leaders only), so this
-- returns counts and nothing else: no items, no people. Only days that have
-- ended count, so a week in progress is not dragged down by today's open
-- cleans. On time = done (or checked, not needed) on or before its day,
-- store-local; skipped and sent-back cleans are not owed, the same rule the
-- Today screen and the morning summary use.

create or replace function public.cleaning_store_trend(p_weeks int default 12)
returns table (week_start date, owed int, on_time int, missed int)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.stores limit 1), 'America/New_York') as name
  ),
  bounds as (
    select (now() at time zone (select name from tz))::date as today
  )
  select
    a.week_start,
    count(*) filter (where a.status <> 'skipped' and a.rejected_at is null)::int as owed,
    count(*) filter (
      where a.status in ('done', 'not_needed')
        and a.rejected_at is null
        and (a.completed_at at time zone (select name from tz))::date <= a.date
    )::int as on_time,
    count(*) filter (where a.status = 'missed')::int as missed
  from public.cleaning_assignments a
  where auth.uid() is not null
    and a.date < (select today from bounds)
    and a.week_start >= public.cleaning_week_start((select today from bounds))
      - (greatest(1, least(coalesce(p_weeks, 12), 52)) - 1) * 7
  group by a.week_start
  order by a.week_start;
$$;

revoke all on function public.cleaning_store_trend(int) from public, anon, authenticated;
grant execute on function public.cleaning_store_trend(int) to authenticated;
