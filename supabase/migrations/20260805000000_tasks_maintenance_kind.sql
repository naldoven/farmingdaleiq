-- Widens tasks.kind to accept 'maintenance', so a work order assigned to a
-- team member can show up in their personal Task list with its own icon/
-- label (components/tasks/task-list.tsx KIND_LABELS/KIND_ICONS) rather than
-- the generic 'adhoc'. See app/(app)/tasks/maintenance-sync.ts for the
-- reconciliation job that creates/clears these tasks.

alter table public.tasks drop constraint tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check
  check (kind in ('adhoc', 'recurring', 'reward_fulfillment', 'follow_up', 'lead_duty', 'maintenance'));
