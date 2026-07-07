-- Maintenance
-- ARCHITECTURE.md "Data model (Postgres)" > Maintenance
-- maintenance_requests <-> work_orders is a two-way reference; work_order_id
-- is added to maintenance_requests via ALTER after work_orders exists.

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  area text,
  model text,
  serial text,
  service_vendor_id uuid references public.vendors(id),
  installed_on date,
  warranty_expires_on date,
  status text not null default 'operational' check (status in ('operational', 'down')),
  photo_url text,
  notes text
);

create table public.equipment_files (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  file_url text not null,
  label text
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  equipment_id uuid references public.equipment(id),
  area text,
  suggested_priority text,
  photo_urls text[],
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  declined_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  work_order_id uuid
);

create table public.pm_schedules (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  title text not null,
  description text,
  interval_days int not null,
  lead_days int not null default 0,
  next_due_on date,
  checklist_template_id uuid references public.checklist_templates(id),
  assign_user_id uuid references public.profiles(id),
  vendor_id uuid references public.vendors(id),
  priority text,
  active boolean not null default true
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.maintenance_requests(id),
  pm_schedule_id uuid references public.pm_schedules(id),
  title text not null,
  description text,
  equipment_id uuid references public.equipment(id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'on_hold', 'complete', 'cancelled')),
  assigned_user_id uuid references public.profiles(id),
  vendor_id uuid references public.vendors(id),
  scheduled_for timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  cost numeric,
  invoice_url text,
  checklist_run_id uuid references public.checklist_runs(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.maintenance_requests
  add constraint maintenance_requests_work_order_id_fkey
  foreign key (work_order_id) references public.work_orders(id);

create table public.work_order_comments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text,
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.equipment_downtime (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  work_order_id uuid references public.work_orders(id),
  started_at timestamptz not null,
  ended_at timestamptz
);
