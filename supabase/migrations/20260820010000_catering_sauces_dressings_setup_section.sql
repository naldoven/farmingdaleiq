-- Keep ordered sauce bottles, dressings, sauce packets, and tray condiments
-- separate from food in a physical catering setup. Existing section values
-- remain valid so historical setup rows do not need to be rewritten.

alter table public.catering_checklist_items
  drop constraint if exists catering_checklist_items_setup_section_check;

alter table public.catering_checklist_items
  add constraint catering_checklist_items_setup_section_check
  check (
    setup_section is null
    or setup_section in (
      'food',
      'packaging',
      'paper_goods',
      'sauces_dressings',
      'beverages',
      'equipment',
      'delivery',
      'final_check'
    )
  );
