# Agent map: file / table ownership matrix

Derived from `PLAN.md` "Phase graph" and the P1 stream briefs. This is the
reference every later agent checks before editing anything outside its own
brief (PLAN.md ground rules: "Work only in the files and tables your brief
says you own").

Shared/frozen after P0 (do not edit without an orchestrator sign-off; report
needed changes back instead):
- `lib/db/` (generated Supabase types)
- `lib/auth/permissions.ts`
- `lib/events/bus.ts`
- `lib/tokens/ledger.ts` (interface only until S7)
- `lib/notify/` (skeleton until S10)
- `components/ui/`
- `supabase/migrations/`

P0 (this scaffold) additionally owns, as core/foundation (not any P1 stream):
- Tables: `stores`, `profiles`, `roles`, `role_permissions`, `teams`,
  `team_members`, `day_parts`, `positions`, `position_groups`, `app_events`
- Routes/dirs: `/people`, `components/shell/`, app shell, PWA shell, CI config

| Stream | Owns tables | Owns routes / dirs |
|---|---|---|
| S1 Checklists | `checklist_templates`, `checklist_sections`, `checklist_questions`, `checklist_schedules`, `checklist_runs`, `checklist_answers`, `follow_ups`, `food_items` | `/checklists`, `/checklists/templates`, `components/checklists/` |
| S2 Tasks | `task_templates`, `tasks` | `/tasks`, `components/tasks/` |
| S3 Setups, shifts, breaks, layout | `position_groups`*, `positions`*, `setup_templates`, `setup_template_positions`, `setups`, `setup_assignments`, `shift_notes`, `store_layouts`, `layout_tiles`, `break_rules`, `breaks` | `/setups`, `/setups/templates`, `/breaks`, `components/setups/`, `components/breaks/` |
| S4 Ratings, passports, talent lifecycle | `rating_rubrics`, `position_ratings`, `rerate_prompts`, `passports`, `passport_items`, `passport_enrollments`, `passport_item_progress`, `onboarding_roadmaps`, `roadmap_stations`, `trainee_enrollments`, `station_progress`, `graduation_audits`, `training_sessions`, `org_tiers`, `org_slots`, `training_courses`, `course_attachments`, `course_feedback` | `/ratings`, `/training`, `/training/grid`, `/training/schedule`, `/training/graduates`, `/training/pipelines`, `/people/org-chart`, `components/training/` |
| S5 Waste | `waste_categories`, `waste_items`, `waste_entries` | `/waste`, `components/waste/` |
| S6 Accountability | `accountability_settings`, `infraction_types`, `infractions`, `disciplinary_action_types`, `disciplinary_actions` | `/accountability`, `components/accountability/` |
| S7 Tokens, rewards, feed | `token_earning_rules`, `token_transactions`, `rewards`, `reward_claims`, `feed_posts`, `feed_likes`, `feed_comments` | `/rewards`, `/tokens`, `/team`, `components/tokens/`, `components/feed/`, implementation behind `lib/tokens/ledger.ts` |
| S8 Vendors + maintenance | `vendors`, `equipment`, `equipment_files`, `maintenance_requests`, `work_orders`, `work_order_comments`, `equipment_downtime`, `pm_schedules` | `/vendors`, `/maintenance`, `/maintenance/equipment`, `components/maintenance/` |
| S9 Catering | `catering_menu_items`, `catering_contacts`, `catering_orders`, `catering_order_items`, `catering_checklist_defaults`, `catering_checklist_items`, `catering_followups` | `/catering` and children, `components/catering/` |
| S10 Notifications + Discord | `notifications`, `push_subscriptions`, `discord_channels`, `discord_event_routes`, `discord_outbox` | `/notifications`, `/settings`, `/settings/discord`, `components/notifications/`, worker code under `lib/notify/` and `lib/discord/` |

\* `position_groups` / `positions` content is core/foundation (seeded by P0
for the store's stations), but S3 owns the setup-board UI built on top of
them.

## Phase 2 integration agents

| Agent | Owns |
|---|---|
| Wiring | Named cross-module integration points only (setup posting → S1/S2 auto-assign, S3 auto-place → S4 ratings, badges, overdue event wiring). No module internals. |
| Reporting | `/reports`, read-only queries over other modules' tables, CSV export. |
| Seed + E2E | Seed data additions (KitchenIQ checklist template names, Avondale roadmap confirmation), Playwright E2E specs wired into CI. |

## Review checklist (every PR, from PLAN.md)

- Idempotency of writes (posting twice, double submits).
- Money-math on any token path: ledger only, no stored balances.
- Auth/permission gaps: server-side `requirePermission()` checks + RLS
  actually restrict, not just UI hiding.
- Spec drift against the named ARCHITECTURE.md section.
- No edits outside the files/tables this matrix lists for that stream.
