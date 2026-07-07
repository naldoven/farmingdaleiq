-- Trainee lifecycle (views and stages over passports)
-- ARCHITECTURE.md "Data model (Postgres)" > Trainee lifecycle

create table public.onboarding_roadmaps (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('foh', 'kitchen')),
  name text not null,
  active boolean not null default true
);

create table public.roadmap_stations (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.onboarding_roadmaps(id) on delete cascade,
  position_id uuid references public.positions(id),
  -- grid column group: Onboarding, Ordering, Assembly, Staging, Delivery, ...
  phase text not null,
  sort int not null default 0
);

create table public.trainee_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  roadmap_id uuid not null references public.onboarding_roadmaps(id),
  started_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'graduated', 'pip')),
  graduated_on date
);

create table public.station_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.trainee_enrollments(id) on delete cascade,
  roadmap_station_id uuid not null references public.roadmap_stations(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_training', 'scored')),
  score numeric,
  scored_by uuid references public.profiles(id),
  scored_at timestamptz,
  unique (enrollment_id, roadmap_station_id)
);

create table public.graduation_audits (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.trainee_enrollments(id) on delete cascade,
  due_on date not null,
  result text check (result in ('pass', 'pip')),
  notes text,
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.trainee_enrollments(id) on delete cascade,
  date date not null,
  position_id uuid references public.positions(id),
  start_time time,
  end_time time,
  trainer_user_id uuid references public.profiles(id),
  tags text[] not null default array['Learn', 'Position Overview', 'Nug Review']::text[],
  note text
);

create table public.org_tiers (
  id uuid primary key default gen_random_uuid(),
  department text not null check (department in ('foh', 'kitchen', 'store')),
  name text not null,
  goal_count int not null default 0,
  sort int not null default 0
);

create table public.org_slots (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.org_tiers(id) on delete cascade,
  user_id uuid references public.profiles(id),
  label text,
  sort int not null default 0
);

-- passports.org_tier_id: maps a pipeline (leadership) passport to the org
-- tier its stamp fills. Deferred here because org_tiers didn't exist yet
-- when passports was created.
alter table public.passports
  add column org_tier_id uuid references public.org_tiers(id);
