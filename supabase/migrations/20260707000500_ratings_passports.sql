-- Ratings & passports
-- ARCHITECTURE.md "Data model (Postgres)" > Ratings & passports
-- passports.org_tier_id FK is added later in 20260707000600_trainee_lifecycle.sql
-- once org_tiers exists.

create table public.rating_rubrics (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references public.positions(id) on delete cascade,
  category_1 text,
  category_2 text,
  category_3 text,
  category_4 text
);

create table public.position_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  position_id uuid references public.positions(id),
  stars numeric not null,
  category_scores jsonb,
  comment text,
  rated_by uuid references public.profiles(id),
  rated_at timestamptz not null default now(),
  is_current boolean not null default true
);

create table public.rerate_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  position_id uuid references public.positions(id),
  due_on date not null,
  resolved_at timestamptz
);

create table public.passports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('position', 'leadership')),
  position_id uuid references public.positions(id),
  target_role_id uuid references public.roles(id),
  name text not null,
  active boolean not null default true
);

create table public.passport_items (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete cascade,
  sort int not null default 0,
  type text not null check (type in ('check', 'slider', 'photo', 'signature', 'course')),
  label text not null,
  course_id uuid references public.training_courses(id)
);

create table public.passport_enrollments (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  stamped_by uuid references public.profiles(id),
  stamped_at timestamptz,
  -- pipeline variant: DT/FC/OT/Both for FOH masters, focus areas for kitchen
  track text
);

create table public.passport_item_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.passport_enrollments(id) on delete cascade,
  item_id uuid not null references public.passport_items(id) on delete cascade,
  value jsonb,
  photo_url text,
  signed_by uuid references public.profiles(id),
  completed_at timestamptz,
  unique (enrollment_id, item_id)
);
