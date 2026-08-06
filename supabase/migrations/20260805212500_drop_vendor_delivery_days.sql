-- Vendor delivery schedules are not tracked in FarmingdaleIQ.
alter table public.vendors drop column if exists delivery_days;
