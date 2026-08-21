-- A catering receipt's nested sauce/dressing line is the exact packing
-- instruction. Keep that durable data on the order instead of deriving a
-- generic tray condiment later.
alter table public.catering_orders
  add column if not exists selected_condiments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(selected_condiments) = 'array');

-- Physical order setup is supplies-only. Food remains on the receipt and
-- kitchen prep checklist, not in the day-before FOH packing list.
delete from public.catering_checklist_items
where setup_section = 'food';

alter table public.catering_checklist_items
  drop constraint if exists catering_checklist_items_setup_section_check;

alter table public.catering_checklist_items
  add constraint catering_checklist_items_setup_section_check
  check (
    setup_section is null
    or setup_section in (
      'paper_goods',
      'sauces_dressings',
      'beverages'
    )
  );
