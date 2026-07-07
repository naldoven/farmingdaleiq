-- Accountability
-- ARCHITECTURE.md "Data model (Postgres)" > Accountability
-- Anonymity: infractions.issued_by is stored for audit but excluded from the
-- recipient-facing API/RLS view (enforced by S6's RLS policies, not P0).

create table public.accountability_settings (
  id uuid primary key default gen_random_uuid(),
  period_kind text not null default 'rolling' check (period_kind in ('rolling', 'fixed')),
  period_days int not null default 60
);

create table public.infraction_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points int not null default 0,
  description text,
  active boolean not null default true
);

create table public.infractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type_id uuid not null references public.infraction_types(id),
  points int not null,
  note text,
  issued_by uuid references public.profiles(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.disciplinary_action_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  threshold_points int not null,
  description text,
  sort int not null default 0
);

create table public.disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type_id uuid not null references public.disciplinary_action_types(id),
  triggered_at timestamptz not null default now(),
  status text not null default 'pending',
  note text,
  acknowledged_at timestamptz
);
