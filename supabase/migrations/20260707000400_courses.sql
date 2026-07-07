-- Courses (referenced by passport items)
-- ARCHITECTURE.md "Data model (Postgres)" > Courses (referenced by passport items)
-- vendor_id FK to public.vendors is added later in 20260707001400_vendors.sql
-- once the vendors table exists (avoids a forward reference).

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  content text,
  vendor_id uuid,
  sort int not null default 0
);

create table public.course_attachments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  file_url text not null,
  label text
);

create table public.course_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  user_id uuid references public.profiles(id),
  rating int,
  feedback text,
  created_at timestamptz not null default now()
);
