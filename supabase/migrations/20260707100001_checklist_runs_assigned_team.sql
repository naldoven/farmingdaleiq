-- FIQ parity R10 (Checklists #10, HIGH): "assign to team" is a write-only field.
-- The schedule editor writes checklist_schedules.assign_team_id, but checklist_runs
-- had no team column, so team-scheduled runs materialize indistinguishable from
-- unassigned and nobody can see or filter by the owning team.
--
-- Schema-only fix: add the nullable team column plus an index. The checklists
-- code lane copies checklist_schedules.assign_team_id into it during run
-- materialization / setup fan-out and surfaces it on /checklists. On team delete
-- the run is un-assigned (set null), not destroyed.
--
-- Idempotent: add-column-if-not-exists + create-index-if-not-exists.

alter table public.checklist_runs
  add column if not exists assigned_team_id uuid references public.teams(id) on delete set null;

create index if not exists checklist_runs_assigned_team_id_idx
  on public.checklist_runs (assigned_team_id);
