-- Tasks
-- ARCHITECTURE.md "Data model (Postgres)" > Tasks

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  frequency text,
  days_of_week int[],
  day_part_id uuid references public.day_parts(id),
  start_time time,
  due_time time,
  assign_position_id uuid references public.positions(id),
  assign_user_id uuid references public.profiles(id),
  token_value int not null default 0,
  active boolean not null default true
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.task_templates(id),
  kind text not null default 'adhoc'
    check (kind in ('adhoc', 'recurring', 'reward_fulfillment', 'follow_up', 'lead_duty')),
  title text not null,
  description text,
  date date not null default current_date,
  day_part_id uuid references public.day_parts(id),
  start_time time,
  due_at timestamptz,
  assigned_user_id uuid references public.profiles(id),
  assigned_position_id uuid references public.positions(id),
  setup_id uuid references public.setups(id),
  status text not null default 'pending',
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  token_value int not null default 0,
  created_by uuid references public.profiles(id),
  ref jsonb,
  created_at timestamptz not null default now()
);
