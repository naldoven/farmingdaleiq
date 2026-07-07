-- Catering
-- ARCHITECTURE.md "Data model (Postgres)" > Catering

create table public.catering_menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  components jsonb,
  scaling_rules jsonb,
  active boolean not null default true
);

create table public.catering_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.catering_orders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.catering_contacts(id),
  guest_name text not null,
  phone text,
  email text,
  event_date date not null,
  event_time time,
  headcount int,
  amount numeric,
  stage text not null default 'new'
    check (stage in ('new', 'confirm', 'setup', 'out', 'followup', 'closed')),
  fulfillment text check (fulfillment in ('pickup', 'delivery')),
  delivery_address text,
  paper_goods boolean not null default false,
  source text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  stage_changed_at timestamptz
);

create table public.catering_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.catering_orders(id) on delete cascade,
  menu_item_id uuid not null references public.catering_menu_items(id),
  qty int not null default 1
);

create table public.catering_checklist_defaults (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('confirm', 'setup', 'kitchen_prep', 'out')),
  label text not null,
  sort int not null default 0,
  active boolean not null default true
);

create table public.catering_checklist_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.catering_orders(id) on delete cascade,
  stage text not null check (stage in ('confirm', 'setup', 'kitchen_prep', 'out')),
  label text not null,
  done boolean not null default false,
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  sort int not null default 0
);

create table public.catering_followups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.catering_orders(id) on delete cascade,
  contact_id uuid references public.catering_contacts(id),
  due_on date,
  done_at timestamptz,
  outcome text,
  note text
);
