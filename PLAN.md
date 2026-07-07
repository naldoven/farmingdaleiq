# FarmingdaleIQ Build Plan (agent fan-out)

The execution plan for building everything in ARCHITECTURE.md with parallel AI
agents. One orchestrator session runs this plan with the Workflow tool. Builders
run on sonnet, planning and review run on opus, nothing spawns on Fable.

## Ground rules (every agent)

- Read ARCHITECTURE.md sections named in your brief before writing code. The spec
  is law; do not invent scope.
- Stack: Next.js App Router + TypeScript, Tailwind + shadcn/ui, Supabase
  (Postgres, Auth, Realtime, Storage), Vitest for unit tests, Playwright for E2E.
- Work only in the files and tables your brief says you own. Shared code
  (`lib/`, `components/ui/`, migrations, generated types) is frozen after
  Phase 0; if you need a change there, report it back instead of editing.
- Where a Farmingdale value is unknown, seed the Avondale default and mark it
  `// SEED-DEFAULT` so it is findable later.
- Gates before any PR: `npm run typecheck && npm run lint && npm run test &&
  npm run build`. All green or no PR.
- Every server action validates permissions server-side. UI hiding is not
  security; RLS and permission checks are.

## Phase graph

| Phase | What | Agents | Depends on | Est. wall clock |
|---|---|---|---|---|
| P0 | Scaffold + full schema + contracts | 1 builder + 1 reviewer | Supabase keys from Naldo | 1-2 h |
| P1 | Module fan-out, 10 parallel streams | 10 builders + review per PR | P0 merged | 3-5 h (parallel) |
| P2 | Integration wiring + reporting + seed + E2E | 3-4 builders | P1 streams merged | 2-3 h |
| P3 | Adversarial review fleet + fixes + deploy | 4-6 reviewers + fixers | P2 merged | 1-2 h |

Total: roughly one working day of wall clock if P1 runs fully parallel.

## Phase 0: scaffold (single agent, everything else waits)

Goal: a deployable empty app with the complete database and every shared
contract, so ten streams can build without touching each other.

Deliverables:
1. Next.js App Router project at repo root: TypeScript strict, Tailwind,
   shadcn/ui installed, PWA shell (manifest, service worker, install prompt),
   app shell with nav skeleton for the full page map in ARCHITECTURE.md.
2. Supabase migrations creating EVERY table in the "Data model (Postgres)"
   section, exactly as specced (all modules, including catering and trainee
   lifecycle), plus RLS enabled on every table with a default-deny policy and
   the `has_permission(key)` SQL helper from "Technical architecture".
3. Seed migration: Farmingdale values from "Store configuration": store row,
   6 dayparts, 10 roles with rankings, infraction types + points, disciplinary
   ladder, rewards + token costs, break rule (6 h -> 30 min), Cold/Hot food
   items, permission keys per role (sensible defaults, marked SEED-DEFAULT).
4. Shared contracts in `lib/` (these are the merge-safety backbone):
   - `lib/db/` generated Supabase types, one-time generation
   - `lib/auth/permissions.ts` permission keys enum + `requirePermission()`
   - `lib/events/bus.ts` app event bus: typed `emitEvent(key, payload)` writing
     to a Postgres `app_events` table; consumers (tokens, notifications,
     Discord outbox) subscribe by event key. Event keys enum includes every
     `discord_event_routes` key in the spec.
   - `lib/tokens/ledger.ts` interface only: `award/gift/redeem` signatures over
     `token_transactions`, balance always computed from the ledger
   - `lib/notify/` notification insert + web push sender skeleton (VAPID)
   - `components/ui/` shadcn base set + CFA-red design tokens matching the
     Avondale hubs' look
5. CI: GitHub Actions running the four gates on every PR.
6. People & Teams admin (this is the People/Teams module from the scope row;
   it lives in P0 because every stream depends on it): `/people` roster with
   badges placeholder, profile page (contact, role, birthdate, hired_on,
   discord_user_id field), role assignment, teams CRUD, invite/create user
   flow via Supabase Auth admin API.
7. Vercel project linked to repo, env vars set, `main` deploys.
8. `docs/agent-map.md`: file/table ownership matrix copied from the briefs
   below, so every later agent can check what it may touch.

Done when: fresh clone + `npm ci` + `npm run dev` shows the logged-in shell,
migrations apply clean to the new Supabase project, CI green on main.

## Phase 1: module streams (parallel, one worktree each)

Merge protocol for every stream: worktree branch `feat/<stream>` -> PR -> CI
gates green -> opus review agent approves (checklist below) -> orchestrator
merges. On conflict: rebase on main, rerun gates, re-review. PRs are scoped to
the stream's owned files, so conflicts should be near zero.

Review agent checklist (every PR): idempotency of writes (posting twice, double
submits), money-math on any token path (ledger only, no stored balances),
auth/permission gaps (server-side checks + RLS actually restrict), spec drift
against the named ARCHITECTURE.md section, no edits outside owned files.

### S1 Checklists
- Read: "Checklists" section, checklist tables, `/checklists` routes.
- Owns tables: checklist_templates, checklist_sections, checklist_questions,
  checklist_schedules, checklist_runs, checklist_answers, follow_ups,
  food_items content. Owns routes/dirs: `/checklists`, `/checklists/templates`,
  `components/checklists/`.
- Build: template builder (sections, question types yes_no, number,
  temperature with cold/hot holding mode picker, text, multi choice, N/A flag,
  photo required, token value), schedules (daily, weekly, monthly, persistent,
  days of week, day-part, start/due), run player UI (mobile first), temp
  out-of-range forces corrective action, flagged answers spawn follow_ups,
  completion emits `checklist_complete` event. Nightly run materialization as a
  Supabase scheduled function.
- Done: create template -> schedule -> run appears -> complete with a failed
  temp -> corrective action forced -> follow-up created -> event emitted.

### S2 Tasks
- Read: "Tasks (To-Dos)" section, task tables, `/tasks` route.
- Owns: task_templates, tasks; `/tasks`, `components/tasks/`.
- Build: ad hoc + recurring tasks, person or position assignment, shift pool
  for unassigned, leader delegation, due handling, completion emits
  `task_complete` event with token_value. System-created task kinds
  (reward_fulfillment, follow_up, lead_duty) accepted via event bus consumer.
- Done: recurring template materializes, pool delegation works, completion
  emits event.

### S3 Setups, shifts, breaks, layout
- Read: "Setups & Shifts", "Breaks", "Highlight badges & store layout",
  related tables, `/setups` `/setups/templates` `/breaks` routes.
- Owns: day_parts content, position_groups, positions, setup_templates,
  setup_template_positions, setups, setup_assignments, shift_notes,
  store_layouts, layout_tiles, break_rules, breaks; `/setups`,
  `/setups/templates`, `/breaks`, `components/setups/`, `components/breaks/`.
- Build: template editor, visual layout editor (drag tiles on canvas, list
  fallback), create/assign/post setup (posting emits `setup_posted` with
  assignments payload), shift notes, roster views, badges (New, Minor, Trainee,
  Leader, Birthday, Needs Break) as computed helpers in own module, break
  engine (entitlement from rules, sequence by arrival, authorize/start/
  complete, overdue alerts via events), Top Performer prompt at shift end
  emitting `top_performer`.
- Auto-place suggestions: call a `lib` interface `getPositionRating(user,
  position)` stubbed to return null until S4 merges; wire-up happens in P2.
- Done: build setup from template on layout view, post it, breaks sequence
  generated, badges render.

### S4 Ratings, passports, talent lifecycle
- Read: "Position Ratings", "Training: Development Passports", "Trainee
  lifecycle", their tables, `/ratings` `/training*` `/people/org-chart` routes.
- Owns: rating_rubrics, position_ratings, rerate_prompts, passports,
  passport_items, passport_enrollments, passport_item_progress,
  onboarding_roadmaps, roadmap_stations, trainee_enrollments, station_progress,
  graduation_audits, training_sessions, org_tiers, org_slots, training_courses,
  course_attachments, course_feedback; `/ratings`, `/training`,
  `/training/grid`, `/training/schedule`, `/training/graduates`,
  `/training/pipelines`, `/people/org-chart`, `components/training/`.
- Build: quick rate + rubric rate, skills matrix with color coding, 30-day
  rerate prompts, passports (5 item types, trainer countersign, 3-star stamp
  gate, role upgrade on leadership stamp), station grid (click to cycle, score
  writes position_ratings + item progress), trainee week schedule with tags +
  print CSS, graduation + 30-day audit PASS/PIP, pipelines as leadership
  passports with track field, org chart editor with tier goals + vacancy
  counts + auto-fill on stamp. Seed Avondale FOH roadmap (21 stations) and
  both pipeline stage lists as SEED-DEFAULT.
- Done: enroll trainee -> score stations -> graduate -> audit; stamp a
  leadership passport -> role upgrades -> org slot fills.

### S5 Waste
- Read: "Waste" section + tables, `/waste` route.
- Owns: waste_categories, waste_items, waste_entries; `/waste`,
  `components/waste/`.
- Build: fast mobile logging (item, quantity, count or weight), admin CRUD,
  rollup views by item/category/period.

### S6 Accountability
- Read: "Infractions & Accountability" + tables, `/accountability` route.
- Owns: accountability_settings, infraction_types, infractions,
  disciplinary_action_types, disciplinary_actions; `/accountability`,
  `components/accountability/`.
- Build: issue infraction (recipient never sees issuer: enforce in RLS view,
  not just UI), rolling 60-day expiry job, threshold trigger creating
  disciplinary_actions + `disciplinary_triggered` event, my-record view,
  admin CRUD. Privacy rule: no Discord/event fan-out except the specced
  leaders-channel option with no point details.
- Done: issue -> points roll up -> threshold fires action -> expiry removes.

### S7 Tokens, rewards, feed
- Read: "Tokens & Rewards", "Team Feed" + tables, `/rewards` `/tokens` `/team`.
- Owns: token_earning_rules, token_transactions, rewards, reward_claims,
  feed_posts, feed_likes, feed_comments; `/rewards`, `/tokens`, `/team`,
  `components/tokens/`, `components/feed/`, and the implementation behind
  `lib/tokens/ledger.ts`.
- Build: ledger implementation (append-only, balance computed, redemption
  validates inside a transaction), earning-rule consumer of `task_complete`,
  `checklist_complete`, `top_performer` events, recognitions, gifting with
  balance cap, rewards store + claim -> fulfillment task via event, feed with
  likes/comments + realtime.
- Done: complete task -> tokens appear; claim reward -> ledger debit +
  fulfillment task; concurrent double-claim cannot overspend (test proves it).

### S8 Vendors + maintenance
- Read: "Vendors", "Maintenance" + tables, `/vendors` `/maintenance*` routes.
- Owns: vendors, equipment, equipment_files, maintenance_requests, work_orders,
  work_order_comments, equipment_downtime, pm_schedules; `/vendors`,
  `/maintenance`, `/maintenance/equipment`, `components/maintenance/`.
- Build: vendor directory, request submit with photos -> triage approve/decline
  -> work order lifecycle with comments/photos/cost/invoice, equipment registry
  with downtime spans, PM schedules generating work orders lead_days early
  (scheduled function), maintenance events emitted per spec.
- Done: request -> approve -> assign vendor -> complete with cost; PM schedule
  auto-generates next order.

### S9 Catering
- Read: "Catering" section + tables, `/catering*` routes.
- Owns: all catering_* tables; `/catering` and children,
  `components/catering/`.
- Build: pipeline kanban (drag + stage dropdown, new-order strip), order detail
  (menu items from catalog, headcount, amount, fulfillment, paper goods,
  notes), per-stage checklists materialized from defaults with add/remove, FOH
  setup auto-scaling from items + headcount via scaling_rules, This Week
  calendar, stage queues, contacts with computed rollups, follow-up queue on
  close, history filters, analytics page, `catering_order_new` +
  `catering_stage_change` events. Seed Avondale default checklist items +
  a starter menu as SEED-DEFAULT.
- Done: create order -> walk all stages with checklists -> close -> follow-up
  queued -> analytics update.

### S10 Notifications + Discord
- Read: "Notifications", "Discord integration" + tables, `/notifications`
  `/settings/discord` routes.
- Owns: notifications, push_subscriptions, discord_channels,
  discord_event_routes, discord_outbox; `/notifications`, `/settings`,
  `/settings/discord`, `components/notifications/`, worker code under
  `lib/notify/` and `lib/discord/`.
- Build: event-bus consumer mapping event keys to in-app notifications + web
  push (PWA prompt flow for iPhone per spec), Discord settings page (webhook
  URLs server-side only, never sent to client), event route mapping UI,
  outbox worker with retry/backoff (scheduled function), @mention embedding
  from profiles.discord_user_id, notify_discord flag handling, privacy rule
  for accountability events.
- Done: emitted test events land in notification center, push, and outbox;
  outbox drains to a test webhook with retries on failure.

## Phase 2: integration (after P1 merges)

Three agents in sequence-safe slices:
1. **Wiring agent**: setup posting auto-assigns position-linked checklists and
   tasks (S3 -> S1/S2), auto-place uses real ratings (S3 -> S4), badges use
   break engine + trainee status across modules, overdue jobs emit events end
   to end. Owns only the named integration points; reviewer confirms no module
   internals rewritten.
2. **Reporting agent**: `/reports` store dashboard (overdue to-dos, flagged
   answers, waste spikes, pending claims, near-threshold employees, open work
   orders, down equipment, catering follow-ups due) + per-module report tables
   with CSV export. Read-only over other modules' tables.
3. **Seed + E2E agent**: import KitchenIQ checklist template names as draft
   templates, Avondale roadmap confirmation pass, then Playwright E2E covering
   the ten done-definitions above, wired into CI.

## Phase 3: hardening + ship

- Adversarial review fleet (opus, 4-6 agents, one lens each): RLS audit table
  by table, token money-math, idempotency sweep (double-post, double-claim,
  double-stamp), permission matrix vs UI reachability, PWA/mobile pass,
  Discord privacy rule. Findings -> fix agents (sonnet) -> re-review.
- Deploy checklist: Vercel env vars, Supabase prod config, VAPID keys, first
  admin account for Naldo, invite flow for the roster.

## Orchestration runbook (for the orchestrator session)

1. Preflight: Naldo supplies Supabase URL + anon key + service key (paste into
   `.env.local`, never chat), confirms Vercel account. Unset ANTHROPIC_API_KEY
   before any `npm run dev` (machine rule). OneDrive: pause sync or accept
   `npm ci` recovery on vanished node_modules; prefer worktrees under the
   scratchpad dir, not OneDrive.
2. P0: `Workflow` run, single `agent()` (model sonnet, effort high) building
   the scaffold brief, then one opus review agent; merge to main.
3. P1: `Workflow` run fanning out S1-S10 as `agent()` calls (model sonnet,
   `isolation: 'worktree'`), each brief pasted verbatim from this file plus:
   "repo at <path>, branch from main, open PR when gates green." Pipeline each
   stream into its own opus review agent; orchestrator merges approved PRs as
   they land, oldest first, rebase-on-conflict.
4. P2: three agents as above (wiring, reporting, seed+E2E), wiring first, the
   other two parallel after it merges.
5. P3: review fleet fan-out (opus), collect findings, fix agents (sonnet),
   re-run E2E, deploy.
6. Naldo in parallel: positions list, branding call, catering menu, Discord
   webhooks, KitchenIQ tails (infraction/reward list ends, per-role
   permissions, checklist contents for migration).

## Risks

| Risk | Mitigation |
|---|---|
| Schema drift between streams | P0 owns ALL migrations; streams cannot add columns, only report needs back |
| Two streams edit shared files | Ownership matrix + review checklist rejects out-of-scope diffs |
| RLS blind spots | Default-deny in P0, per-stream policies reviewed, dedicated P3 RLS audit |
| Token math races | Ledger-only balances, transaction-wrapped redemption, concurrency test required in S7 |
| OneDrive kills node_modules across 10 worktrees | Worktrees outside OneDrive when possible; `npm ci` + restart is the standard recovery |
| Setup-board UX unknown (lives in KitchenIQ tablet app we cannot see) | Build from Avondale layout-editor pattern + spec; flag for Naldo UAT early |
| Event bus becomes a bottleneck contract | Defined fully in P0 with every event key enumerated; changes require orchestrator sign-off |
| Auto-merge lets a bad PR through | Gates + opus review both required; P3 fleet is the backstop before deploy |
