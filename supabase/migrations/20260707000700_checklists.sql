-- Checklists
-- ARCHITECTURE.md "Data model (Postgres)" > Checklists

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cold_min_f numeric,
  cold_max_f numeric,
  hot_min_f numeric,
  hot_max_f numeric
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true
);

create table public.checklist_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table public.checklist_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.checklist_sections(id) on delete cascade,
  sort int not null default 0,
  type text not null check (type in ('yes_no', 'number', 'temperature', 'text', 'multi_choice')),
  prompt text not null,
  allow_na boolean not null default false,
  choices jsonb,
  food_item_id uuid references public.food_items(id),
  corrective_actions text,
  photo_required boolean not null default false,
  token_value int not null default 0
);

create table public.checklist_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'persistent')),
  days_of_week int[],
  day_of_month int,
  day_part_id uuid references public.day_parts(id),
  start_time time,
  due_time time,
  assign_position_id uuid references public.positions(id),
  assign_team_id uuid references public.teams(id),
  alert_on_incomplete boolean not null default false
);

create table public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id),
  schedule_id uuid references public.checklist_schedules(id),
  run_date date not null default current_date,
  day_part_id uuid references public.day_parts(id),
  assigned_user_id uuid references public.profiles(id),
  assigned_position_id uuid references public.positions(id),
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id)
);

create table public.checklist_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  question_id uuid not null references public.checklist_questions(id),
  value jsonb,
  is_na boolean not null default false,
  flagged boolean not null default false,
  corrective_action_note text,
  comment text,
  photo_url text,
  answered_by uuid references public.profiles(id),
  answered_at timestamptz
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  source_answer_id uuid references public.checklist_answers(id),
  description text not null,
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);
