# KitchenIQ Parity Audit: FarmingdaleIQ

> **SECTION PENDING: live-UX comparison (real KitchenIQ vs deployed app) to be appended by the orchestrator.**

FarmingdaleIQ is an independent reimplementation of KitchenIQ built from the captured `ARCHITECTURE.md` spec and the `PLAN.md` build plan, not a fork or a port of KitchenIQ's own code. This document audits how close the current FarmingdaleIQ code is to the intended KitchenIQ behavior, module by module. Every finding here comes from reading the FarmingdaleIQ source, checking the live Supabase project (project `rzecsczyfindpolkdazl`, via the Management API, read only), and reviewing the existing test suites. It does not yet reflect a side-by-side click-through of the real KitchenIQ tablet app against the deployed FarmingdaleIQ app. That live-UX comparison pass is done separately and will be appended above.

## Executive summary

FarmingdaleIQ is structurally complete. All 13 modules exist, are wired to real Supabase tables with RLS, and carry unit tests that pass. The server-action layers, state machines, and pure logic are generally well engineered. The gaps are concentrated in three places: cross-module event wiring, features that exist in the schema/UI but were never connected end to end, and empty seed data that makes several modules unusable against the live database today.

The single largest theme is a **systemic event-payload field-name mismatch**. Producer modules (tasks, checklists, rewards, tokens, team) emit event payloads whose recipient/amount field names do not match what the consumer modules (tokens earning, notifications recipient extraction, tasks system-task creation) actually read. Because every module's unit tests fabricate their own payload shape instead of asserting against the real producer's emitted shape, all sides stay green while the integration is dead. This one class of bug independently breaks: auto-earning tokens on task and checklist completion, reward-claim fulfillment tasks, recognition/gift/reward-ready/follow-up in-app notifications, and task-assignment notifications. It is the highest-leverage fix in the backlog: a handful of field renames plus contract-level integration tests would restore several headline features at once.

The second theme is **cron reachability**. Two notification cron routes implement only POST while Vercel Cron invokes via GET, so the event drain and Discord outbox likely never run in production. Several cron routes also depend on secrets (`CRON_SECRET`, `TASKS_CRON_SECRET`, VAPID keys) that are absent from local env and could not be verified in Vercel.

The third theme is **empty live data**. Checklists have 19 draft templates with zero sections/questions/schedules; setups has training-roadmap station rows sitting in the positions table instead of real setup positions; waste, people, and most reporting source tables have zero rows. Much of this is expected pre-launch content work flagged in `ARCHITECTURE.md`'s own open questions, but it means several modules cannot be exercised end to end today independent of code correctness.

### Findings by severity

| Severity | Count |
|---|---|
| High | 30 |
| Medium | 50 |
| Low | 45 |
| **Total** | **125** |

### Findings by module

| Module | High | Med | Low | Total |
|---|---:|---:|---:|---:|
| Checklists | 3 | 6 | 3 | 12 |
| Tasks | 6 | 6 | 4 | 16 |
| Setups & Breaks | 4 | 5 | 5 | 14 |
| Training | 3 | 5 | 4 | 12 |
| Waste | 0 | 3 | 4 | 7 |
| Accountability | 1 | 3 | 3 | 7 |
| Tokens & Rewards | 3 | 1 | 2 | 6 |
| Maintenance | 2 | 4 | 4 | 10 |
| Catering | 2 | 4 | 3 | 9 |
| Notifications & Discord | 4 | 2 | 3 | 9 |
| People & Teams | 1 | 3 | 3 | 7 |
| Reporting | 0 | 5 | 4 | 9 |
| Auth / PWA / Home | 1 | 3 | 3 | 7 |
| **Total** | **30** | **50** | **45** | **125** |

---

## Checklists

### Intended behavior
Templates hold sections and questions (yes/no, number, temperature with holding-range forcing corrective action, text, multi-choice; with allow_na, photo_required, token_value). Schedules recur daily/weekly/monthly/persistent, restricted to days-of-week and day-part, with a start_time that blocks early completion and a due_time. Runs assign to a position (auto on Setup post), a team, or stay unassigned for mid-shift delegation. Flagged answers raise assignable follow-ups with due dates. Completion feeds reporting and auto-earns tokens. A nightly job materializes each day's runs.

### FarmingdaleIQ actual
Schema, RLS, template/section/question/schedule CRUD, the run player, temperature holding-range evaluation, manual flagging, idempotent follow-up creation, the nightly materialization cron, and the setup-post fan-out are implemented and covered by 59 passing unit tests plus one Playwright happy path. Several named behaviors are dropped or unwired: team assignment is write-only, there is no manual-delegation action, start_time is never enforced, the completion event uses a key the tokens consumer does not read, token_value never reaches the event, follow-ups carry no assignee/due-date/detail, and the list never shows assignment. Live DB has 19 draft templates and 0 schedules/runs.

### Gaps & bugs
- **[HIGH] Checklist completion never auto-earns tokens (event payload key mismatch)** — `completeRun()` emits `checklist_complete` with `completedBy`; the tokens consumer reads `payload.user_id`, so `userId` is null and the event is skipped every time. Token earning for checklists is fully non-functional despite the whole pipeline existing. Repro: complete a run, POST `/api/cron/tokens`; `awarded` stays 0. File: `app/(app)/checklists/actions.ts`. Fix: emit `user_id: completedBy` (or rename consumer to read `completedBy`); add an integration test running the real payload through `resolveAwardsForEvents`.
- **[HIGH] Per-question token_value never reaches the completion event** — `checklist_questions.token_value` is settable but `completeRun`'s payload omits it, so `resolveEarnAmount()` always falls back to the flat rule and high-value questions earn the same as zero-value ones. Repro: set token_value=25, complete, inspect the `app_events` row. File: `app/(app)/checklists/actions.ts`. Fix: sum question token_value in `completeRun` and include it in the payload.
- **[HIGH] "Assign to team" is a write-only UI field with no run-side effect** — the schedule editor writes `checklist_schedules.assign_team_id`, but `checklist_runs` has no team column (confirmed live) and neither the cron nor the setup fan-out read it, so team-scheduled runs materialize indistinguishable from unassigned. File: `supabase/migrations/20260707000700_checklists.sql`. Fix: add `checklist_runs.assigned_team_id`, copy it in the cron, surface team on `/checklists`.
- **[MED] No action to manually delegate an unassigned run mid-shift** — actions expose only start/save/complete/resolve; there is no `assignRun`/`reassignRun` and no UI control. File: `app/(app)/checklists/actions.ts`. Fix: add an `assignRun({runId, userId})` server action gated by a leader permission plus a picker on unassigned run rows.
- **[MED] start_time captured and displayed but never enforced** — no code path reads `start_time` during start/save/complete, so a run can be completed before its start time. Repro: schedule start_time=23:00, complete its run at 08:00; succeeds. File: `app/(app)/checklists/actions.ts`. Fix: in `completeRun` (and `startRun`) compare store-local now against `start_time` and reject if early.
- **[MED] follow-ups created with no assignee, no due date, generic text** — every follow-up inserts the same static description with no link back to the source question/run. Repro: fail two different questions; both follow-ups read identically. File: `app/(app)/checklists/actions.ts`. Fix: build description from the question/template, populate `assigned_to` and `due_at`.
- **[MED] `/checklists` list never shows assignment and has no "mine" filter** — the query selects assignment columns but renders only name/day-part/status, and filters only by date, so everyone sees every run with no owner shown. File: `app/(app)/checklists/page.tsx`. Fix: add an assignee/position column and a Mine vs All toggle.
- **[MED] Per-schedule Discord notify flag is unreachable and inert** — `notify_discord`/`discord_channel_id` exist live but no editor field sets them and the cron never forwards them, so a leader cannot mute Discord for one schedule. File: `app/api/cron/checklists/route.ts`. Fix: expose the fields in the editor/schema/create action and pass `notifyDiscord`/`discord_channel_id` on the `checklist_missed` emit.
- **[LOW] Persistent schedules can be given due_time + alert_on_incomplete, contradicting the documented invariant** — nothing blocks it, so a persistent run gets flipped to `missed`. File: `app/(app)/checklists/templates/validation.ts`. Fix: block those fields for persistent frequency or exclude persistent from the missed-sweep.
- **[LOW] Template editor fetches every checklist_question in the store** — the query has no section filter and filters client-side, a full-table scan per edit-page load. File: `app/(app)/checklists/templates/[templateId]/page.tsx`. Fix: add `.in('section_id', sectionIds)`.
- **[LOW] Stale comment claims app_events has no RLS policy** — a policy now exists; the comment will mislead future debugging. File: `app/(app)/checklists/actions.ts`. Fix: update/remove the comment.
- **[MED] Live data: zero schedules, all 19 templates empty drafts** — the module produces no runs a shift could complete today. File: `supabase/migrations/20260707070000_seed_checklist_templates.sql`. Fix: author real sections/questions/schedules for the highest-priority templates and set them active (content work).

---

## Tasks

### Intended behavior
One-off and recurring to-dos assigned to a person or position, with optional start/due times inside a shift. Unassigned tasks sit in a shift pool for the leader to delegate. The system creates tasks itself (reward fulfillment on a claim, follow-up on a flagged answer, lead duty on a setup post). Completing a task can award tokens. Assignment triggers a notification.

### FarmingdaleIQ actual
CRUD and the state machine are well engineered and permission-gated: create/claim/delegate/complete/cancel, nightly materialization, an overdue sweep, system-task consumption, and setup fan-out. All 33 unit tests pass, but every test mocks or fabricates the other side's payload shape, so extensive cross-module contract drift survived: token earning, reward-claim system tasks, and assignment notifications all read a field no task-module code writes. The UI has real gaps: no start/due inputs on the ad hoc form, no position visibility, and overdue tasks lose their action buttons.

### Gaps & bugs
- **[HIGH] Task completion never awards tokens** — `completeTask()` emits `task_complete` with `completed_by`; the tokens consumer reads `payload.user_id`, so every event is skipped. File: `app/(app)/tasks/actions.ts`. Fix: standardize the key across emitters and consumer; add a contract-level integration test.
- **[HIGH] Reward claims never create a reward_fulfillment task** — `system-tasks.ts` requires `payload.reward_claim_id`/`user_name`, but rewards emits `claim_id`/`user_id`/`reward_name`. Every event fails the guard. File: `app/(app)/tasks/system-tasks.ts`. Fix: read `claim_id`/`user_id`; add a test using the real payload.
- **[HIGH] Task assignment/overdue notifications never reach anyone** — emits carry the recipient as `assigned_user_id`, which `extractRecipientIds` does not recognize, so recipients is always empty; system-created tasks emit no recipient at all. File: `app/(app)/tasks/actions.ts`. Fix: emit a recognized key (e.g. `user_id`) or add `assigned_user_id` to the recipient extractor.
- **[HIGH] Ad hoc task form has no start-time or due-time fields** — the schema supports them but the form never renders or passes them, so ad hoc tasks always have null due_at and can never go overdue. File: `components/tasks/create-task-form.tsx`. Fix: add start/due inputs mirroring the template form.
- **[HIGH] Overdue tasks become permanently stuck** — Complete/Claim/Delegate only render for `pending`, so once a task flips to `overdue` there is no action but Cancel. File: `components/tasks/task-list.tsx`. Fix: render Complete for `overdue` in mine mode and include `overdue` in the pool filter.
- **[HIGH] Position-assigned one-off/pool tasks never resolve to a person and are invisible as position-linked** — setup fan-out only backfills recurring templates, never existing `tasks` rows with a position and null user; `TaskRowView` never carries `assigned_position_id`, so delegating to a position shows no visible change. File: `lib/integration/setup-fanout.ts`. Fix: backfill ad hoc position-linked tasks and add a position column to the row view.
- **[MED] Follow-up tasks from flagged answers lose all context** — checklists emit `{sourceAnswerId, runId}`, system-tasks reads `title`/`description`/assignee/`follow_up_id`, none present; the task is created but generic and untraceable. File: `app/(app)/tasks/system-tasks.ts`. Fix: align the payload or read `sourceAnswerId`/`runId` and look up content.
- **[MED] Task sync runs once a day, unlike every comparable cron** — materialize + overdue + system-events are bundled at `0 4 * * *`; a reward claim or follow-up won't become a task for up to 24h. File: `app/api/tasks/sync/route.ts`. Fix: split event processing onto a more frequent schedule.
- **[MED] Fixed 200-event lookback with no cursor** — bursts beyond 200 events permanently skip the oldest. File: `app/(app)/tasks/system-tasks.ts`. Fix: page ascending or track a durable cursor.
- **[MED] Per-task Notify Discord flag unreachable** — the columns exist but no form/schema/action reads them and the emit never forwards them. File: `app/(app)/tasks/validation.ts`. Fix: add the toggle, thread it through, include it in the emit payload.
- **[MED] Tasks sync cron is unauthenticated by default (fails open)** — auth only checks when `TASKS_CRON_SECRET` is set, and it is unset locally. File: `app/api/tasks/sync/route.ts`. Fix: fail closed in production like process-events.
- **[MED] Nightly recurring tasks with a pre-set assignee never emit task_assigned** — only ad hoc/claim/delegate paths emit it, so pre-assigned recurring tasks trigger no notification. File: `app/(app)/tasks/materialize.ts`. Fix: emit `task_assigned` for each inserted row that has an assignee.
- **[LOW] Stale comment claims tasks/task_templates RLS was never added** — it now exists live. File: `app/(app)/tasks/actions.ts`. Fix: update the comment.
- **[LOW] No way to edit an existing recurring template** — only Pause/Resume exists. File: `components/tasks/task-templates-table.tsx`. Fix: add an edit form/action.
- **[LOW] delegateTask cannot return a task to the pool** — the schema requires exactly one assignee, so un-assigning is impossible. File: `app/(app)/tasks/validation.ts`. Fix: allow clearing both fields as a distinct input.
- **[LOW] createTaskSchema.dueAt has no format validation** — a malformed datetime could reach the insert; moot until a UI field populates it. File: `app/(app)/tasks/validation.ts`. Fix: validate as ISO datetime.

---

## Setups & Breaks

### Intended behavior
A leader builds a Setup for a date+day-part from a template, assigns employees to positions, and Posts it, which puts each person's position on their home screen and auto-assigns position-linked checklists/tasks. Shift-leader tooling: Lead Duties, break management, Shift Notes, a roster view (full-day or hourly), and a Top Performer prompt. The break engine computes entitlement from configurable rule bands, sequences by arrival, moves breaks authorized -> started -> completed recording lag, alerts on overdue, and a compliance report shows pending/completed/overdue/missed over any range. Highlight badges render everywhere, computed not stored. A drag-and-drop layout editor mirrors the floor plan.

### FarmingdaleIQ actual
The server-action layer is strong: idempotent create/assign/post, real auto-place wired to ratings/passports, trainee-badge wiring, a correct break state machine, an overdue cron registered in vercel.json, and a thorough idempotent fan-out. Unit tests pass 92/92. But several spec pieces are unwired or absent: no compliance report, `missed` breaks are never computed, the Needs Break proactive path is never fed real data, no authorization-to-start lag surfaces, the visual canvas never renders a live posted board, and there is no hourly roster. Critically, the live DB cannot exercise any of this: the positions table holds training-roadmap stations, and all setup_templates/layout tables are empty.

### Gaps & bugs
- **[HIGH] Live DB: positions table holds training-roadmap stations, not setup positions** — 1 group ("FOH") with 21 onboarding station names; setup_templates/template_positions/store_layouts/layout_tiles all 0 rows, so a leader cannot create a Setup. File: `app/(app)/setups/templates/actions.ts`; live DB. Fix: seed real setup positions alongside the roadmap stations and build a default template/layout.
- **[HIGH] Self-heal seed button unreachable and no-ops once any position exists** — the button only shows when zero positions exist (there are 21), and `seedDefaultPositions()` inserts nothing when any group exists. File: `components/setups/positions-manager.tsx`; `app/(app)/setups/templates/actions.ts`. Fix: gate on "no setup-specific groups" and surface a distinct action.
- **[HIGH] Break compliance report does not exist** — `/breaks` shows one date/day-part; `/reports` has no breaks tab. File: `app/(app)/breaks/page.tsx`; `app/(app)/reports/page.tsx`. Fix: add a breaks report aggregating pending/completed/overdue/missed over a date range.
- **[HIGH] `missed` break status is dead code** — `isMissed()` has zero callers; the overdue cron only flips `authorized` to `overdue`, so an unauthorized break sits `pending` forever. File: `lib/breaks/entitlement.ts`; `lib/breaks/overdue.ts`. Fix: flag pending/authorized breaks `missed` once the day-part end passes.
- **[MED] RLS on setups/setup_assignments is broader than the app permission split** — the policies grant ALL to `setups.manage` OR `setups.post`, but the actions gate assign/remove on `setups.manage` only, so a `setups.post`-only Team Leader can write/delete directly. File: `supabase/migrations/20260707050000_app_events_and_rls_backfill.sql`. Fix: restrict insert/delete on setups/assignments to `setups.manage`.
- **[MED] Visual layout editor never renders the live posted board** — the canvas exists only under templates and shows position labels, never assigned people/badges/break state; `/setups` is list-only. File: `app/(app)/setups/page.tsx`; `components/setups/setup-board.tsx`. Fix: render layout_tiles with live assignment data (list/canvas toggle) or amend the spec.
- **[MED] Needs Break proactive path never fed real data** — call sites hardcode `breakDueAt: null` or pass `authorized_at`, so the pending-but-due branch never fires. File: `components/setups/setup-board.tsx`; `components/breaks/break-board.tsx`. Fix: compute a real dueAt from arrival + rule and pass it in.
- **[MED] Authorization-to-start lag never computed or surfaced** — `authorized_at`/`started_at` are stored but nothing derives the gap. File: `app/(app)/breaks/page.tsx`; `components/breaks/break-board.tsx`. Fix: add a computed lag column/metric.
- **[MED] setup-fanout dayPartMatches contradicts its own contract for a null day-part setup** — `if (!setupDayPart) return true` matches any day-part-specific schedule; untested. File: `lib/integration/setup-fanout.ts`. Fix: make a day-part-specific schedule not match a null-day-part setup, or update the comment.
- **[LOW] Break entitlement minutes computed then discarded** — no minutes column and no join back to break_rules, so the leader never sees entitled minutes. File: `app/(app)/breaks/actions.ts`; `app/(app)/breaks/page.tsx`. Fix: join break_rules and render minutes per row.
- **[LOW] Roster view only implements full-day, not hourly** — no hourly breakdown exists. File: `app/(app)/setups/page.tsx`. Fix: add an hourly view mode or mark it deferred.
- **[LOW] Under-qualified warning only appears after clicking Suggest** — direct dropdown assignment never triggers it. File: `components/setups/setup-board.tsx`. Fix: compute suitability for the assigned person on render.
- **[LOW] reorderTemplatePosition swaps via two non-atomic updates** — a mid-swap failure can duplicate sort values. File: `app/(app)/setups/templates/actions.ts`. Fix: wrap in one RPC/transaction or batched upsert.
- **[LOW] CRON_SECRET absent locally; overdue-break cron fails closed if unset in prod** — the one automated compliance signal would silently never run. File: `app/api/cron/breaks-overdue/route.ts`. Fix: confirm CRON_SECRET in Vercel and add a health signal on 403.

---

## Training

### Intended behavior
Quick rate (0-5) and full rubric ratings, a color-coded skills matrix, and 30-day re-rate nudges. Ratings feed auto-place in Setups. Development passports (check/slider/photo/signature/course items) that trainees complete, trainers countersign, and a leader stamps once complete + 3.0 rating (or all stages for leadership); leadership stamps can upgrade role and auto-fill an org slot. Trainee lifecycle over passports/ratings: a roadmap of stations in phases, a station grid that cycles Not started -> In training -> scored 1-5, a week schedule with editable tags and print view, graduation then a 30-day audit (PASS locks, PIP returns to development with a note), Masters/leadership pipelines, and an editable org chart auto-filled on a pipeline stamp.

### FarmingdaleIQ actual
Ratings, the matrix, the re-rate cron, passport auto-creation, enrollment, countersign, and the stamp gates are implemented and match the live schema/RLS. The station grid cycle-and-score writes a rating, marks passport items, auto-graduates and opens the audit. The graduates and org-chart pages render and are RLS-gated, and the auto-place wiring is genuinely connected. 62 unit tests pass. But several parts diverge: passport progress always stamps completed_at, non-checkbox item types have no UI, a PIP audit silently drops the trainee from the Graduates page, PIP notes/course content/attachments have no UI path, and org slots are neither auto-provisioned nor present live.

### Gaps & bugs
- **[HIGH] Passport item progress always marks completed_at** — `upsertItemProgress` writes `completed_at` on every call regardless of value, so unchecking cannot un-complete and any slider write instantly counts as complete, reaching stamp-ready prematurely. File: `app/(app)/training/actions.ts`. Fix: only set completed_at on real completion (checked, slider>=threshold, photo present) and clear it otherwise.
- **[HIGH] Slider/photo/course item types have no functional UI** — every non-signature type renders as a checkbox; no 0-100 slider, no photo input, no course link. File: `components/training/passport-card.tsx`. Fix: branch rendering per item type.
- **[HIGH] Recording a PIP audit makes the trainee disappear from Graduates** — `enrollmentStatusAfterAudit("pip")` returns `active`, but the page queries status in (graduated, pip), so PIP rows vanish and the `pip` status value is never written. File: `app/(app)/training/graduates/logic.ts`. Fix: set status to `pip`, or redesign the query so PIP history stays visible.
- **[MED] No UI to enter a note when recording a PIP audit** — the action supports `notes` but the buttons never collect it. File: `components/training/record-audit-buttons.tsx`. Fix: add a notes textarea on the PIP path.
- **[MED] Vendor-linked courses and course content unreachable** — the form has only name/description; content and vendor are never editable or rendered. File: `components/training/create-course-form.tsx`. Fix: add a vendor select and content editor and render course.content.
- **[MED] course_attachments and course_feedback fully unwired** — attachments have zero references; `submitCourseFeedback` is never called. File: `app/(app)/training/actions.ts`. Fix: add attachment UI and a feedback widget.
- **[MED] Org slots not auto-provisioned; live DB has 0 slots against 5 tiers** — createTier makes no slots and the seed adds none, so the pipeline-stamp auto-fill has nothing to fill. File: `supabase/migrations/20260707020100_training_seed.sql`. Fix: auto-create goal_count vacant slots on tier creation and/or seed them.
- **[MED] Re-rate cron nudges every stale rating, not actively-worked positions** — no check against recent assignments, so someone rated once is nudged forever. File: `app/api/cron/training/route.ts`. Fix: join recent setup_assignments before creating a prompt.
- **[LOW] Station grid never shows the trainer's initials** — `scored_by` is written but never selected/rendered. File: `components/training/station-cell.tsx`. Fix: select scored_by joined to profiles and surface it.
- **[LOW] Session tags hardcoded to 3 defaults and single-select** — no admin path to edit the list. File: `app/(app)/training/schedule/validation.ts`. Fix: make the tag list editable and allow multi-select.
- **[LOW] Click-to-cycle swallows failures silently** — the ActionResult is ignored, so a permission/DB error looks like nothing happened. File: `components/training/station-cell.tsx`. Fix: capture and surface the result error.
- **[LOW] Kitchen lifecycle non-functional out of the box** — the Kitchen roadmap is inactive with 0 stations. File: `supabase/migrations/20260707050000_app_events_and_rls_backfill.sql`. Fix: enumerate and seed Kitchen stations (backlog/content).

---

## Waste

### Intended behavior
Admins maintain waste items in categories (unit count or weight, optional cost). Anyone can log an entry (item + quantity). Entries roll up by item/category/period for food-cost impact, with a dashboard waste-spikes tile and a per-module report with CSV export.

### FarmingdaleIQ actual
Implemented end to end and solid. `/waste` has a Log tab, a manager Reports tab with period rollups, and a manager Admin tab for category/item CRUD. Server actions are permission-gated and RLS-enforced (verified live). The pure rollup logic is well tested (32/32) and reused by the central Reporting module for both the report and the spikes tile. Live DB has zero rows in all three tables (no seed data). No high-severity issues.

### Gaps & bugs
- **[MED] Rollups visible at a lower permission tier via /reports than via /waste** — `/waste`'s Reports tab gates on `waste.manage` (Shift Supervisor+), but `/reports` shows the same rollup gated on `reports.view` (Team Leader, one tier lower). File: `app/(app)/waste/page.tsx`. Fix: pick one gate for waste rollup visibility.
- **[MED] Quantity/unit_cost validated only in the app layer** — the columns have no CHECK and RLS doesn't check positivity, so a direct PostgREST insert can write a negative quantity/cost and corrupt rollups. File: `supabase/migrations/20260707000900_waste.sql`. Fix: add `check (quantity > 0)` and `check (unit_cost is null or unit_cost >= 0)`.
- **[MED] unit_cost is mutable and not snapshotted per entry** — editing an item's cost retroactively rewrites all historical rollups. File: `app/(app)/waste/logic.ts`. Fix: snapshot unit_cost/unit onto the entry at log time, or document the limitation.
- **[LOW] Recent-entries list (and its only delete control) capped at 25** — an older same-day mistake scrolls off with no other way to find/delete it. File: `app/(app)/waste/page.tsx`. Fix: add pagination/date-filter/search.
- **[LOW] No seed data in any waste table** — ships showing "no items" on day one. File: `supabase/migrations/20260707001900_seed_store_config.sql`. Fix: capture the real category/item list and seed it (content).
- **[LOW] Recent entries doesn't show who logged an entry** — `logged_by` is stored but never displayed. File: `app/(app)/waste/page.tsx`. Fix: join profiles and add a Logged-by column.
- **[LOW] No uniqueness check on category/item names** — duplicates create confusing split rows. File: `app/(app)/waste/actions.ts`. Fix: add a case-insensitive unique constraint or pre-insert check.

---

## Accountability

### Intended behavior
Admins define infraction types with point values; leaders issue infractions; the recipient sees the points but never the issuer (anonymity enforced in RLS/view). Points accumulate over a rolling 60-day period (each infraction expires 60 days after issuance). A disciplinary ladder auto-creates an action when points cross a threshold. Employees can always view their own record. Infractions never auto-post to Discord except redacted to an opted-in private leaders channel.

### FarmingdaleIQ actual
Schema, RLS, seed data, pure logic, validation, actions, the nightly expiry cron, and the page all exist and were confirmed against the live DB (7 types, 5 rungs, rolling/60, `my_infractions` view omits issuer, 20 role_permissions rows). Anonymity is genuinely RLS/view-enforced. Rolling expiry and ladder auto-fire are correct and unit-tested (34 tests). Discord redaction is unconditional and no route is auto-seeded. Only pure logic is tested; actions/queries/cron have no coverage.

### Gaps & bugs
- **[HIGH] Double-submit guard silently disabled for the two roles that actually issue** — the duplicate-check SELECT runs on the per-request client, but the only SELECT policy on `infractions` requires `accountability.manage`; Team Leader and Shift Supervisor hold only `accountability.issue`, so the query returns 0 rows and a double-submit inserts a second infraction that also double-counts points and can spuriously fire a threshold. File: `app/(app)/accountability/actions.ts`. Fix: run the duplicate check with the service-role client (as the threshold check already does).
- **[MED] Ladder does not re-fire a rung re-crossed inside the period window** — suppression is a flat 60-day lookback on `triggered_at`, so a legitimate re-crossing after decay is suppressed. File: `app/(app)/accountability/logic.ts`. Fix: base suppression on whether the rung's latest action is still unresolved; needs product sign-off.
- **[MED] No server-side guard against self-issuance** — only the UI filters out the caller; a direct call lets a leader issue points to themselves. File: `app/(app)/accountability/actions.ts`. Fix: reject when `parsed.userId === user.id`.
- **[MED] No test coverage for actions, queries, or cron** — the RLS-blocked duplicate bug ships green. File: `app/(app)/accountability/actions.ts`. Fix: add integration tests exercising issueInfraction as a Team-Leader-tier user plus a cron-route test.
- **[LOW] disciplinary_actions.status has no CHECK constraint** — a stray value silently drops out of the cron sweep and the badge logic. File: `supabase/migrations/20260707001000_accountability.sql`. Fix: add `check (status in ('pending','acknowledged','expired'))`.
- **[LOW] Admin delete buttons have no confirmation** — a stray click permanently removes an unused type/rung. File: `components/accountability/delete-row-button.tsx`. Fix: wrap in a confirm dialog.
- **[LOW] Stale comment claims app_events has no RLS policy** — a later hardening migration added one covering these event keys. File: `app/(app)/accountability/actions.ts`. Fix: update the comment.

---

## Tokens & Rewards

### Intended behavior
Employees auto-earn tokens on task/checklist completion; leaders send Recognitions (tokens + feed shoutout); the shift Top Performer gets a fixed bonus + shoutout; anyone can gift their own tokens capped by balance; a rewards store debits the ledger and creates a fulfillment task; balance is always the sum of an append-only ledger. The Team Feed shows recognitions/top-performer/broadcasts with likes and comments.

### FarmingdaleIQ actual
The ledger core, its SQL functions (redeem/gift/cancel/adjust with advisory locks), the reward store, claim/fulfillment UI, gifting, Recognitions/Broadcasts/likes/comments, and the tokens cron consumer are present and well built; RLS is correctly scoped (verified live) with a documented history of prior security fixes. But the event-driven auto-earn path is broken end to end: emitting modules send a different payload key than the consumer reads, so no task or checklist completion has ever awarded a token (confirmed in live production data). The reward-claim to fulfillment-task wiring has the same field-name bug. Recognitions are not double-submit safe.

### Gaps & bugs
- **[HIGH] Auto-earn on task completion never fires (completed_by vs user_id)** — `task_complete` carries `completed_by`; the resolver reads `payload.user_id`; every event is skipped. File: `app/(app)/tasks/actions.ts` + `app/(app)/tokens/logic.ts`. Fix: align the key; test the resolver against the real payload.
- **[HIGH] Auto-earn on checklist completion never fires** — `checklist_complete` carries `completedBy` and no token_value; same skip. Live: 3 events all `completedBy`, 0 processed rows. File: `app/(app)/checklists/actions.ts`. Fix: add `user_id: completedBy` (and token_value); fix test fixtures.
- **[HIGH] Reward claim never creates a fulfillment task (claim_id vs reward_claim_id)** — rewards emits `claim_id`; the tasks consumer reads `reward_claim_id`; no task is created and `fulfillment_task_id` stays null. File: `app/(app)/rewards/actions.ts` + `app/(app)/tasks/system-tasks.ts`. Fix: agree the field on the canonical side and update the other.
- **[MED] createRecognition is not double-submit safe** — it calls awardTokens then a separate feed insert with no idempotency, so a double-click double-credits, and a failed feed insert after a successful award leaves a phantom credit. File: `app/(app)/team/actions.ts`. Fix: wrap credit + post in one SECURITY DEFINER function keyed on an idempotency token.
- **[LOW] Nothing ever calls adjust_tokens()** — the only sanctioned manual-correction path has no wrapper or UI. File: `lib/tokens/ledger.ts`. Fix: add a wrapper and a tokens.manage admin control, or drop the function.
- **[LOW] Reward-claim fulfillment runs on a daily cron** — even once fixed, a claim waits until the 4am run. File: `vercel.json`. Fix: move reward_claim processing onto a more frequent schedule.

---

## Maintenance

### Intended behavior
A vendor directory (manage-gated write, everyone reads). Anyone submits a maintenance request and is notified as its status changes. A triage leader approves (sets priority/assignee/due, converts to a work order) or declines with a reason to the requester. Work orders move open -> in_progress -> on_hold -> complete/cancelled, assigned in-house or to a vendor, with a comment/photo thread and cost/invoice on completion. An equipment registry tracks details, downtime, and WO history. Time-based PM schedules auto-generate a work order lead_days before due, optionally attaching a checklist template. Reporting surfaces open/overdue WOs and down equipment plus time-to-resolution, spend, and repeat-failure reports.

### FarmingdaleIQ actual
Vendors CRUD, requests, triage, work-order CRUD and state machine, cost/invoice, the comment/photo thread, the equipment registry, PM CRUD, and the PM-generation cron are all implemented and match the migrations; RLS and permission keys verified live. All 34 unit tests pass. But several mandated behaviors are stubbed or unwired: the requester-notification loop, the PM checklist-procedure attachment, two of the three named reports, the per-instance Discord flag, and a UI authorization mismatch that shows every viewer work-order controls that always fail server-side.

### Gaps & bugs
- **[HIGH] Requester is never notified on status change** — approve/decline never select `submitted_by` or include a recipient, and `maint_request`/`work_order_status` are not in `NOTIFIABLE_EVENT_KEYS`, so no in-app/push/Discord path can reach the requester. File: `app/(app)/maintenance/actions.ts`. Fix: select `submitted_by`, include it as `userId`, add the keys to `NOTIFIABLE_EVENT_KEYS`.
- **[HIGH] No UI shows a request's resolution once it leaves the pending queue** — only pending rows are queried; `declined_reason` is written then never displayed anywhere. File: `app/(app)/maintenance/page.tsx`. Fix: add a My-requests/history view showing status + declined_reason.
- **[MED] PM "optional checklist procedure" is a non-functional stub** — `checklist_template_id` is a raw UUID input; the cron never creates a checklist_run or sets `checklist_run_id`. File: `app/api/cron/maintenance/route.ts`. Fix: create a checklist_run from the template on PM generation and link it; replace the UUID field with a picker.
- **[MED] Only 2 of 3 named reports exist** — no time-to-resolution, spend-by-equipment/month, or repeat-failure aggregation. File: `app/(app)/reports/logic.ts`. Fix: add the three aggregation helpers over work_orders.
- **[MED] notify_discord/discord_channel_id columns are dead** — never read, never forwarded, no toggle. File: `app/(app)/maintenance/actions.ts`. Fix: fetch and forward the flag into the emit; add a UI toggle.
- **[MED] Work-order detail shows interactive controls to every viewer** — StatusControls/CompleteForm render unconditionally, so a Team Member sees clickable buttons that always fail server-side. File: `components/maintenance/work-order-detail.tsx`. Fix: pass a precomputed canWrite boolean and hide the controls otherwise.
- **[LOW] createWorkOrder action exists but is never called from any UI** — no direct-WO-creation control. File: `app/(app)/maintenance/actions.ts`. Fix: add a New-work-order control for triage holders or remove the dead action.
- **[LOW] Equipment/PM actions have zero unit tests** — coercion and next_due_on defaulting untested. File: `app/(app)/maintenance/equipment/validation.ts`. Fix: add a validation test mirroring the sibling suite.
- **[LOW] Cron route header comment is stale** — claims no cron wiring, but vercel.json already schedules it at `0 5 * * *`. File: `app/api/cron/maintenance/route.ts`. Fix: update the comment.
- **[LOW] CRON_SECRET absent locally; PM auto-generation unreachable if unset in prod** — the route 401s with no secret. File: `app/api/cron/maintenance/route.ts`. Fix: confirm the secret in Vercel; log missing-vs-wrong secret distinctly.

---

## Catering

### Intended behavior
Orders capture guest/contact, event date/time, headcount, amount, fulfillment (pickup or delivery+address), paper-goods flag, notes, and menu line items whose components drive prep. A kanban pipeline (New -> Confirmation call -> FOH Setup -> Pickup/Delivery -> Follow-up -> Closed) moves cards, with a new-order-today strip and timestamped stage changes. Each order materializes editable per-stage checklists from admin-configurable defaults, with FOH/kitchen quantities auto-scaled. A This Week calendar and per-stage queues support prep. Every guest becomes a CRM contact; closing queues a re-book follow-up. Analytics computes totals/revenue/repeat-guest %/etc. Order/stage events route to Discord.

### FarmingdaleIQ actual
The pipeline board, drag+dropdown moves, new-order strip, per-stage queues, order detail, This Week calendar, History, Analytics, and menu admin are implemented and wired to real tables; actions enforce `catering.manage` and RLS re-checks (verified live) with seed data present. Pure logic (materialization, scaling, analytics, periods) is thoroughly tested (38/38) with correct math. Idempotency for stage no-ops and duplicate follow-ups is implemented. But there is no cancel/delete path, a menu-deactivation bug corrupts historical display, delivery address isn't required, Discord messages carry no details, there is no checklist-defaults admin UI, and date boundaries use UTC not store timezone.

### Gaps & bugs
- **[HIGH] No way to cancel or delete an order** — no cancel action and no `cancelled` stage; the only exit is forcing to `closed`, which queues a follow-up and permanently counts the amount in Analytics/History. File: `app/(app)/catering/actions.ts`. Fix: add a `cancelled` stage plus a cancelOrder action excluded from analytics and the follow-up queue.
- **[HIGH] Order detail shows "Unknown item" for deactivated menu items** — the name lookup filters `active=true`, but deactivation is the documented way to retire an item, so existing orders lose the label. File: `app/(app)/catering/orders/[id]/page.tsx`. Fix: drop the `active` filter on the name-lookup query.
- **[MED] Delivery orders don't require a delivery address** — no refinement ties address to fulfillment=delivery. File: `app/(app)/catering/validation.ts`. Fix: add a superRefine requiring address when delivery.
- **[MED] Discord posts carry no order details** — the payloads never set `message`/`title`, so every post is generic. File: `app/(app)/catering/actions.ts`. Fix: add a `message` field with guest/date/headcount and from/to stage.
- **[MED] No admin UI for per-stage checklist default templates** — the table has a write policy but nothing in the app writes it. File: `app/(app)/catering/actions.ts`. Fix: add CRUD for catering_checklist_defaults.
- **[MED] Analytics/history include every order regardless of stage** — unconfirmed New orders count in revenue. File: `app/(app)/catering/logic.ts`. Fix: filter by stage (likely confirmed/closed) or document the semantics.
- **[LOW] Today/period boundaries computed in UTC, not store timezone** — Eastern rollovers are 4-5h early. File: `app/(app)/catering/page.tsx`. Fix: compute boundaries from stores.timezone.
- **[LOW] Menu components/scaling_rules edited as raw JSON text** — a usability gap for non-technical admins. File: `components/catering/menu-item-form.tsx`. Fix: replace with row-based add/remove controls.
- **[LOW] Contact dedup has no DB constraint and no phone normalization** — differently formatted numbers split into multiple contacts. File: `app/(app)/catering/actions.ts`. Fix: normalize phone digits and add a unique index.

---

## Notifications & Discord

### Intended behavior
Events drive an in-app notification center (bell + unread badge) and Web Push (VAPID, iOS add-to-home-screen), plus Discord: per-channel webhooks (server-side URLs), @mentions from profiles.discord_user_id, a notify_discord flag + target channel on tasks/templates/checklist schedules/work orders/PM schedules, auto-post routing, a hard privacy rule that infractions/disciplinary never post except redacted to a private leaders channel, and a discord_outbox with retry/backoff. Routing is event-key based so a bot can replace webhooks later.

### FarmingdaleIQ actual
Solid foundation: app_events fans out to notifications, Web Push, and the Discord outbox, with careful dedupe/idempotency. The Discord settings page registers webhooks (service-role only, SSRF-safe), maps event keys to channels, and sends a live test. The privacy rule is unconditional and unit-tested. RLS is correctly scoped (verified live). 59 tests pass. But several pieces are schema/UI-only stubs: the per-item notify_discord flag is completely unwired, the bell/unread badge has no presence in the app shell, and several producer payloads use recipient field names the extractor doesn't recognize, silently dropping recognition/gift/reward-ready/follow-up notifications. Two cron routes implement only POST while Vercel Cron uses GET, so they likely never run; the event-drain query has no cursor.

### Gaps & bugs
- **[HIGH] process-events and discord-outbox implement only POST; Vercel Cron invokes via GET** — both scheduled routes will 405 on the cron path, so no app_events row is drained and no outbox row is delivered. Every sibling cron route exports GET for this reason. File: `app/api/jobs/process-events/route.ts`, `app/api/jobs/discord-outbox/route.ts`. Fix: add `export async function GET(req){ return POST(req); }` to both.
- **[HIGH] processAppEvents has no time bound or cursor** — it re-fetches the oldest 200 matching events every run; once cumulative volume exceeds 200 the window never advances and every newer event is never scanned. File: `lib/notify/events.ts`. Fix: add a time floor or an S10-owned cursor so the window advances.
- **[HIGH] notify_discord flag + per-item channel is schema-only** — no UI sets it, no producer reads it, and the consumer only honors an opt-out override nothing sends; routing is entirely global per event key. File: `lib/notify/events.ts` and each producer. Fix: add a toggle/channel picker, read and forward the flag in each producer's emit, prefer the payload channel over the global route.
- **[HIGH] Several NOTIFIABLE producers emit unrecognized recipient fields** — `gift_sent`/`recognition` use `to_user_id`, `reward_fulfilled` and `follow_up_assigned` carry no recipient, so those in-app notifications and their push never fire. File: `lib/notify/recipients.ts` and the producers. Fix: widen extractRecipientIds or fix each producer to a recognized key; add `assigned_to` to the follow_ups insert and the claim user_id to reward_fulfilled.
- **[MED] No bell icon or unread badge in the app shell** — `countUnreadNotifications` is dead code; only a plain sidebar link exists. File: `components/shell/app-shell.tsx`, `components/shell/nav-links.tsx`. Fix: render a Bell with the unread count.
- **[MED] VAPID keys and CRON_SECRET unconfigured** — push sends throw and cron routes fail closed in production. File: `lib/notify/push.ts` and both job routes. Fix: generate VAPID keys and set CRON_SECRET in Vercel.
- **[LOW] Discord settings copy claims employees self-link their Discord ID** — discord_user_id is admin-only everywhere (guarded by a trigger). File: `app/(app)/settings/discord/page.tsx`. Fix: add a genuine self-service link action or correct the copy.
- **[LOW] broadcast is in NOTIFIABLE_EVENT_KEYS but supplies no recipient** — it can never create a notification. File: `lib/notify/templates.ts`. Fix: fan broadcast to all active profiles or drop it from the list.
- **[LOW] No seed data for discord_channels/routes** — the Discord side does nothing until an admin configures it. File: `supabase/migrations/20260707001600_notifications_discord.sql`. Fix: seed starter routes once the channel plan exists (content).

---

## People & Teams

### Intended behavior
Every employee has a profile that aggregates their to-dos + completion history, accountability record, training progress, and token balance. Access is governed by granular permission keys grouped into 10 ranked roles. Admins edit contact/status, assign roles, manage teams, and invite/create users via Supabase Auth. Every write is server-gated by requirePermission and re-enforced by RLS, and a privilege guard blocks a user from escalating their own role/active/store/discord/name/email.

### FarmingdaleIQ actual
Roster, profile detail, role assignment, teams CRUD, and invite are implemented with a consistent requirePermission + RLS pattern (verified live). The self-privilege-escalation guard (a BEFORE UPDATE trigger) is correctly implemented and confirmed enabled. Roles seed correctly (10 roles, 296 role_permissions rows). Badges are cross-wired into roster/profile. But the profile page aggregates none of the personal record, there is no role/permission UI despite roles.manage existing, avatar_url has no edit path, and the live DB has zero auth users/profiles with no in-app bootstrap for the first admin. Tests are schema-validation only.

### Gaps & bugs
- **[HIGH] No bootstrap path for the first admin; live DB has zero users** — new signups always get the lowest role, and inviteUser requires people.manage that nobody holds yet; no seed creates an initial admin. File: `supabase/migrations/20260707000200_core.sql`; `app/(app)/people/actions.ts`. Fix: add a one-time bootstrap migration/script promoting a known user to Location Manager, or an ops-only bootstrap route.
- **[MED] Profile page does not aggregate the personal record** — no to-dos, accountability, training, or token balance on the page. File: `app/(app)/people/[id]/page.tsx`. Fix: add a read-only cross-module summary section.
- **[MED] No role/permission management UI** — roles.manage exists but nothing lets an admin view/edit role_permissions. File: `app/(app)/people/actions.ts` (comment only). Fix: build a roles x permission-keys matrix page, or descope roles.manage.
- **[MED] No self-service edit path despite the DB layer allowing one** — updateProfile unconditionally requires people.manage, so a user cannot edit their own phone even though RLS/the guard permit personal fields. File: `app/(app)/people/actions.ts`; `app/(app)/people/[id]/page.tsx`. Fix: add a self-edit action scoped to auth.uid() for personal fields, or drop the self-edit carve-out.
- **[LOW] avatar_url has no edit path** — it's in the model and marked self-editable but no schema/component references it. File: `app/(app)/people/validation.ts`. Fix: add an avatar field or drop the column.
- **[LOW] Zero test coverage for actions, gating, and the privilege guard** — the most security-critical trigger has no test. File: `app/(app)/people/validation.test.ts`. Fix: add action tests for the PermissionError path and an integration test attempting a self-escalation.
- **[LOW] Seeded role_permissions is an acknowledged placeholder cascade** — not the real per-role mapping. File: `supabase/migrations/20260707001900_seed_store_config.sql`. Fix: capture the real per-role permissions (content), ideally alongside the editor UI.

---

## Reporting

### Intended behavior
A store dashboard surfacing action items (overdue to-dos, flagged answers, waste spikes, pending claims, near-threshold employees, open/overdue work orders, down equipment, catering follow-ups). Per-module report tables (checklist completion/failures, waste by item/category/period, accountability, token/reward activity, training completion). CSV export on every table. Read-only over other modules' tables.

### FarmingdaleIQ actual
The page renders a Dashboard tab (all 8 tiles) plus Checklists/Waste/Accountability/Tokens/Training tabs, each backed by pure aggregations, typed select-only fetchers, and a shared ReportTable with CSV export (RFC4180 + formula-injection guarded). Permission gating mirrors the live RLS. 41 unit tests pass. But a tasks status-literal typo makes the base fetch unbounded, the waste period is hardcoded, the spike math can inflate on partial baselines, the maintenance reports are absent, and there is no e2e coverage. Live source tables are almost entirely empty.

### Gaps & bugs
- **[MED] fetchBaseReportData filters tasks by the wrong status literal** — `.neq("status","complete")` never matches (the app writes `completed`), so `/reports` fetches the entire tasks table every load. Client-side filtering keeps the tile correct today but the query is unbounded. File: `app/(app)/reports/queries.ts`. Fix: use `completed` or `.in("status",["pending","overdue"])`.
- **[MED] Waste report tab hardcodes period to "month"** — no period control despite the spec and the Waste module's own selector. File: `app/(app)/reports/page.tsx`. Fix: reuse the period selector so the tab exposes the switch.
- **[MED] findWasteSpikes can inflate the ratio on partial baseline history** — it always divides by 4 weeks even when only 1 week has data, flagging normal weeks as spikes. File: `app/(app)/reports/logic.ts`. Fix: divide by weeks actually populated or require a minimum baseline.
- **[MED] No Playwright/e2e coverage for /reports** — despite the PLAN.md Phase-2 commitment. File: `e2e/specs/`. Fix: add reports.spec.ts covering tiles, locked sections, and CSV export.
- **[MED] Maintenance's promised reports are not implemented anywhere** — no time-to-resolution, spend, or repeat-failure aggregation and no Maintenance tab. File: `app/(app)/reports/page.tsx`. Fix: add a Maintenance tab with the three aggregations over work_orders.
- **[LOW] Reports fetches full history of several tables with no bound** — no date range or limit on tasks/work_orders/equipment/checklist tables. File: `app/(app)/reports/queries.ts`. Fix: window to a rolling range or paginate.
- **[LOW] Live DB has zero seed rows in nearly every source table** — the page cannot be visually verified against real data. File: live DB. Fix: flag for the seed pass (content).
- **[LOW] catering_orders.event_date is fetched but never used** — dead weight per render. File: `app/(app)/reports/queries.ts`. Fix: drop it or display it next to the guest name.
- **[LOW] computeChecklistCompletion's 0-run branch is unreachable dead code** — acknowledged by its own test. File: `app/(app)/reports/logic.ts`. Fix: remove the pointless ternary or the misleading comment.

---

## Auth / PWA / Home

### Intended behavior
Email/password login via Supabase Auth with safe-redirect `next` handling; invite and password-recovery flows routing through /auth/callback into a forced /set-password step; a Home "my day" screen showing today's positions, to-dos, token balance, and feed highlights (tapping a position opens the posted Setup); and a fully installable PWA (manifest, service worker, install prompt, iOS instructions, Web Push).

### FarmingdaleIQ actual
Login, forgot-password, set-password, and the callback route are correct for the happy path, with a well-tested safeRedirect guard. Middleware gates non-public routes correctly. The PWA shell is well built (precache with redirect-poisoning protection, offline fallback, install prompt, iOS instructions, Web Push subscribe). But the Home screen implements only the token-balance third of "my day": positions and to-dos are literal placeholder cards reading "-" and feed highlights are absent, even though the Tasks/Setups/Feed modules they defer to are fully built. Auth pages have zero unit/e2e coverage and the one login spec carries a stale comment.

### Gaps & bugs
- **[HIGH] Home "my day" shows only token balance** — positions-today and to-dos are static "-" placeholders ("Ships with S3/S2") and feed highlights are absent, though the underlying data is already queried elsewhere. File: `app/(app)/page.tsx`. Fix: query setup_assignments and tasks for today plus recent feed_posts, mirroring the existing patterns.
- **[MED] Home-screen wiring has no explicit owner in PLAN.md Phase 2** — the wiring agent's named integration points don't include Home, so the gap may never be picked up. File: `PLAN.md`. Fix: add "wire Home my-day" as an explicit integration point.
- **[MED] No unit/e2e test exercises the real login/invite/recovery/set-password flow** — the callback code-exchange branch is never tested and the login spec's comment is factually wrong. File: `e2e/specs/login.spec.ts`. Fix: add a callback-route unit test and drive a real login/invite round trip.
- **[MED] /auth/callback error param is set but never displayed** — an expired invite/reset link lands on a generic sign-in page with no explanation. File: `app/login/page.tsx`. Fix: read `searchParams.error` and surface a message.
- **[LOW] Home page has no route title; inherits "Create Next App"** — the most-visited screen shows boilerplate in the tab and app switcher. File: `app/layout.tsx`. Fix: set a real default title or add a Home metadata export.
- **[LOW] Live project has zero auth users/profiles** — the module can't be smoke-tested end to end without a manual bootstrap. File: `supabase/migrations`. Fix: execute the deploy-checklist first-admin step or add a bootstrap script.
- **[LOW] Middleware redirect drops the original query string; layout redirect drops `next`** — a deep link with query params loses them after login. File: `lib/supabase/middleware.ts`. Fix: use `pathname + search` when building `next` and forward `next` from the layout redirect.

---

## Prioritized backlog

Sorted by severity (high first), then grouped by the systemic theme where one fix clears several rows. Ready to execute item by item.

| Rank | Severity | Module | Finding | File/area | Fix hint |
|---:|---|---|---|---|---|
| 1 | High | Tokens/Tasks | Task completion never awards tokens (completed_by vs user_id) | `tasks/actions.ts`, `tokens/logic.ts` | Align payload key; add contract test |
| 2 | High | Tokens/Checklists | Checklist completion never awards tokens (completedBy, no token_value) | `checklists/actions.ts`, `tokens/logic.ts` | Emit `user_id`+token_value; fix fixtures |
| 3 | High | Tokens/Tasks | Reward claim never creates fulfillment task (claim_id vs reward_claim_id) | `rewards/actions.ts`, `tasks/system-tasks.ts` | Agree field on canonical side |
| 4 | High | Notifications | Producers emit unrecognized recipient fields (recognition/gift/reward/follow-up) | `lib/notify/recipients.ts` + producers | Widen extractor or fix producers |
| 5 | High | Tasks | Task assignment/overdue notifications never reach anyone | `tasks/actions.ts` | Emit a recognized recipient key |
| 6 | High | Notifications | process-events + discord-outbox only POST; Vercel Cron uses GET | `api/jobs/process-events`, `api/jobs/discord-outbox` | Add GET delegating to POST |
| 7 | High | Notifications | processAppEvents has no cursor; window never advances past 200 | `lib/notify/events.ts` | Add time floor or cursor table |
| 8 | High | Notifications | Per-item notify_discord flag entirely unwired | `lib/notify/events.ts` + producers | Read/forward flag; add UI toggle |
| 9 | High | Checklists | Per-question token_value never reaches completion event | `checklists/actions.ts` | Sum token_value into payload |
| 10 | High | Checklists | Assign-to-team is write-only, no run-side column | `migrations/...checklists.sql` | Add run team column; copy + surface |
| 11 | High | Tasks | Overdue tasks stuck: no Complete/Claim/Delegate | `components/tasks/task-list.tsx` | Render actions for overdue |
| 12 | High | Tasks | Ad hoc task form has no start/due-time fields | `components/tasks/create-task-form.tsx` | Add time inputs; pass through |
| 13 | High | Tasks | Position-assigned one-off/pool tasks never resolve, invisible | `lib/integration/setup-fanout.ts` | Backfill; add position column |
| 14 | High | Accountability | Double-submit guard disabled for issuing roles (RLS) | `accountability/actions.ts` | Duplicate-check via service-role client |
| 15 | High | Setups | positions table holds training stations; templates empty | `setups/templates/actions.ts`; DB | Seed real positions + default template |
| 16 | High | Setups | Self-heal seed button unreachable + no-ops | `components/setups/positions-manager.tsx` | Gate on no setup groups |
| 17 | High | Setups | Break compliance report does not exist | `breaks/page.tsx`, `reports/page.tsx` | Add date-range compliance report |
| 18 | High | Setups | `missed` break status is dead code | `lib/breaks/overdue.ts` | Flag missed at day-part end |
| 19 | High | Training | Passport progress always stamps completed_at | `training/actions.ts` | Set completed_at only on real completion |
| 20 | High | Training | Slider/photo/course item types have no UI | `components/training/passport-card.tsx` | Branch render per item type |
| 21 | High | Training | PIP audit drops trainee from Graduates page | `training/graduates/logic.ts` | Set status `pip` or fix query |
| 22 | High | Maintenance | Requester never notified on status change | `maintenance/actions.ts` | Select submitted_by; add notifiable keys |
| 23 | High | Maintenance | No UI shows request resolution/declined_reason | `maintenance/page.tsx` | Add my-requests/history view |
| 24 | High | Catering | No cancel/delete order path | `catering/actions.ts` | Add cancelled stage + cancelOrder |
| 25 | High | Catering | Order detail shows "Unknown item" for deactivated items | `catering/orders/[id]/page.tsx` | Drop active filter on name lookup |
| 26 | High | People | No bootstrap path for first admin; zero users | `migrations/...core.sql`; `people/actions.ts` | Bootstrap migration/route |
| 27 | High | Auth/Home | Home shows only token balance; positions/to-dos/feed absent | `app/(app)/page.tsx` | Query assignments/tasks/feed |
| 28 | High | Checklists | Checklist completion never auto-earns tokens (key mismatch) | `checklists/actions.ts` | Emit `user_id: completedBy` |
| 29 | High | Setups | (covered) break-compliance gap overlaps report + missed | `breaks/*` | See ranks 17-18 |
| 30 | High | Tasks | (covered) systemic completion/notify wiring | `tasks/*` | See ranks 1,3,5 |
| 31 | Med | Checklists | No manual mid-shift delegation action | `checklists/actions.ts` | Add assignRun action + picker |
| 32 | Med | Checklists | start_time never enforced (early completion allowed) | `checklists/actions.ts` | Reject when now < start_time |
| 33 | Med | Checklists | Follow-ups have no assignee/due/detail | `checklists/actions.ts` | Populate description/assignee/due_at |
| 34 | Med | Checklists | List never shows assignment; no Mine filter | `checklists/page.tsx` | Add assignee column + toggle |
| 35 | Med | Checklists | Per-schedule Discord notify flag unreachable | `api/cron/checklists/route.ts` | Expose fields; forward in emit |
| 36 | Med | Checklists | Zero schedules; 19 empty template drafts (content) | `migrations/seed_checklist_templates.sql` | Author sections/questions/schedules |
| 37 | Med | Tasks | Follow-up tasks lose all context (payload mismatch) | `tasks/system-tasks.ts` | Align payload or look up content |
| 38 | Med | Tasks | Task sync runs once daily, coarse latency | `api/tasks/sync/route.ts` | Split event processing to frequent cron |
| 39 | Med | Tasks | Fixed 200-event lookback, no cursor | `tasks/system-tasks.ts` | Page ascending or track cursor |
| 40 | Med | Tasks | Per-task Notify Discord unreachable | `tasks/validation.ts` | Add toggle; thread through emit |
| 41 | Med | Tasks | Sync cron unauthenticated by default (fails open) | `api/tasks/sync/route.ts` | Fail closed in production |
| 42 | Med | Tasks | Pre-assigned recurring tasks never emit task_assigned | `tasks/materialize.ts` | Emit on inserted assigned rows |
| 43 | Med | Setups | RLS broader than app permission split | `migrations/...app_events_and_rls_backfill.sql` | Restrict insert/delete to setups.manage |
| 44 | Med | Setups | Layout canvas never renders live posted board | `setups/page.tsx` | Render tiles with live assignments |
| 45 | Med | Setups | Needs Break proactive path never fed real data | `components/setups/setup-board.tsx` | Compute + pass real dueAt |
| 46 | Med | Setups | Authorization-to-start lag never surfaced | `components/breaks/break-board.tsx` | Add computed lag column |
| 47 | Med | Setups | dayPartMatches contradicts contract for null day-part | `lib/integration/setup-fanout.ts` | Fix match or update comment |
| 48 | Med | Training | No note UI when recording a PIP audit | `components/training/record-audit-buttons.tsx` | Add notes textarea |
| 49 | Med | Training | Vendor-linked courses/content unreachable | `components/training/create-course-form.tsx` | Add vendor select + content editor |
| 50 | Med | Training | course_attachments/feedback fully unwired | `training/actions.ts` | Add attachment + feedback UI |
| 51 | Med | Training | Org slots not auto-provisioned; 0 slots live | `migrations/training_seed.sql` | Auto-create/seed goal_count slots |
| 52 | Med | Training | Re-rate cron nudges every stale rating | `api/cron/training/route.ts` | Join recent assignments |
| 53 | Med | Waste | Rollups exposed at lower tier via /reports | `waste/page.tsx` | Unify the visibility gate |
| 54 | Med | Waste | Quantity/cost validated only in app layer | `migrations/...waste.sql` | Add CHECK constraints |
| 55 | Med | Waste | unit_cost mutable, not snapshotted per entry | `waste/logic.ts` | Snapshot cost at log time |
| 56 | Med | Accountability | Ladder does not re-fire a re-crossed rung in window | `accountability/logic.ts` | Suppress by unresolved-action, not lookback |
| 57 | Med | Accountability | No server guard against self-issuance | `accountability/actions.ts` | Reject userId === caller |
| 58 | Med | Accountability | No test coverage for actions/queries/cron | `accountability/actions.ts` | Add integration + cron tests |
| 59 | Med | Tokens | createRecognition not double-submit safe | `team/actions.ts` | Wrap credit+post in idempotent RPC |
| 60 | Med | Maintenance | PM checklist procedure is a stub | `api/cron/maintenance/route.ts` | Create + link checklist_run; add picker |
| 61 | Med | Maintenance | Only 2 of 3 named reports exist | `reports/logic.ts` | Add 3 maintenance aggregations |
| 62 | Med | Maintenance | notify_discord columns dead | `maintenance/actions.ts` | Fetch/forward flag; add toggle |
| 63 | Med | Maintenance | WO detail shows controls to every viewer | `components/maintenance/work-order-detail.tsx` | Hide controls unless canWrite |
| 64 | Med | Catering | Delivery orders don't require an address | `catering/validation.ts` | superRefine on fulfillment=delivery |
| 65 | Med | Catering | Discord posts carry no order details | `catering/actions.ts` | Add message field to payloads |
| 66 | Med | Catering | No admin UI for checklist default templates | `catering/actions.ts` | Add defaults CRUD |
| 67 | Med | Catering | Analytics/history count all stages incl. New | `catering/logic.ts` | Filter by stage |
| 68 | Med | Notifications | No bell icon/unread badge in the shell | `components/shell/app-shell.tsx` | Render Bell + count |
| 69 | Med | Notifications | VAPID keys + CRON_SECRET unconfigured | `lib/notify/push.ts`; job routes | Set keys/secret in Vercel |
| 70 | Med | People | Profile page aggregates no personal record | `people/[id]/page.tsx` | Add cross-module summary |
| 71 | Med | People | No role/permission management UI | `people/actions.ts` | Build roles x keys matrix |
| 72 | Med | People | No self-service edit path despite DB allowance | `people/actions.ts` | Add auth.uid()-scoped self edit |
| 73 | Med | Reporting | Tasks status typo makes base fetch unbounded | `reports/queries.ts` | Use `completed` / status IN filter |
| 74 | Med | Reporting | Waste report hardcodes month period | `reports/page.tsx` | Reuse period selector |
| 75 | Med | Reporting | findWasteSpikes inflates on partial baseline | `reports/logic.ts` | Divide by populated weeks |
| 76 | Med | Reporting | No e2e coverage for /reports | `e2e/specs/` | Add reports.spec.ts |
| 77 | Med | Reporting | Maintenance reports not implemented | `reports/page.tsx` | Add Maintenance tab + aggregations |
| 78 | Med | Auth/Home | Home wiring has no owner in PLAN.md P2 | `PLAN.md` | Add explicit integration point |
| 79 | Med | Auth/Home | No test for login/invite/recovery/set-password | `e2e/specs/login.spec.ts` | Add callback + login-flow tests |
| 80 | Med | Auth/Home | Callback error param never displayed | `app/login/page.tsx` | Surface searchParams.error |
| 81 | Low | Checklists | Persistent schedule can set due_time/alert | `checklists/templates/validation.ts` | Block or exclude persistent |
| 82 | Low | Checklists | Template editor full-table-scans questions | `checklists/templates/[templateId]/page.tsx` | Add `.in('section_id', ...)` |
| 83 | Low | Checklists | Stale app_events RLS comment | `checklists/actions.ts` | Update comment |
| 84 | Low | Tasks | Stale RLS-not-added comment | `tasks/actions.ts` | Update comment |
| 85 | Low | Tasks | No edit for recurring templates | `components/tasks/task-templates-table.tsx` | Add edit form/action |
| 86 | Low | Tasks | delegateTask can't return to pool | `tasks/validation.ts` | Allow clearing both fields |
| 87 | Low | Tasks | dueAt has no format validation | `tasks/validation.ts` | Validate ISO datetime |
| 88 | Low | Setups | Break entitlement minutes discarded | `breaks/page.tsx` | Join break_rules; render minutes |
| 89 | Low | Setups | Roster view only full-day, no hourly | `setups/page.tsx` | Add hourly mode or defer note |
| 90 | Low | Setups | Under-qualified warning only after Suggest | `components/setups/setup-board.tsx` | Compute suitability on render |
| 91 | Low | Setups | reorderTemplatePosition non-atomic swap | `setups/templates/actions.ts` | Single RPC/transaction |
| 92 | Low | Setups | CRON_SECRET absent; overdue cron may not run | `api/cron/breaks-overdue/route.ts` | Confirm secret; add 403 signal |
| 93 | Low | Training | Station grid never shows trainer initials | `components/training/station-cell.tsx` | Select+render scored_by |
| 94 | Low | Training | Session tags hardcoded, single-select | `training/schedule/validation.ts` | Editable list + multi-select |
| 95 | Low | Training | Click-to-cycle swallows failures | `components/training/station-cell.tsx` | Surface ActionResult error |
| 96 | Low | Training | Kitchen lifecycle non-functional (0 stations) | `migrations/...app_events_and_rls_backfill.sql` | Seed Kitchen stations (content) |
| 97 | Low | Waste | Recent-entries capped at 25 with only delete there | `waste/page.tsx` | Add pagination/filter/search |
| 98 | Low | Waste | No seed data (content) | `migrations/seed_store_config.sql` | Seed category/item list |
| 99 | Low | Waste | Recent entries doesn't show logged_by | `waste/page.tsx` | Join profiles; add column |
| 100 | Low | Waste | No uniqueness on category/item names | `waste/actions.ts` | Add unique constraint/check |
| 101 | Low | Accountability | disciplinary_actions.status has no CHECK | `migrations/...accountability.sql` | Add status CHECK |
| 102 | Low | Accountability | Delete buttons have no confirmation | `components/accountability/delete-row-button.tsx` | Add confirm dialog |
| 103 | Low | Accountability | Stale app_events RLS comment | `accountability/actions.ts` | Update comment |
| 104 | Low | Tokens | Nothing calls adjust_tokens() | `lib/tokens/ledger.ts` | Add wrapper + admin control |
| 105 | Low | Tokens | Reward fulfillment on daily cron | `vercel.json` | Move to frequent schedule |
| 106 | Low | Maintenance | createWorkOrder action never called from UI | `maintenance/actions.ts` | Add control or remove dead action |
| 107 | Low | Maintenance | Equipment/PM actions untested | `maintenance/equipment/validation.ts` | Add validation tests |
| 108 | Low | Maintenance | Cron route header comment stale | `api/cron/maintenance/route.ts` | Update comment |
| 109 | Low | Maintenance | CRON_SECRET absent; PM gen may not run | `api/cron/maintenance/route.ts` | Confirm secret; log missing vs wrong |
| 110 | Low | Catering | Date boundaries use UTC not store timezone | `catering/page.tsx` | Use stores.timezone |
| 111 | Low | Catering | Menu components/scaling edited as raw JSON | `components/catering/menu-item-form.tsx` | Row-based editors |
| 112 | Low | Catering | Contact dedup: no constraint, no phone normalization | `catering/actions.ts` | Normalize + unique index |
| 113 | Low | Notifications | Discord settings copy claims self-link | `settings/discord/page.tsx` | Add self-link action or fix copy |
| 114 | Low | Notifications | broadcast in NOTIFIABLE but no recipient | `lib/notify/templates.ts` | Fan to all or drop |
| 115 | Low | Notifications | No seed for discord channels/routes (content) | `migrations/...notifications_discord.sql` | Seed starter routes |
| 116 | Low | People | avatar_url has no edit path | `people/validation.ts` | Add field or drop column |
| 117 | Low | People | Zero coverage for actions/gating/guard | `people/validation.test.ts` | Add action + guard tests |
| 118 | Low | People | Seeded role_permissions is placeholder (content) | `migrations/seed_store_config.sql` | Capture real per-role map |
| 119 | Low | Reporting | Full-history unbounded fetches | `reports/queries.ts` | Window or paginate |
| 120 | Low | Reporting | Zero seed rows in source tables (content) | live DB | Seed pass |
| 121 | Low | Reporting | catering event_date fetched, never used | `reports/queries.ts` | Drop or display it |
| 122 | Low | Reporting | computeChecklistCompletion 0-run dead branch | `reports/logic.ts` | Remove ternary/comment |
| 123 | Low | Auth/Home | Home page inherits "Create Next App" title | `app/layout.tsx` | Set real default title |
| 124 | Low | Auth/Home | Zero auth users; needs manual bootstrap | `supabase/migrations` | Execute first-admin step |
| 125 | Low | Auth/Home | Redirects drop query string / next param | `lib/supabase/middleware.ts` | Use pathname+search; forward next |
