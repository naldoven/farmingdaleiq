-- Waste
-- ARCHITECTURE.md "Data model (Postgres)" > Waste

create table public.waste_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0
);

create table public.waste_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.waste_categories(id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('each', 'lb', 'oz')),
  unit_cost numeric
);

create table public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.waste_items(id),
  quantity numeric not null,
  day_part_id uuid references public.day_parts(id),
  note text,
  logged_by uuid references public.profiles(id),
  logged_at timestamptz not null default now()
);
