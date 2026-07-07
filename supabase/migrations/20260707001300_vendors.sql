-- Vendors
-- ARCHITECTURE.md "Data model (Postgres)" > Vendors

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  rep_name text,
  phone text,
  email text,
  account_number text,
  delivery_days text[],
  website text,
  notes text,
  active boolean not null default true
);

-- Deferred FK from 20260707000400_courses.sql, now that vendors exists.
alter table public.training_courses
  add constraint training_courses_vendor_id_fkey
  foreign key (vendor_id) references public.vendors(id);
