-- Physical packing is a day-before task. Keep only the four packing
-- sections and move the old final checks into Pickup/Delivery instead.

update public.catering_checklist_items
set setup_section = 'paper_goods'
where setup_section = 'equipment';

delete from public.catering_checklist_items
where setup_section in ('packaging', 'delivery');

update public.catering_checklist_items
set
  stage = 'out',
  setup_section = null,
  label = regexp_replace(label, ' - 1$', '')
where setup_section = 'final_check';

alter table public.catering_checklist_items
  drop constraint if exists catering_checklist_items_setup_section_check;

alter table public.catering_checklist_items
  add constraint catering_checklist_items_setup_section_check
  check (
    setup_section is null
    or setup_section in (
      'food',
      'paper_goods',
      'sauces_dressings',
      'beverages'
    )
  );
