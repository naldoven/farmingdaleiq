-- Physical catering-order setup lists. The existing checklist rows remain the
-- editable, completion-tracked record; these two fields distinguish the
-- generated physical setup from legacy stage-default rows and make generation
-- safe to retry without creating a second master list.

alter table public.catering_orders
  add column if not exists setup_generated_at timestamptz;

alter table public.catering_checklist_items
  add column if not exists setup_section text
  check (setup_section in (
    'food',
    'packaging',
    'paper_goods',
    'beverages',
    'equipment',
    'delivery',
    'final_check'
  ));

create index if not exists catering_checklist_items_order_setup_section_idx
  on public.catering_checklist_items (order_id, setup_section)
  where setup_section is not null;
