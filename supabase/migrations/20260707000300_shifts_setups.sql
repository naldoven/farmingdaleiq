-- Shifts & setups
-- ARCHITECTURE.md "Data model (Postgres)" > Shifts & setups

create table public.day_parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  sort int not null default 0
);

create table public.position_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.position_groups(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table public.setup_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_part_id uuid references public.day_parts(id)
);

create table public.setup_template_positions (
  template_id uuid not null references public.setup_templates(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  sort int not null default 0,
  primary key (template_id, position_id)
);

create table public.setups (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  day_part_id uuid references public.day_parts(id),
  template_id uuid references public.setup_templates(id),
  shift_leader_id uuid references public.profiles(id),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.setup_assignments (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid not null references public.setups(id) on delete cascade,
  position_id uuid references public.positions(id),
  user_id uuid references public.profiles(id),
  -- feeds break sequencing; auto-place suggestions rank candidates by position rating
  arrival_time timestamptz
);

create table public.shift_notes (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid not null references public.setups(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.store_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_part_id uuid references public.day_parts(id),
  active boolean not null default true
);

create table public.layout_tiles (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.store_layouts(id) on delete cascade,
  position_id uuid references public.positions(id),
  x numeric not null default 0,
  y numeric not null default 0,
  w numeric not null default 1,
  h numeric not null default 1,
  area_label text
);

create table public.break_rules (
  id uuid primary key default gen_random_uuid(),
  min_shift_minutes int not null,
  max_shift_minutes int not null,
  age_band text not null check (age_band in ('adult', 'minor')),
  rest_minutes_paid int not null default 0,
  meal_minutes_unpaid int not null default 0,
  sort int not null default 0
);

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid references public.setups(id),
  user_id uuid references public.profiles(id),
  rule_id uuid references public.break_rules(id),
  kind text not null check (kind in ('rest', 'meal')),
  sequence int,
  authorized_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'active', 'completed', 'overdue', 'missed'))
);
