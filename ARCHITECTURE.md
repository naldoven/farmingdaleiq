# FarmingdaleIQ — Architecture & Product Plan

A single-store restaurant operations web app for the Farmingdale store, modeled on the
workflows of Ecolab KitchenIQ™ (formerly VSBL). This is an independent implementation:
we replicate the *workflows and features* our team already knows, with our own code,
design, and branding. Two apps already running at the Avondale store, the Talent Hub
and the Catering Hub, contribute two more pieces: the trainee lifecycle folded into
Training, and the Catering module (see Reference sources).

## Locked decisions

| Decision | Choice |
|---|---|
| Platform | Web app only (mobile-first, installable as a PWA). No native mobile app. |
| Stack | Next.js (App Router) + Supabase (Postgres, Auth, Realtime, Storage), deployed on Vercel |
| Login | Personal accounts only (email/password via Supabase Auth). No shared-tablet PIN kiosk mode. |
| Hardware | None. No Bluetooth thermometer (never planned), no equipment sensors. Temps are typed in manually. |
| Employee data | Entered manually in-app (no payroll sync). |
| Scope | All modules built in one project: People/Teams, Checklists, Tasks, Setups & Shifts, Waste, Infractions/Accountability, Tokens & Rewards, Team Feed, Training, Vendors, Maintenance, Catering, Reporting, Notifications. Chat is explicitly excluded. |
| Vendors module | Directory + contacts only (no ordering/inventory sync). |
| Maintenance | Full module modeled on UpKeep: requests → leader approval → work orders assigned in-house or to a vendor; equipment registry with repair history; time-based preventive maintenance auto-generating work orders; cost + invoice tracking. No parts inventory, no meters/IoT. |
| Position ratings | Adopted from OneClick: star ratings per person per position (quick-rate + full rubric), 30-day re-rate prompts, color-coded views, and rating-driven auto-placement suggestions when building setups. |
| Training model | Adopted from OneClick: Development Passports (position passports + leadership passports with leader stamping, 3-star gate) replace the plain courses/plans model. Vendor-linked courses survive as passport items. |
| Breaks | Adopted from OneClick: full compliance engine — rule-based eligibility (hours, minor status, time of day; NY rules preloaded), auto-sequencing by arrival, authorized-vs-actual tracking, overdue alerts, compliance reports. |
| UI touches | Adopted from OneClick: highlight status badges (New/Minor/Trainee/Leader/Birthday/Needs Break), a visual drag-and-drop store layout for the setup board, and monthly + persistent checklist repeat modes with non-completion alerts. |
| Notifications | In-app notification center + Web Push (PWA) + Discord. |
| Discord | Team chat lives in Discord (we build no chat). The app posts to Discord via channel webhooks with per-user @mentions (Discord IDs stored on profiles). Tasks and other items carry a "Notify Discord" flag; overdue/incomplete alerts, maintenance events, wins & announcements, and reward claims auto-post to configurable channels. No bot/DMs in v1; the event routing is designed so a bot can be added later. Personal/sensitive events (infractions, disciplinary actions) never post to Discord except optionally to a private leaders-only channel. |
| Tokens | Full economy replica: auto-earn on task/checklist completion, Top Performer awards, Recognitions, peer-to-peer gifting, rewards store with fulfillment tasks. |
| Locations | Single store. A `stores` table exists so multi-location could be added later without a rewrite, but all UI assumes one store. |
| Catering | Full module modeled on our Avondale Catering Hub: a stage pipeline (New → Confirmation call → FOH Setup → Pickup/Delivery → Follow-up → Closed) with per-stage checklists, order records built from a menu catalog, FOH setup lists that auto-scale from headcount and items, a guest-contacts CRM with follow-up calls, and catering analytics. Catering orders are their own records, separate from the daily-ops Setups module. |
| Talent lifecycle | Adopted from our Avondale Talent Hub and folded INTO the passport model, not built as a second system. The station-scoring grid and trainee weekly schedule are views over passport data; graduation + the 30-day audit (PASS locks, PIP returns to development) are passport lifecycle stages; the Masters and Leadership stage pipelines are leadership passports expressed as stage tracks; the editable org chart reads filled/vacant slots from roles + pipeline promotions. |
| Store config | Seeded from the live Farmingdale KitchenIQ (dayparts, roles, infraction types + points, disciplinary ladder, rewards, break rule, food holding ranges). Real values captured in "Store configuration (Farmingdale)" below; they replace the placeholder examples in the open questions. |
| Not adopted from Avondale | The Talent Hub hiring board (hours forecast, green/yellow/red staffing zones) and the access-code page gate (personal logins already handle auth). |
| Scheduling | KitchenIQ pulls the working roster from an external scheduling provider (mapped to store areas) rather than scheduling in-app. FarmingdaleIQ builds its own Setups but assumes employee availability is entered/managed elsewhere; no scheduling-provider sync in v1. |

## How the reference app works (research summary)

Compiled from the vendor's public support documentation and product pages. Each module
below describes observed behavior we intend to reproduce.

### Identity, roles & permissions
- Every employee has a profile. What a user can see/do is governed by granular
  permissions (e.g. "Manage Checklist Templates", "Manage Shifts", "View Shifts",
  "Checklist Reporting"), grouped into roles.
- An employee's profile aggregates their personal record: assigned to-dos and
  completion history, accountability record (infractions + disciplinary actions),
  training progress, and token balance.

### Home screen
- Shows "my day": any Setup positions the user is assigned to today, their to-dos,
  and their current token balance. Tapping a position opens the posted Setup.

### Checklists
- Built from **templates**: a template contains ordered **sections**, each with ordered
  **questions**.
- Question types include yes/no-style checks, numeric entries, free text, and
  **temperature questions**. A temperature question is attached to a **Food Item**
  which carries its acceptable temperature range. An out-of-range reading forces a
  **corrective action** before the checklist can proceed. Questions can optionally
  allow an **N/A** response.
- Follow-up actions can be raised from problem answers (the vendor is extending this
  to all question types in 2026 — we build it for all types from day one).
- **Scheduling**: checklists recur daily or weekly, can be restricted to specific days
  of the week (e.g. clean lemonade machines Tue/Thu/Sat), and belong to a shift
  (day-part). Due time defaults to end of shift but is customizable; an optional
  start time prevents early completion.
- **Assignment**: a checklist can be linked to a position (auto-assigned when a Setup
  posts), assigned to a team, or left unassigned for manual delegation during a shift.
- Completion feeds reporting (completion rates, flagged answers, temp failures).

### Tasks (To-Dos)
- One-off or recurring tasks, assigned to a person or a position, with start/due
  times inside a shift. Assignment triggers a notification.
- Un-assigned to-dos for a shift sit in a pool visible to the shift leader for manual
  delegation.
- The system itself creates tasks (e.g. a reward claim generates a fulfillment task
  for leaders; a flagged checklist answer generates a follow-up).
- Completion can award tokens.

### Setups & Shifts
- A **shift (day-part)** is a block of the operating day (e.g. breakfast/lunch/dinner)
  owned by a shift leader.
- **Setup templates** define which position **groups** and **positions** are needed
  for a given day-part.
- A leader creates a **Setup** for a date + shift from a template, assigns employees
  to positions, and posts it. Posting puts each person's position on their home
  screen and auto-assigns the checklists/tasks linked to those positions.
- Shift leader tooling: **Lead Duties** checklist for the shift, break management,
  **Shift Notes** to the team, roster view (full-day or hourly), and a prompt at
  shift end to pick a **Top Performer** (who gets tokens + a public feed shoutout).

### Waste
- Admins maintain **waste items** organized into **categories**.
- Anyone can log a waste entry: item + quantity (count or weight). Entries roll up
  into reports by item/category over time so leaders can see where food cost is going.

### Infractions & Accountability
- Admins define **infraction types**, each worth a number of **points**.
- Leaders issue an infraction to an employee; the recipient sees the infraction and
  its points but **not who sent it** (anonymous accountability).
- Points accumulate during an **accountability period**. A **rolling** period (e.g.
  rolling 60 days) means each infraction's points expire N days after it was issued;
  fixed-window periods are the alternative.
- Admins define **disciplinary action types** with point **thresholds** (an
  escalation ladder). When an employee's active points cross a threshold, the
  corresponding disciplinary action is triggered and recorded.
- Employees can always view their own accountability record.

### Tokens & Rewards
- Employees **earn tokens** automatically for completing to-dos/checklists.
- Leaders send **Recognitions**: tokens + a public shoutout in the Team Feed.
- Shift **Top Performer** earns a fixed bonus (default 20 tokens) + a feed shoutout.
- Anyone can **gift** their own tokens to a coworker (capped by their balance).
- A **Rewards store** lists rewards priced in tokens. Claiming a reward debits the
  balance and creates a **fulfillment task** for leaders to deliver it.
- Balance is shown on the home screen; all movements are ledgered.

### Team Feed (no chat)
- A store-wide feed of Recognitions, Top Performer shoutouts, and leader
  **Broadcasts** (announcements: rollouts, events, policy updates).
- Team members can like and comment on posts. Direct/group chat is out of scope.

### Training — Development Passports (adopted from OneClick)
The plain courses/plans model is replaced by OneClick's passport model:

- Every **position** auto-gets a **Position Passport**: the ordered list of skill
  items that prove competence there. Item types: checkmark, slider (0–100 practice
  progress), photo evidence, trainer signature, and linked **course** content
  (which is where vendor-tied training material from the KitchenIQ plan lives).
- Trainees check items off as they learn; trainers countersign signature items.
- When all items are complete, a leader verifies understanding in person and
  **stamps** the passport. Stamping requires the trainee's rating on that position
  to be at least 3 stars (see Ratings below). A stamped passport marks the person
  qualified for the position.
- **Leadership Passports** work the same way but track progression toward a
  leadership role; stamping one can automatically upgrade the person's app role
  (and therefore permissions).
- Passports make the "how do I move up" path visible to everyone: each person sees
  every passport, their progress, and exactly what remains.

### Trainee lifecycle (adopted from the Avondale Talent Hub)
One training system: everything here is a view or stage over passports and ratings,
not a second model.

- Each side of the store (FOH, Kitchen) has an **onboarding roadmap**: an ordered
  list of stations (positions) grouped into phases. Avondale's FOH roadmap runs 21
  stations across Onboarding, Ordering (Register 1/2, iPOS 1/2), Assembly (FC Bag,
  DTD, DT Bag), Staging (Mobile Cash, STAR), and Delivery (Expo, Serving, Dining,
  Mobile Host, FHK); Farmingdale's own list is an open question. A new hire is
  enrolled as a trainee on one roadmap.
- **Station grid**: a roster view, one row per trainee, one column per station
  grouped by phase. Each cell cycles Not started → In training → scored 1 to 5 with
  the trainer's initials recorded. A score writes a quick position rating (the same
  `position_ratings` the Ratings module uses) and updates the passport item progress
  for that station. Per-phase averages, an overall average, and a completed-stations
  count (e.g. 12/21) render per trainee.
- **Trainee schedule**: a week grid (trainee by day). A cell assigns a station, a
  time block, and the master or trainer running the session, plus session tags
  (Learn, Position Overview, Nug Review; the tag list is editable). Weekly hour
  totals show per trainee; the view prints for the wall.
- **Graduation**: finishing all stations on the roadmap marks the trainee a
  graduate. Thirty days later a graduation audit is due: PASS locks graduation in;
  PIP moves the person back into development with a note. The graduates list shows
  side, start and completion dates, duration, average score, and audit status.
- **Masters and leadership pipelines**: progression programs are leadership
  passports whose items are the program's stages (Avondale's Masters run: Apply,
  Orientation, Review, Mock Train, Quiz, Touchpoint, Promote; leads run: Apply,
  Workbook, Field weeks 1 to 3, Mock, Promote). An enrollment carries a track (e.g.
  DT/FC/OT/Both for FOH masters, focus areas for kitchen). Completing the final
  stage stamps the passport, which can auto-upgrade the person's role (see
  Leadership Passports above).
- **Org chart**: departments (FOH, Kitchen, store level) with tiers (e.g. Area
  Leads, Ops Leads, Zone Leads, Masters), each tier carrying a goal count. Slots
  show filled or vacant (dashed) and are editable in place; stamping a pipeline
  passport auto-fills a slot in its mapped tier. Vacancy counts roll up to the
  store dashboard.

### Position Ratings (adopted from OneClick)
- Leaders rate each team member per position. Two modes: **quick rate** (single
  0–5 star score; 3.0+ = qualified) and **full rubric** (4 categories × 5 stars
  with comments) for positions needing granularity. Rubric categories are
  customizable per position.
- Each person gets an **overall average** across their rated positions. Views are
  color-coded (above store average = blue, below = red) so leaders can scan a
  skills matrix of the whole team.
- **Re-rate prompts**: 30 days after a rating on an actively-worked position, the
  system nudges a leader to re-rate, keeping scores honest.
- Ratings power **auto-placement suggestions**: when building a Setup, the app
  proposes the highest-rated available person for each position and warns when a
  slot is filled by someone under 3 stars or with an unstamped passport.

### Breaks — compliance engine (adopted from OneClick)
- **Break rules** are configurable bands: shift length range + age band → entitled
  breaks (paid rest minutes, unpaid meal minutes). New York's rules ship as the
  default preset; minors get stricter bands. Minor status derives from birthdate.
- The engine computes each working person's **entitlement** for the day, proposes a
  **break order** based on arrival times, and tracks each break through
  authorized → started → completed, recording the lag between authorization and
  actually going.
- Overdue/missed breaks alert the shift leader in real time; a compliance report
  shows pending, completed, overdue, and missed breaks over any date range.

### Highlight badges & store layout (adopted from OneClick)
- People render with **status badges** wherever they appear (setup board, rosters,
  profiles): New (recent hire), Minor (under 18), Trainee (passport in progress),
  Leader, Birthday (today/this week), Needs Break (from the break engine). Badges
  are computed, not manually managed.
- A **layout editor** lets us arrange position tiles on a canvas mirroring the
  actual store floor plan (kitchen line, boards, drive-thru, FOH), so the setup
  board reads like the restaurant. List view remains as a fallback.

### Vendors
- Directory: vendor name, category, rep contact info, account number, delivery days,
  notes. Read access for everyone; manage access gated by permission.

### Maintenance (modeled on UpKeep)
Researched separately from KitchenIQ — UpKeep is a CMMS (computerized maintenance
management system). The workflow we reproduce, right-sized for one store:

- **Requests**: any team member submits a maintenance request — title, description,
  priority suggestion, optional equipment tag, area of the store, photos. The
  requester is notified as the request's status changes.
- **Triage**: a leader with the maintenance permission reviews the queue and either
  approves (setting priority, assignee, due date) or declines with a reason that is
  sent back to the requester. Approval converts the request into a work order.
- **Work orders**: statuses open → in progress → on hold → complete (or cancelled).
  Assigned to a team member (in-house fix) **or** a vendor from the Vendors
  directory (with a scheduled visit date). Carry a comment/photo thread
  (before/after shots), and record cost + invoice photo on completion.
- **Equipment registry**: each unit (fryer, ice machine, hood, AC, …) has a page
  with category, store area, model/serial, service vendor, install date, warranty
  expiry, attached manuals, and its full work-order history. Equipment can be
  marked *down* / *operational*; downtime spans are recorded from work orders.
- **Preventive maintenance**: time-based schedules per equipment (e.g. hood cleaning
  every 90 days) auto-generate a work order N days before due, optionally attaching
  one of our checklist templates as the procedure. Meter- and sensor-based triggers
  from UpKeep are intentionally omitted (no hardware).
- **Reporting hooks**: open/overdue work orders and down equipment surface on the
  store dashboard; reports cover time-to-resolution, spend by equipment and by
  month, and repeat-failure equipment.

### Catering (modeled on the Avondale Catering Hub)
Replicates the catering workflow already running at the Avondale store, built as a
module in this app. Farmingdale's KitchenIQ already carries catering checklists
(Catering Follow-Up, Night FOH Catering), so the workflow is proven in-house.

- **Orders**: guest name and contact, event date and time, headcount, dollar
  amount, fulfillment method (pickup, or delivery with address), a paper-goods
  yes/no, notes, and line items picked from a **menu catalog**. Menu items know
  their component breakdown (a packaged meal expands to sandwich, chips, cookie),
  which lets downstream checklists scale quantities.
- **Pipeline**: every open order sits on a kanban board with stages New →
  Confirmation call → FOH Setup → Pickup/Delivery → Follow-up → Closed. Cards move
  by drag or a stage dropdown; a "new order came in" strip highlights today's
  intake; stage changes are timestamped.
- **Stage checklists**: each order materializes editable checklists from per-stage
  default templates: confirmation call (called guest, date and time confirmed,
  headcount confirmed, menu confirmed, payment confirmed), FOH setup (serving
  utensils, sauces, dressings, toppings, chips), kitchen prep (food items, sauces,
  paper goods, drinks, utensils and napkins, special requests), and
  pickup/delivery handoff (tender out, all food packed, cold items from the
  cooler, sauces and condiments included, drinks and ice). FOH setup quantities
  auto-scale from order items and headcount; items can be added or removed per
  order.
- **Views**: a This Week calendar (day-by-day order cards for staffing and prep
  planning) and stage work queues (Confirmation Calls, FOH Setup, Pickup/Delivery)
  that show only orders sitting in that stage.
- **Contacts and follow-up**: every guest becomes a contact carrying order count,
  lifetime spend, and last event date. Closing an order queues a follow-up call to
  re-book; the History page lists follow-ups due and the full order history with
  period filters (month, quarter, year, all time).
- **Analytics**: total orders, total revenue, average order, repeat-guest
  percentage, revenue by week, busiest days, top guests.
- **Discord**: catering events route like every other event (a new order or a
  stage change can post to a catering channel).

### Reporting
- **Store dashboard**: at-a-glance action items and insights (overdue to-dos, flagged
  checklist answers, waste spikes, pending reward claims, employees near disciplinary
  thresholds).
- Per-module reports: checklist completion & failures, waste by item/category/period,
  accountability summaries, token/reward activity, training completion.
- CSV export on report tables.

### Notifications
- Events: to-do assigned, setup posted (you're on a position), infraction received,
  disciplinary action triggered, recognition/shoutout received, reward claim status,
  training assigned, follow-up assigned.
- Delivery: in-app notification center (bell + unread badge) and Web Push via service
  worker (users on iPhone must add the PWA to their home screen; the app will
  prompt with instructions).

### Discord integration
Discord is the store's chat, so the app pushes operational events into it instead
of building messaging:

- **Transport**: Discord **incoming webhooks** — an admin creates a webhook per
  channel in the Discord server settings and pastes each URL into the app's
  Discord settings page. Webhook URLs are secrets (anyone holding one can post);
  they are stored server-side only and never sent to the browser.
- **Mentions**: each profile can store a Discord user ID; messages that concern a
  person embed a real @mention so it pings them in Discord.
- **The flag**: tasks, task templates, checklist schedules, work orders, and PM
  schedules carry a `notify_discord` flag + target channel. When the item is
  created/assigned (and when it goes overdue), the app posts to that channel.
  Leaders toggle it on for the important stuff.
- **Auto-post routes** (each mappable to a channel, all editable):
  - *Overdue & incomplete* → leaders channel: task overdue, scheduled checklist
    missed at due time, break overdue, out-of-range temperature recorded.
  - *Maintenance* → #maintenance: new request submitted, work order status change,
    equipment marked down/up, PM coming due.
  - *Wins & announcements* → #team: recognitions, Top Performer, broadcasts.
  - *Reward claims* → leaders channel: claim posted so delivery happens fast.
- **Privacy rule**: infractions and disciplinary events never auto-post; the only
  allowed routing for them is an explicitly-configured private leaders channel,
  and even then without point details — just "X received an infraction".
- **Reliability**: events write to a `discord_outbox` table and a worker delivers
  with retry/backoff, so a Discord outage never blocks or loses app actions.
- **Upgrade path**: routes are keyed by event type, not by transport, so a Discord
  bot (for private DMs) can replace webhooks later without schema changes.

## Technical architecture

```
Browser (PWA: manifest + service worker + web push)
   │
   ▼
Next.js App Router on Vercel
   ├─ React Server Components for reads
   ├─ Server Actions / route handlers for writes
   └─ Web Push sender (VAPID) in route handlers / cron
   │
   ▼
Supabase
   ├─ Postgres (all app data; RLS on every table)
   ├─ Auth (email/password; JWT carries role)
   ├─ Realtime (feed, tasks, setup posts, notifications)
   ├─ Storage (avatars, checklist answer photos, training/vendor files)
   └─ pg_cron / scheduled functions (daily checklist-run generation,
      rolling point expiry, overdue task flags)
```

- **AuthZ model**: `roles` → `role_permissions` (permission keys). RLS policies check
  permission membership via a `has_permission(key)` SQL helper. UI hides what the
  role can't do; RLS enforces it.
- **Recurring work generation**: a nightly job materializes the day's checklist runs
  and recurring tasks from schedules; posting a Setup materializes position-linked
  assignments immediately.
- **Token integrity**: balances are never stored — always the sum of an append-only
  `token_transactions` ledger; redemptions validate balance in a transaction.
- **Anonymity**: `infractions.issued_by` is stored for audit but excluded from the
  recipient-facing API/RLS view.

## Data model (Postgres)

Core:
- `stores` (id, name, timezone) — single row for now
- `profiles` (id → auth.users, store_id, name, email, phone, avatar_url, role_id, active, birthdate, hired_on) — birthdate drives Minor badge + break rules; hired_on drives New badge
- `roles` (id, name, is_system) / `role_permissions` (role_id, permission_key)
- `teams` (id, name) / `team_members` (team_id, user_id)

Shifts & setups:
- `day_parts` (id, name, start_time, end_time, sort)
- `position_groups` (id, name, sort) / `positions` (id, group_id, name, sort)
- `setup_templates` (id, name, day_part_id) / `setup_template_positions` (template_id, position_id, sort)
- `setups` (id, date, day_part_id, template_id, shift_leader_id, posted_at, posted_by)
- `setup_assignments` (setup_id, position_id, user_id, arrival_time) — arrival_time feeds break sequencing; auto-place suggestions rank candidates by position rating
- `shift_notes` (setup_id, author_id, body, created_at)
- `store_layouts` (id, name, day_part_id, active) / `layout_tiles` (layout_id, position_id, x, y, w, h, area_label) — visual setup board
- `break_rules` (id, min_shift_minutes, max_shift_minutes, age_band: adult|minor, rest_minutes_paid, meal_minutes_unpaid, sort) — NY presets seeded
- `breaks` (id, setup_id, user_id, rule_id, kind: rest|meal, sequence, authorized_at, started_at, ended_at, status: pending|authorized|active|completed|overdue|missed)

Ratings & passports:
- `rating_rubrics` (id, position_id, category_1..4 names) — optional per-position rubric
- `position_ratings` (id, user_id, position_id, stars numeric, category_scores jsonb, comment, rated_by, rated_at, is_current)
- `rerate_prompts` (id, user_id, position_id, due_on, resolved_at) — generated 30 days after a current rating on an active position
- `passports` (id, kind: position|leadership, position_id, target_role_id, name, active) — auto-created per position
- `passport_items` (id, passport_id, sort, type: check|slider|photo|signature|course, label, course_id)
- `passport_enrollments` (id, passport_id, user_id, started_at, stamped_by, stamped_at, track): track holds the pipeline variant (DT/FC/OT/Both, kitchen focus areas)
- `passport_item_progress` (enrollment_id, item_id, value jsonb, photo_url, signed_by, completed_at)

Trainee lifecycle (views and stages over passports):
- `onboarding_roadmaps` (id, side: foh|kitchen, name, active)
- `roadmap_stations` (id, roadmap_id, position_id, phase, sort): phase is the grid column group (Onboarding, Ordering, Assembly, Staging, Delivery)
- `trainee_enrollments` (id, user_id, roadmap_id, started_on, status: active|graduated|pip, graduated_on)
- `station_progress` (enrollment_id, roadmap_station_id, status: not_started|in_training|scored, score, scored_by, scored_at): scoring also writes a `position_ratings` row and passport item progress
- `graduation_audits` (id, enrollment_id, due_on, result: pass|pip, notes, recorded_by, recorded_at): due_on = graduated_on + 30 days
- `training_sessions` (id, enrollment_id, date, position_id, start_time, end_time, trainer_user_id, tags text[], note): the trainee week schedule; tags default to Learn, Position Overview, Nug Review
- `org_tiers` (id, department: foh|kitchen|store, name, goal_count, sort)
- `org_slots` (id, tier_id, user_id, label, sort): vacant when user_id is null; `passports.org_tier_id` maps a pipeline passport to the tier its stamp fills

Checklists:
- `food_items` (id, name, cold_min_f, cold_max_f, hot_min_f, hot_max_f): KitchenIQ holds separate cold-holding and hot-holding compliant ranges per item (e.g. cold 33 to 41°F, hot 140 to 210°F); a temperature question picks which holding mode applies
- `checklist_templates` (id, name, description, active)
- `checklist_sections` (id, template_id, name, sort)
- `checklist_questions` (id, section_id, sort, type: yes_no|number|temperature|text|multi_choice, prompt, allow_na, choices jsonb, food_item_id, corrective_actions text, photo_required, token_value)
- `checklist_schedules` (id, template_id, frequency: daily|weekly|monthly|persistent, days_of_week int[], day_of_month, day_part_id, start_time, due_time, assign_position_id, assign_team_id, alert_on_incomplete bool) — persistent runs are always available; incomplete scheduled runs alert leaders at due time
- `checklist_runs` (id, template_id, schedule_id, run_date, day_part_id, assigned_user_id, assigned_position_id, status, started_at, completed_at, completed_by)
- `checklist_answers` (id, run_id, question_id, value jsonb, is_na, flagged, corrective_action_note, comment, photo_url, answered_by, answered_at)
- `follow_ups` (id, source_answer_id, description, assigned_to, due_at, status, resolved_at, resolved_by)

Tasks:
- `task_templates` (id, title, description, frequency, days_of_week int[], day_part_id, start_time, due_time, assign_position_id, assign_user_id, token_value, active)
- `tasks` (id, template_id?, kind: adhoc|recurring|reward_fulfillment|follow_up|lead_duty, title, description, date, day_part_id, start_time, due_at, assigned_user_id, assigned_position_id, setup_id, status, completed_by, completed_at, token_value, created_by, ref jsonb)

Waste:
- `waste_categories` (id, name, sort)
- `waste_items` (id, category_id, name, unit: each|lb|oz, unit_cost numeric?)
- `waste_entries` (id, item_id, quantity numeric, day_part_id, note, logged_by, logged_at)

Accountability:
- `accountability_settings` (period_kind: rolling|fixed, period_days)
- `infraction_types` (id, name, points, description, active)
- `infractions` (id, user_id, type_id, points, note, issued_by, issued_at, expires_at)
- `disciplinary_action_types` (id, name, threshold_points, description, sort)
- `disciplinary_actions` (id, user_id, type_id, triggered_at, status, note, acknowledged_at)

Tokens & rewards:
- `token_earning_rules` (event_key, amount) — e.g. task_complete, checklist_complete, top_performer
- `token_transactions` (id, user_id, delta, kind: earn|recognition|top_performer|gift_in|gift_out|redeem|adjust, ref jsonb, note, created_by, created_at)
- `rewards` (id, name, description, image_url, token_cost, active, stock)
- `reward_claims` (id, reward_id, user_id, cost, status: pending|delivered|cancelled, fulfillment_task_id, claimed_at, delivered_at, delivered_by)

Feed:
- `feed_posts` (id, kind: recognition|top_performer|broadcast, author_id, subject_user_id, body, tokens_awarded, created_at)
- `feed_likes` (post_id, user_id) / `feed_comments` (id, post_id, author_id, body, created_at)

Courses (referenced by passport items):
- `training_courses` (id, name, description, content, vendor_id, sort)
- `course_attachments` (id, course_id, file_url, label)
- `course_feedback` (id, course_id, user_id, rating, feedback, created_at)

Vendors:
- `vendors` (id, name, category, rep_name, phone, email, account_number, delivery_days, website, notes, active)

Maintenance:
- `equipment` (id, name, category, area, model, serial, service_vendor_id, installed_on, warranty_expires_on, status: operational|down, photo_url, notes)
- `equipment_files` (id, equipment_id, file_url, label) — manuals, warranties
- `maintenance_requests` (id, title, description, equipment_id, area, suggested_priority, photo_urls text[], submitted_by, submitted_at, status: pending|approved|declined, declined_reason, reviewed_by, reviewed_at, work_order_id)
- `work_orders` (id, request_id, pm_schedule_id, title, description, equipment_id, priority: low|medium|high|urgent, status: open|in_progress|on_hold|complete|cancelled, assigned_user_id, vendor_id, scheduled_for, due_at, completed_at, completed_by, cost numeric, invoice_url, checklist_run_id, created_by, created_at)
- `work_order_comments` (id, work_order_id, author_id, body, photo_url, created_at)
- `equipment_downtime` (id, equipment_id, work_order_id, started_at, ended_at)
- `pm_schedules` (id, equipment_id, title, description, interval_days, lead_days, next_due_on, checklist_template_id, assign_user_id, vendor_id, priority, active)

Catering:
- `catering_menu_items` (id, name, category, components jsonb, scaling_rules jsonb, active): components list what a line item expands to; scaling_rules drive utensil/sauce quantities per headcount
- `catering_contacts` (id, name, phone, email, notes, created_at): order count, lifetime spend, and last event are computed from orders
- `catering_orders` (id, contact_id, guest_name, phone, email, event_date, event_time, headcount, amount numeric, stage: new|confirm|setup|out|followup|closed, fulfillment: pickup|delivery, delivery_address, paper_goods bool, source, notes, created_by, created_at, stage_changed_at)
- `catering_order_items` (order_id, menu_item_id, qty)
- `catering_checklist_defaults` (id, stage: confirm|setup|kitchen_prep|out, label, sort, active): per-stage template items
- `catering_checklist_items` (id, order_id, stage, label, done bool, done_by, done_at, sort): materialized per order, add/remove allowed
- `catering_followups` (id, order_id, contact_id, due_on, done_at, outcome, note): queued when an order closes

Notifications:
- `notifications` (id, user_id, kind, title, body, link, read_at, created_at)
- `push_subscriptions` (id, user_id, endpoint, p256dh, auth, created_at)

Discord:
- `profiles.discord_user_id` (added to profiles) — for @mentions
- `discord_channels` (id, name, webhook_url, purpose, active) — webhook_url server-side only, never exposed via RLS
- `discord_event_routes` (event_key, channel_id, enabled) — e.g. task_overdue, checklist_missed, break_overdue, temp_failed, maint_request, work_order_status, equipment_down, pm_due, recognition, top_performer, broadcast, reward_claim, catering_order_new, catering_stage_change
- `notify_discord` + `discord_channel_id` columns on: `tasks`, `task_templates`, `checklist_schedules`, `work_orders`, `pm_schedules`
- `discord_outbox` (id, channel_id, payload jsonb, status: pending|sent|failed, attempts, next_retry_at, created_at, sent_at)

## Page map

| Route | Purpose |
|---|---|
| `/` | Home: my positions today, my to-dos, token balance, feed highlights |
| `/checklists` | Today's runs to complete; run player UI |
| `/checklists/templates` | Build/edit templates, sections, questions, schedules (permission-gated) |
| `/tasks` | My tasks + shift pool; create ad-hoc tasks |
| `/setups` | Setup board (visual layout or list) by date/day-part; auto-place suggestions; create/assign/post; shift notes |
| `/setups/templates` | Manage setup templates, groups, positions, and the store layout editor |
| `/breaks` | Break manager: today's entitlements, sequence, authorize/start/complete, overdue alerts |
| `/ratings` | Skills matrix (people × positions, color-coded), rate/re-rate flows, re-rate queue |
| `/waste` | Quick waste logging; admin: categories/items |
| `/accountability` | Issue infractions; my record; admin: types, ladder, period settings |
| `/rewards` | Store + claims; admin: manage rewards |
| `/tokens` | Balance, history, send tokens |
| `/team` | Feed (recognitions, top performers, broadcasts), likes/comments |
| `/people` | Roster, profiles, roles & permissions, teams |
| `/training` | Passports: my progress, all passports, trainer sign-offs, leader stamping; admin: passport items, courses |
| `/training/grid` | Station grid: trainees by stations, click-to-cycle and score, phase averages |
| `/training/schedule` | Trainee week schedule: station + time + trainer per day, session tags, print view |
| `/training/graduates` | Graduates list and 30-day audits (PASS / PIP) |
| `/training/pipelines` | Masters and leadership stage pipelines with per-person progress |
| `/people/org-chart` | Editable org chart: tiers, goal counts, filled and vacant slots |
| `/vendors` | Vendor directory |
| `/maintenance` | Submit requests; triage queue; work order board & detail (comments, photos, cost) |
| `/maintenance/equipment` | Equipment registry, unit pages with history, PM schedules |
| `/catering` | Order pipeline board: stage columns, drag/dropdown moves, new-order intake |
| `/catering/week` | This Week calendar of upcoming orders |
| `/catering/confirm` | Confirmation-call queue with per-order call checklist |
| `/catering/setup` | FOH setup queue: auto-scaled setup checklists per order |
| `/catering/dispatch` | Pickup/delivery queue with handoff checklist |
| `/catering/orders/[id]` | Order detail: items, stage, all checklists, notes, guest history |
| `/catering/history` | Contacts, follow-ups due, order history with period filters |
| `/catering/analytics` | Catering volume, revenue, busiest days, top guests |
| `/catering/menu` | Menu item catalog admin (components, scaling rules) |
| `/reports` | Store dashboard + per-module reports, CSV export |
| `/notifications` | Notification center |
| `/settings` | Day-parts, earning rules, store settings |
| `/settings/discord` | Register channel webhooks, map event routes, link members' Discord IDs |

## Internal build order (single delivery)

Foundation (auth, profiles, roles/permissions, day-parts, positions, PWA shell,
notifications plumbing) → Checklists + Tasks → Setups & Shifts (incl. layout
editor, badges, break engine) → Ratings → Passports + trainee lifecycle (station
grid, trainee schedule, graduates/audits, pipelines, org chart; needs ratings +
courses) → Waste → Accountability → Tokens/Rewards/Feed → Vendors → Maintenance
(needs vendors + checklists) → Catering (needs foundation only; can run in
parallel with any post-checklist phase) → Reporting dashboard → polish + seed
data + RLS audit.

## Store configuration (Farmingdale, captured from live KitchenIQ)

Captured 2026-07-06 from the store's KitchenIQ admin portal. These are the real
values the app ships seeded with.

- **Store**: Farmingdale, 1991 Broadhollow Road, Farmingdale NY 11735 (EBS 2585040).
- **Dayparts (6)**: Morning 6:00-11:00 AM, Lunch 11:00 AM-3:00 PM, Mid 3:00-5:00 PM,
  Dinner 5:00-7:00 PM, Night 7:00-11:00 PM, Closing 11:00-11:45 PM.
- **Roles (ranked 1-10)**: Location Manager, Director, Assistant Director,
  Operations Lead, Shift Supervisor, Team Leader, FOH Trainer, BOH Trainer,
  FOH Brand Ambassadors, Team Member. Per-role permissions still to map.
- **Accountability period**: rolling 60 days.
- **Infraction types (points)**: Call Out (P3&4) 10, No Call No Show (P3&4) 30,
  Late to Shift 5-30 mins (P3&4) 4, Excused Call Out 0, Coaching 0, Time Theft
  (P4) 4, Violation of Standard Procedures (P5&6) 10. (List continues in
  KitchenIQ; capture the tail when seeding.)
- **Disciplinary ladder (threshold points)**: Coaching 10, Verbal Warning 15,
  Written Warning 20, 1 Week Suspension 30, Employment Review 50.
- **Rewards (token cost)**: Cookie/Brownie (TM) 25, Drink Cup (TM) 25, LTO/Iced
  Coffee (TM) 40, Treasure Box (TM) 50, Drink Cup (L) 50, Medium Side (TM) 50,
  Cookie/Brownie (L) 50. (List continues; capture the tail when seeding.)
- **Break rule (current store policy)**: one rule, scheduled 6 hours → one
  30-minute break. Far simpler than the OneClick-style engine we planned; the
  engine stays (NY-law and minor bands still preload) but this is the only rule
  active on day one.
- **Food items**: KitchenIQ tracks holding compliance as separate ranges: Cold
  Foods cold-holding 33 to 41°F, Hot Foods hot-holding 140 to 210°F. Only these
  two generic items exist today; per-item entries can come later.
- **Checklists**: 67 active templates today, sectioned with numbered questions
  (yes/no and temperature types observed). Real names include Safe Count,
  Breakfast Checklist, Suggestive Selling and Upselling, Pickles Check-in (Smart
  Shop), FOH - Closing Shift Leader, QIV - Nuggets & Strips, BOH Dishes/Dish Put
  Back/Boards/Breading/Machines Closing Checklists, Bi-Weekly Clean Prep, Prep
  Closing, Brand Ambassador WHED/Systems/Outlook Audits, and two catering ones
  (Catering Follow-Up, Night FOH Catering). Migrate these as templates.
- **Training courses**: 52 active, named by position and shift (Desserts [Shift
  1/2], Drinks [Shift 1/2], Serving [Hospitality], M-Serving, FC Serving, ...).
  These become passport-linked course items.
- **Scheduling**: KitchenIQ maps "Areas" to schedule types from an external
  scheduling provider and pulls the roster from it when leaders build setups.
  FarmingdaleIQ keeps setups internal in v1 and does not sync a provider.

## Open questions (store-specific content needed)

Answered by the KitchenIQ capture above: day-parts, infractions + ladder + period,
break rule, role list, reward names + prices, food holding ranges, checklist
inventory, course inventory. Still open:

1. **Positions**: position groups and the positions in each (FOH/BOH lists as you
   run them). The Avondale FOH station list is a starting point; confirm
   Farmingdale's stations and phase grouping for the onboarding roadmaps.
2. **Waste**: categories and items you track, and whether each is counted or
   weighed; track cost per item? (No waste config found in the KitchenIQ portal.)
3. **Tokens**: tokens per task/checklist completion and the Top Performer amount
   (default 20?). Reward prices are captured; the tails of the reward and
   infraction lists still need a full export when seeding.
4. **Training**: passport content per position (skill items, which of the 52
   courses attach where); which leadership roles get Leadership Passports; stage
   lists and tracks for Farmingdale's Masters and lead pipelines if they differ
   from Avondale's.
5. **Ratings**: which positions need the full 4-category rubric (and the category
   names) vs. quick-rate only?
6. **Org chart**: Farmingdale's tiers and goal counts per department.
7. **Store layout**: a photo/sketch of your setup whiteboard or floor plan so the
   layout editor's default arrangement matches your store.
8. **Permissions**: per-role permission differences from the defaults (role list
   itself is captured).
9. **Reports**: which reports you actually pull weekly/monthly.
10. **Branding**: app name ("FarmingdaleIQ"?), colors/logo.
11. **Screenshots**: photos of the screens the team uses most (home, a checklist
    in progress, setup board, accountability, rewards store) so layouts match
    what the team already knows; redact names.
12. **Equipment list**: your equipment (or photos of data plates) and existing
    service schedules (hood cleaning, filter changes) to seed the maintenance
    module.
13. **Discord**: your server's channel plan (which channels for tasks,
    maintenance, leaders-only alerts, team wins, catering), webhook URLs once
    created, and each member's Discord user ID (or usernames; we can help
    collect these at first login).
14. **Catering menu**: Farmingdale's catering menu items with component
    breakdowns and utensil/sauce scaling rules; where orders arrive from (phone,
    EZCater, CFA catering site) and the default checklist items per stage if they
    differ from Avondale's.
15. **Catering contacts**: export existing guest contacts and order history (from
    Avondale-style records or receipts) to seed the CRM, if wanted.

## Reference sources

Avondale reference apps (ours, live):
- [Avondale Talent Hub](https://avondale-talenthub.vercel.app/): trainee station grid, trainee schedule, graduates + 30-day audit, masters and leadership pipelines, org chart, hiring board (hiring board not adopted)
- [Avondale Catering Hub](https://avondalecatering.vercel.app/): order pipeline, stage checklists, contacts + follow-up, catering analytics

Live store data:
- Farmingdale KitchenIQ admin portal (portal.kitcheniq.ecolab.com, login required): source of the captured store configuration above

- [KitchenIQ in 2026 (support)](https://support.vsblapp.com/hc/en-us/articles/45010922078356-KitchenIQ-in-2026)
- [Intro for Leaders (support)](https://support.vsblapp.com/hc/en-us/articles/22348470922644-Intro-to-Ecolab-KitchenIQ-for-Leaders)
- [Intro for Team Members (support)](https://support.vsblapp.com/hc/en-us/articles/21769958558996-Intro-to-Ecolab-KitchenIQ-for-Team-Members)
- [Getting Started Guide (support)](https://support.vsblapp.com/hc/en-us/articles/22349992953364-Getting-Started-Guide)
- [Create a Checklist (Mobile)](https://support.vsblapp.com/hc/en-us/articles/34731496241300-Create-a-Checklist-Mobile)
- [Shift To-Dos (Checklists & Tasks)](https://support.vsblapp.com/hc/en-us/articles/22342235741844-Shift-To-Dos-Checklists-Tasks)
- [Edit Setup Template](https://support.vsblapp.com/hc/en-us/articles/22346288753044-Edit-Setup-Template) / [Create Setup (Tablet)](https://support.vsblapp.com/hc/en-us/articles/21688944973716-Create-Setup-Tablet)
- [Accountability: Disciplinary Action Types](https://support.vsblapp.com/hc/en-us/articles/21675237864852-Accountability-Settings-Add-Edit-Disciplinary-Action-Types) / [Accountability Periods](https://support.vsblapp.com/hc/en-us/articles/21771616500500-Types-of-Accountability-Periods)
- [How to Earn Tokens](https://support.vsblapp.com/hc/en-us/articles/21776805344788-How-to-Earn-Tokens) / [Redeem Tokens for Rewards](https://support.vsblapp.com/hc/en-us/articles/21775368001044-Redeem-Tokens-for-Rewards) / [Select a Top Performer](https://support.vsblapp.com/hc/en-us/articles/21687846526612-Select-a-Top-Performer)
- [Create & Edit Training Plans](https://support.vsblapp.com/hc/en-us/articles/28276269561236-Create-Edit-Training-Plans)
- [Contact a Vendor](https://support.vsblapp.com/hc/en-us/articles/21775147144212-Contact-a-Vendor) / [Vendor Bridge](https://support.vsblapp.com/hc/en-us/articles/21675666353300-How-to-Connect-Vendor-Bridge-if-enabled-for-your-organization)
- [Ecolab KitchenIQ product page](https://www.ecolab.com/offerings/fss/kitcheniq) / [App Store listing](https://apps.apple.com/us/app/ecolab-kitcheniq/id1600735829) / [Google Play listing](https://play.google.com/store/apps/details?id=com.vsblapp.vsbl&hl=en_US)

Maintenance module (UpKeep):
- [UpKeep CMMS](https://upkeep.com/) / [Work order software](https://upkeep.com/product/work-order-software/) / [Preventive maintenance](https://upkeep.com/product/preventive-maintenance/)
- [Create and manage work requests](https://help.onupkeep.com/en/articles/4730330-how-to-create-and-manage-work-requests) / [Public request portal](https://help.onupkeep.com/en/articles/4730258-how-to-utilize-your-company-request-portal) / [PM section overview](https://help.onupkeep.com/en/articles/9621157-preventive-maintenance-section-overview)

Ratings, passports, breaks, layout (OneClick):
- [OneClick site](https://www.oneclickapp.com/) / [Solutions](https://www.oneclickapp.com/solutions) / [Pricing](https://www.oneclickapp.com/pricing)
- [Training Ratings (KB)](https://kb.oneclickapp.com/training-ratings) / [Rating rubrics (KB)](https://kb.oneclickapp.com/customize-oneclickapp-training-positions-and-rating-rubrics) / [Speed Rating](http://www.oneclickapp.com/news/speed-rating-explained)
- [Development Passports (KB)](https://kb.oneclickapp.com/manage-development-passports) / [Passports for positions/leadership (KB)](https://kb.oneclickapp.com/passport-for-positions)
- [Break scheduling (KB)](https://kb.oneclickapp.com/break-scheduling) / [Break tracking](https://www.oneclickapp.com/break-tracking) / [Advanced break management](https://www.oneclickapp.com/blog/post/new-advanced-break-management-capabilities-ensure-labor-law-compliance-and-reduce-break-policy-abuse)
- [Assigning checklists (KB)](https://kb.oneclickapp.com/assigning-checklists) / [Layout editor release](https://www.oneclickapp.com/blog/major-release-create-schedules-with-a-single-click-layout-editor-checklists-more) / [Default layout times (KB)](https://kb.oneclickapp.com/default-layout-time-strategy)
- [Moola (KB)](https://kb.oneclickapp.com/moola) / [Infractions (KB)](https://kb.oneclickapp.com/infractions)
