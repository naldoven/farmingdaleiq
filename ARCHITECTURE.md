# FarmingdaleIQ — Architecture & Product Plan

A single-store restaurant operations web app for the Farmingdale store, modeled on the
workflows of Ecolab KitchenIQ™ (formerly VSBL). This is an independent implementation:
we replicate the *workflows and features* our team already knows, with our own code,
design, and branding.

## Locked decisions

| Decision | Choice |
|---|---|
| Platform | Web app only (mobile-first, installable as a PWA). No native mobile app. |
| Stack | Next.js (App Router) + Supabase (Postgres, Auth, Realtime, Storage), deployed on Vercel |
| Login | Personal accounts only (email/password via Supabase Auth). No shared-tablet PIN kiosk mode. |
| Hardware | None. No Bluetooth thermometer (never planned), no equipment sensors. Temps are typed in manually. |
| Employee data | Entered manually in-app (no payroll sync). |
| Scope | All modules built in one project: People/Teams, Checklists, Tasks, Setups & Shifts, Waste, Infractions/Accountability, Tokens & Rewards, Team Feed, Training, Vendors, Maintenance, Reporting, Notifications. Chat is explicitly excluded. |
| Vendors module | Directory + contacts only (no ordering/inventory sync). |
| Maintenance | Full module modeled on UpKeep: requests → leader approval → work orders assigned in-house or to a vendor; equipment registry with repair history; time-based preventive maintenance auto-generating work orders; cost + invoice tracking. No parts inventory, no meters/IoT. |
| Notifications | In-app notification center + Web Push (PWA). |
| Tokens | Full economy replica: auto-earn on task/checklist completion, Top Performer awards, Recognitions, peer-to-peer gifting, rewards store with fulfillment tasks. |
| Locations | Single store. A `stores` table exists so multi-location could be added later without a rewrite, but all UI assumes one store. |

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

### Training
- **Courses** (content + attachments/links, optionally tied to a vendor) grouped into
  **Training Plans**.
- Plans are assigned to employees; **trainers and training dates** are scheduled per
  course; completion is signed off; **feedback** can be recorded on courses.
- Leaders view any user's training progress; employees see their own.

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
- `profiles` (id → auth.users, store_id, name, email, phone, avatar_url, role_id, active)
- `roles` (id, name, is_system) / `role_permissions` (role_id, permission_key)
- `teams` (id, name) / `team_members` (team_id, user_id)

Shifts & setups:
- `day_parts` (id, name, start_time, end_time, sort)
- `position_groups` (id, name, sort) / `positions` (id, group_id, name, sort)
- `setup_templates` (id, name, day_part_id) / `setup_template_positions` (template_id, position_id, sort)
- `setups` (id, date, day_part_id, template_id, shift_leader_id, posted_at, posted_by)
- `setup_assignments` (setup_id, position_id, user_id)
- `shift_notes` (setup_id, author_id, body, created_at)
- `breaks` (setup_id, user_id, starts_at, ends_at, status)

Checklists:
- `food_items` (id, name, min_temp_f, max_temp_f)
- `checklist_templates` (id, name, description, active)
- `checklist_sections` (id, template_id, name, sort)
- `checklist_questions` (id, section_id, sort, type: yes_no|number|temperature|text|multi_choice, prompt, allow_na, choices jsonb, food_item_id, corrective_actions text, photo_required, token_value)
- `checklist_schedules` (id, template_id, frequency: daily|weekly, days_of_week int[], day_part_id, start_time, due_time, assign_position_id, assign_team_id)
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

Training:
- `training_courses` (id, name, description, content, vendor_id, sort)
- `course_attachments` (id, course_id, file_url, label)
- `training_plans` (id, name, description) / `training_plan_courses` (plan_id, course_id, sort)
- `training_assignments` (id, plan_id, user_id, assigned_by, assigned_at, due_date, status)
- `course_progress` (id, assignment_id, course_id, trainer_id, scheduled_for, completed_at, signed_off_by, feedback, rating)

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

Notifications:
- `notifications` (id, user_id, kind, title, body, link, read_at, created_at)
- `push_subscriptions` (id, user_id, endpoint, p256dh, auth, created_at)

## Page map

| Route | Purpose |
|---|---|
| `/` | Home: my positions today, my to-dos, token balance, feed highlights |
| `/checklists` | Today's runs to complete; run player UI |
| `/checklists/templates` | Build/edit templates, sections, questions, schedules (permission-gated) |
| `/tasks` | My tasks + shift pool; create ad-hoc tasks |
| `/setups` | Setup board by date/day-part; create/assign/post; breaks; shift notes |
| `/setups/templates` | Manage setup templates, groups, positions |
| `/waste` | Quick waste logging; admin: categories/items |
| `/accountability` | Issue infractions; my record; admin: types, ladder, period settings |
| `/rewards` | Store + claims; admin: manage rewards |
| `/tokens` | Balance, history, send tokens |
| `/team` | Feed (recognitions, top performers, broadcasts), likes/comments |
| `/people` | Roster, profiles, roles & permissions, teams |
| `/training` | My training; admin: courses, plans, assignments, sign-offs |
| `/vendors` | Vendor directory |
| `/maintenance` | Submit requests; triage queue; work order board & detail (comments, photos, cost) |
| `/maintenance/equipment` | Equipment registry, unit pages with history, PM schedules |
| `/reports` | Store dashboard + per-module reports, CSV export |
| `/notifications` | Notification center |
| `/settings` | Day-parts, earning rules, store settings |

## Internal build order (single delivery)

Foundation (auth, profiles, roles/permissions, day-parts, positions, PWA shell,
notifications plumbing) → Checklists + Tasks → Setups & Shifts → Waste →
Accountability → Tokens/Rewards/Feed → Training → Vendors → Maintenance (needs
vendors + checklists) → Reporting dashboard → polish + seed data + RLS audit.

## Open questions (store-specific content needed)

1. **Day-parts**: names + hours (e.g. Breakfast 6:00–11:00, Lunch 11:00–16:00, Dinner 16:00–close?).
2. **Positions**: position groups and the positions in each (FOH/BOH lists as you run them).
3. **Infractions**: your infraction types + point values, the disciplinary ladder
   (names + thresholds), and the accountability period (rolling 60 days?).
4. **Waste**: categories and items you track, and whether each is counted or weighed;
   track cost per item?
5. **Rewards & tokens**: reward list + token prices; tokens per task/checklist;
   Top Performer amount (default 20?).
6. **Training**: the plans/courses you run; do trainers sign off on each course?
7. **Roles**: which roles do you want (e.g. Team Member, Trainer, Team Lead,
   Director, Executive/Admin) and any permission differences from the defaults?
8. **Reports**: which reports you actually pull weekly/monthly.
9. **Branding**: app name ("FarmingdaleIQ"?), colors/logo.
10. **Screenshots**: photos of the screens you use most (home, a checklist in
    progress, setup board, waste sheet, accountability, rewards store) so layouts
    match what the team already knows — redact names.

## Reference sources

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
