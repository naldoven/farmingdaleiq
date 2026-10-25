-- Cleaning module, slice 1: zones, the master list, and walkthrough photos
-- (docs/CLEANING-PLAN.md "Phase W"). Weekly boards, assignments, slot caps
-- and the ATD log come in later migrations; these tables are already in the
-- final shape the plan's data model describes so Phase 1 adds rather than
-- reworks.
--
-- Safe to deploy the code first: until this runs the /cleaning routes fail
-- their permission checks (no role holds a cleaning.* key) and render
-- nothing. Run this, then merge.

-- Zones -----------------------------------------------------------------------
-- The six color zones from the store's cleaning-zones message. `active`
-- means "included in the weekly board"; FOH stays off until the BOH beta is
-- stable, but the walkthrough can still tag FOH photos.

create table public.cleaning_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,
  side text not null check (side in ('foh', 'boh')),
  areas text not null,
  sort int not null,
  active boolean not null default true
);

-- Master list -----------------------------------------------------------------
-- Constants run on fixed weekdays (1 = Mon .. 6 = Sat, JS getDay numbering
-- like task_templates; Sunday is closed) in a fixed half. Variables repeat
-- every N weeks and may be placed in either half. Walkthrough saves land as
-- drafts until a planner approves them.

create table public.cleaning_items (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.cleaning_zones(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('constant', 'variable')),
  days_of_week int[],
  half text not null check (half in ('am', 'pm', 'either')),
  interval_weeks int check (interval_weeks in (1, 2, 3, 4, 6, 8, 13)),
  start_on date,
  if_needed boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  sort int not null default 0,
  constraint cleaning_items_cadence check (
    (
      kind = 'constant'
      and interval_weeks is null
      and half in ('am', 'pm')
      and days_of_week is not null
      and cardinality(days_of_week) > 0
      and days_of_week <@ array[1, 2, 3, 4, 5, 6]
    )
    or (
      kind = 'variable'
      and interval_weeks is not null
      and days_of_week is null
    )
  )
);

create index cleaning_items_zone_idx on public.cleaning_items (zone_id, status);

-- Photos ----------------------------------------------------------------------
-- The primary key is the id the phone generates at the shutter, so a retried
-- upload (lost response, flaky store wifi, a queue restored after the tab
-- closed) inserts nothing new: the walkthrough route treats a conflict as
-- "already saved". The server stamps created_at; captured_at is the phone's
-- shutter time, kept for comparison, never trusted alone. Markup is stored
-- as normalized 0-1 strokes over the untouched original so a drawing stays
-- editable.

create table public.cleaning_item_photos (
  id uuid primary key,
  item_id uuid not null references public.cleaning_items(id) on delete cascade,
  storage_path text not null unique,
  markup jsonb,
  kind text not null default 'reference' check (kind in ('reference')),
  capture_source text not null check (capture_source in ('live', 'file')),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  taken_by uuid not null references public.profiles(id) default auth.uid(),
  -- The path is always derived from the photo id (the route's
  -- photoStoragePath), so a direct API insert cannot point a photo row at
  -- someone else's object.
  constraint cleaning_item_photos_path_matches_id check (
    storage_path ~ ('^items/' || id::text || '\.(jpg|png|webp)$')
  )
);

create index cleaning_item_photos_item_idx on public.cleaning_item_photos (item_id, created_at desc);

-- Coordinator tag ---------------------------------------------------------------
-- Each profile holds exactly one role, and the store's cleaning planner is a
-- shift leader who must keep that role. The tag adds planning rights on top
-- of it (Naldo, 2026-10-25). A general multi-role model is separate work.

create table public.cleaning_coordinators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) default auth.uid(),
  added_at timestamptz not null default now()
);

create or replace function public.can_plan_cleaning()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- The tag counts only for an active profile, the same rule has_permission
  -- applies: deactivating someone is how the app offboards them, and a
  -- former coordinator must not keep planning rights (PR #88 review).
  select public.has_permission('cleaning.plan')
    or exists (
      select 1
      from public.cleaning_coordinators c
      join public.profiles p on p.id = c.user_id
      where c.user_id = auth.uid()
        and p.active = true
    );
$$;

revoke all on function public.can_plan_cleaning() from public, anon, authenticated;
grant execute on function public.can_plan_cleaning() to authenticated;

-- RLS -------------------------------------------------------------------------

alter table public.cleaning_zones enable row level security;
alter table public.cleaning_items enable row level security;
alter table public.cleaning_item_photos enable row level security;
alter table public.cleaning_coordinators enable row level security;

create policy cleaning_zones_select on public.cleaning_zones
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

create policy cleaning_zones_write on public.cleaning_zones
  for all to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_items_select on public.cleaning_items
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

-- A leader on the walk can only add drafts in their own name; approving,
-- editing and retiring are planner work.
create policy cleaning_items_insert on public.cleaning_items
  for insert to authenticated
  with check (
    public.can_plan_cleaning()
    or (
      public.has_permission('cleaning.complete')
      and status = 'draft'
      and created_by = auth.uid()
      and approved_by is null
      and approved_at is null
    )
  );

create policy cleaning_items_update on public.cleaning_items
  for update to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_items_delete on public.cleaning_items
  for delete to authenticated
  using (public.can_plan_cleaning());

create policy cleaning_item_photos_select on public.cleaning_item_photos
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

create policy cleaning_item_photos_insert on public.cleaning_item_photos
  for insert to authenticated
  with check (
    (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
    and taken_by = auth.uid()
    and exists (
      select 1 from public.cleaning_items i
      where i.id = item_id and i.status <> 'retired'
    )
  );

create policy cleaning_item_photos_update on public.cleaning_item_photos
  for update to authenticated
  using (public.can_plan_cleaning())
  with check (public.can_plan_cleaning());

create policy cleaning_item_photos_delete on public.cleaning_item_photos
  for delete to authenticated
  using (public.can_plan_cleaning());

create policy cleaning_coordinators_select on public.cleaning_coordinators
  for select to authenticated
  using (public.has_permission('cleaning.complete') or public.can_plan_cleaning());

-- Only role-level planners (Location Manager, Director) hand out the tag, so
-- a coordinator cannot mint more coordinators.
create policy cleaning_coordinators_write on public.cleaning_coordinators
  for all to authenticated
  using (public.has_permission('cleaning.plan'))
  with check (public.has_permission('cleaning.plan'));

-- Storage ---------------------------------------------------------------------
-- Private bucket: photos are shown through batched signed URLs. The
-- walkthrough route picks every object path itself and uploads with the
-- caller's own client, so these policies re-check the same key the route
-- does. No update or delete policies: objects are immutable from the client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cleaning-photos',
  'cleaning-photos',
  false,
  4194304, -- 4 MB, the route's own cap under Vercel's 4.5 MB body limit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Only the route's own path shape is writable, so a direct API caller cannot
-- scatter objects around the bucket.
create policy cleaning_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cleaning-photos'
    and name ~ '^items/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
  );

create policy cleaning_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cleaning-photos'
    and (public.has_permission('cleaning.complete') or public.can_plan_cleaning())
  );

-- Permissions -----------------------------------------------------------------
-- plan: every role holding roles.manage (Location Manager and Director in the
-- seed), read from live grants like catering.override. complete and
-- view_reports: Team Leader and up plus both trainer roles (rank <= 8),
-- Naldo's "all leaders" cutoff. role_permissions' primary key makes re-runs
-- no-ops.

insert into public.role_permissions (role_id, permission_key)
select r.id, 'cleaning.plan'
from public.roles r
where exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_key = 'roles.manage'
)
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values ('cleaning.complete'), ('cleaning.view_reports')) as k(key)
where r.rank <= 8
on conflict (role_id, permission_key) do nothing;

-- Seed: zones -----------------------------------------------------------------

insert into public.cleaning_zones (name, color, side, areas, sort, active)
values
  ('Green', '#16A34A', 'boh', 'Boards, Prep', 1, true),
  ('Yellow', '#E0A100', 'boh', 'Breading, Machines', 2, true),
  ('Blue', '#1D4ED8', 'boh', 'Dish to door, Dumpster', 3, true),
  ('Red', '#DC2626', 'foh', 'Front counter, Vestibule', 4, false),
  ('Purple', '#7E3AA0', 'foh', 'DT cockpit', 5, false),
  ('Orange', '#EA6A0C', 'foh', 'Dining room, Patio, Restrooms, Playground', 6, false)
on conflict (name) do nothing;

-- Seed: BOH constants from the paper Weekly Cleaning Schedule ---------------------
-- Zone by the item's text color on the sheet. Insert-only by zone + name, so
-- a re-run never duplicates and never overwrites an edited item.

insert into public.cleaning_items (zone_id, name, kind, days_of_week, half, if_needed, status, created_by, approved_at, sort)
select z.id, s.name, 'constant', array[s.dow], s.half, s.if_needed, 'active', null, now(), s.sort
from (
  values
    ('Blue', 'White walls by back door', 1, 'am', false, 1),
    ('Green', 'Secondary fry boil out', 1, 'am', false, 2),
    ('Yellow', 'Air vents', 1, 'am', false, 3),
    ('Blue', 'Deep clean dish washer', 1, 'pm', false, 4),
    ('Green', 'Boil out primary', 1, 'pm', false, 5),
    ('Yellow', 'Holding cabinet', 1, 'pm', false, 6),
    ('Blue', 'Dumpster pad scrub', 2, 'am', true, 7),
    ('Green', 'Fry and oven vents', 2, 'am', false, 8),
    ('Yellow', 'Machine vents', 2, 'am', false, 9),
    ('Blue', 'Clean lockers / cup holders', 2, 'pm', false, 10),
    ('Green', 'Boards deep clean', 2, 'pm', false, 11),
    ('Green', 'Lowboy gaskets', 2, 'pm', false, 12),
    ('Blue', 'Freezer', 3, 'am', false, 13),
    ('Blue', 'Walk-in cooler', 3, 'am', false, 14),
    ('Green', 'Prep shelving', 3, 'am', false, 15),
    ('Green', 'Prep white walls', 3, 'pm', false, 16),
    ('Yellow', 'Clean above machines', 3, 'pm', false, 17),
    ('Yellow', 'Machine hood inner', 3, 'pm', false, 18),
    ('Blue', 'Freezer / cooler doors', 4, 'am', false, 19),
    ('Blue', 'Deep clean Hobart mixer', 4, 'am', false, 20),
    ('Green', 'Clean out fry fridges', 4, 'am', false, 21),
    ('Blue', 'Back splash on dish', 4, 'pm', false, 22),
    ('Yellow', 'Rethermalizer', 4, 'pm', false, 23),
    ('Yellow', 'Breading deep clean', 4, 'pm', false, 24),
    ('Green', 'Boards lowboys', 5, 'am', false, 25),
    ('Green', 'Underneath boards', 5, 'am', false, 26),
    ('Yellow', 'Holding cabinet racks', 5, 'am', false, 27),
    ('Blue', '"Clean" dish rack', 5, 'pm', false, 28),
    ('Blue', 'Mop sink', 5, 'pm', false, 29),
    ('Yellow', 'Holding cabinet inner', 5, 'pm', false, 30),
    ('Green', 'Ovens deep clean', 6, 'am', false, 31),
    ('Yellow', 'Thawing cabinets 1/2 deep clean', 6, 'am', false, 32),
    ('Yellow', 'Thawing cabinets 2/3 deep clean', 6, 'am', false, 33),
    ('Blue', 'Spray the whale', 6, 'pm', false, 34),
    ('Blue', 'Clean behind dirty dish rack', 6, 'pm', false, 35),
    ('Green', 'Prep lowboys', 6, 'pm', false, 36)
) as s(zone, name, dow, half, if_needed, sort)
join public.cleaning_zones z on z.name = s.zone
where not exists (
  select 1
  from public.cleaning_items i
  where i.zone_id = z.id
    and lower(i.name) = lower(s.name)
);
