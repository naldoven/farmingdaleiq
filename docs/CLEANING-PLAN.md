# Cleaning module plan (draft for approval)

Status: approved 2026-10-25. Phase W (walkthrough) shipped in PR #88; the Phase 1 core
(board, today list, photo completion, carry-over, print, settings) is in the PR after
it. Source: Naldo's store recordings with Mariana and the BOH leaders, the current
paper "Weekly Cleaning Schedule" PDF, the 2026 cleaning-zones message, and nine rounds
of Q&A with Naldo.

## The problem

The store cleans every day, but always the same things. Nothing records when an item
was last cleaned, so things nobody looks at (the vent above boards) never get done,
leaders can't tell at a glance whether cleaning happened, and audit week turns into a
scramble. The paper sheet covers the fixed weekly cleans only and leaves no record.

## What we are building

One master list of everything in the building that needs cleaning, each item tagged
with its zone and how often it gets cleaned. The app builds each week's plan,
Mariana adjusts it on her phone, the shift leader marks each clean done with a photo,
and anything not done is carried forward and counted. Every item shows when it was
last cleaned. A print button produces the same weekly sheet the team already knows.

BOH goes first. FOH areas are on the board too since 2026-10-26 (Naldo); they get
cleans as FOH items from the walkthrough are approved.

## Decisions (locked in Q&A)

| Topic | Decision |
|---|---|
| Scope | One master list for all deep cleans, constants and variables. Daily closing checklists stay in Checklists, untouched. |
| Constants | Same clean, same weekday(s), every week, AM or PM. Seeded from the paper PDF. |
| Variables | Repeat every 1, 2, 3, 4, 6, 8 or 13 weeks. Each item says AM, PM or Either. Each section (rack, shelf) is its own item. |
| Zones | One zone per area, named the way the store talks (changed 2026-10-26 after the first phone walkthrough; colors were the first draft). BOH: Boards, Prep (Green), Breading, Machines (Yellow), Dish to door, Dumpster (Blue). FOH: Front counter, Vestibule (Red), DT cockpit (Purple), Dining room, Patio, Restrooms, Playground (Orange). The color stays on each area as a tag for the print sheet. No cleaning teams. |
| Weekly plan | App auto-places next week Thursday night. Mariana moves, skips, or pulls extra items in through Saturday. The week goes live Monday automatically, edited or not. |
| Load cap | Max variable cleans per half-day, set per day (Mon AM through Sat PM). Default 2. A slot can be 0. |
| Skip | Planner-only deferral before the day, reason required. Not a miss, tracked as "skipped". The item stays overdue so it is placed first next week. |
| Who does it | The shift leader. AM cleans belong to the leader on that day's Morning Setup, PM cleans to the Closing Setup leader. For v1 the leader cleans and marks done personally. Any leader (Team Leader and up, plus FOH and BOH Trainers) can complete a clean. |
| Who plans | The cleaning coordinator(s), named by a tag in Cleaning settings. The tag adds planning rights on top of the person's normal role, so Mariana keeps her leader role. Location Manager and Director can also plan as backup. |
| Proof | One after-photo per clean, with automatic time and name. Items flagged "if needed" can be marked "checked, not needed", also with a photo. |
| Checking | The photo is the proof. A leader with plan rights can reject it with a note; the clean reopens on the next shift's list tagged "redo" and the first completion does not count as on time. |
| Missed | Not done by end of day: moves to the next open day, same half, tagged "carried over from Wed". Counts as a miss against that day's owner. Saturday carries to Monday. |
| Item details | Name, zone, reference photo (what clean looks like), "if needed" flag. No how-to text or time estimates in v1. |
| Adding items | In-app capture: a leader snaps a photo, picks zone and cadence, and it lands as a draft until a planner approves it. |
| Print | One tap prints the week in the current paper layout: Mon to Sat columns, AM and PM halves, item text in zone colors, checkbox and initials line. Variables listed after the constants in each half. BOH and FOH print separately. |
| ATD log | "Found and fixed" posts: photo, zone, one-line note. Leaders only in v1. A planner can turn a find into a master-list item. |
| Metrics | Leaders only (Team Leader and up, plus trainers): shift-leader on-time %, misses and carry-overs by month; zone completion % and most overdue items; store weekly trend. Team members see only the store trend on Home. No competition or tokens in v1. |
| Alerts | In the app: end-of-day misses summary to coordinators, Saturday "plan next week" reminder. No shift-start alert. |
| Discord | A new #cleaning channel gets: the daily done / missed / carried-over counts, the list of missed items, each ATD find with its photo, and a Monday "week published" post with the week's variable cleans. Item names only, never people's names, since the leaderboard is leaders-only. |
| Beta start | If the walkthrough's variables aren't loaded by the first Thursday build, the beta starts with the 36 BOH constants and variables join the next week's build as they arrive. |
| Success | After 2 BOH weeks: paper sheet retired, at least 90% of planned cleans done on their day, nothing overdue on the master list, Mariana plans the week in under 10 minutes. |
| Permissions | New permission keys plus the coordinator tag (below). |
| Device | Phone first, including planning. A desktop board comes later only if it helps. |

## How a week runs

1. **Thursday night** the job builds next week. Constants land on their days. Variables
   due by the end of next week are sorted most overdue first and placed into open
   slots that match their AM/PM setting, up to each slot's cap. Anything that does not
   fit sits in a "due, not placed" tray and goes first the following week.
2. **Thursday to Saturday** Mariana opens the week on her phone: one day at a time,
   AM and PM sections, constants on top, variables below. Tapping a card lets her move
   it to another day or half, skip it with a reason, or remove a pulled-in extra. A
   "pull from master list" button adds any item early. Saturday she gets a reminder.
3. **Monday** the week is live. The Morning Setup's leader sees the AM list, the
   Closing Setup's leader sees the PM list, on the Cleaning screen and on Home.
4. **During the shift** the leader taps a clean, takes the photo, done. Doing a clean
   earlier in the week than planned is allowed and counts as on time.
5. **After close** the job marks unfinished cleans missed, records who owned them,
   creates the carry-over for the next open day, sends planners the misses summary,
   and posts the day's counts to Discord.
6. **Any time** the master list shows every item with a green, yellow or red dot
   (not due, due this week, overdue), its last-cleaned date and its next due date.
   That list is the audit-readiness view.

Next due for a variable = last completion + its interval. Never-cleaned items use
their start date. Skips never reset it. Last-cleaned dates are always worked out from
the completion records, never typed in, so they can't drift.

## Data model (new tables, one migration plus a seed)

- `cleaning_zones` (id, name, color, side foh|boh, sort, active). FOH zones seeded
  inactive; flipping `active` is the FOH launch.
- `cleaning_items` (id, zone_id, name, kind constant|variable, days_of_week int[],
  half am|pm|either, interval_weeks, start_on, if_needed bool, reference_photo_path,
  status draft|active|retired, created_by, approved_by, sort). Constants use
  `days_of_week` with half am|pm; variables use `interval_weeks` in (1,2,3,4,6,8,13).
- `cleaning_slot_caps` (weekday 1-6, half am|pm, max_variables, default 2).
- `cleaning_weeks` (id, week_start unique, built_at, published_at).
- `cleaning_assignments` (id, week_id, item_id, date, half, origin
  constant|auto|manual|carry_over|redo, carried_from_id, status
  planned|done|not_needed|skipped|missed, skip_reason, owner_user_id,
  completed_by, completed_at, photo_path, rejected_by, rejected_at, reject_note).
  Unique on (item_id, date, half) so a rerun of the build or the day-end job can never
  double-create.
- `cleaning_atd_finds` (id, zone_id, note, photo_path, posted_by, posted_at,
  converted_item_id).
- `cleaning_coordinators` (user_id, added_by, added_at): the coordinator tag. A SQL
  helper `can_plan_cleaning()` returns true for `has_permission('cleaning.plan')` or a
  row here, and both RLS and `requirePermission`-style checks use it.
- Storage: private `cleaning-photos` bucket, signed URLs, same pattern as work-order
  photos.

Permission keys: `cleaning.plan` (board, master list, approve drafts, caps, reject;
granted to Location Manager and Director, everyone else gets it through the
coordinator tag), `cleaning.complete` (mark done, capture drafts, ATD log) and
`cleaning.view_reports` (metrics), both granted to Team Leader and up plus FOH and BOH
Trainer. RLS enforces the same rules; owner attribution reads
`setups.shift_leader_id` for the Morning and Closing day-parts. If no Setup was posted,
the miss is recorded as "no owner" and called out in the summary.

## Screens (new "Cleaning" nav group in `lib/nav/page-map.ts`)

| Route | Who | What |
|---|---|---|
| `/cleaning` | leaders | Today: AM and PM lists, carry-over and redo tags, tap to photo-complete |
| `/cleaning/week` | planners | Week board, day chips Mon to Sat, move / skip / pull in, print button |
| `/cleaning/items` | leaders (edit: planners) | Master list by zone, overdue dots, drafts to approve, capture button |
| `/cleaning/finds` | leaders | ATD found-and-fixed log |
| `/cleaning/stats` | leaders | Shift leaders, zones, store trend |
| `/cleaning/settings` | planners | Slot-cap grid, FOH on/off, coordinator tags |

Discord: three new event keys (`cleaning_daily_summary`, `cleaning_week_published`,
`cleaning_atd_find`) routed through the existing `discord_event_routes` table. Naldo
creates the #cleaning channel and webhook, then points the three keys at it in
`/settings/discord`. No code holds the webhook URL.

Print is a print-styled view of `/cleaning/week`, using the `print:` approach already
in `app/(app)/training/schedule/page.tsx`.

## Phase W: walkthrough capture (live for the Monday Oct 26 evening walk)

Added 2026-10-25 at Naldo's request so the walkthrough builds the master list in the
app instead of on paper. It is the first slice of Phase 1, built in the final shape so
nothing is redone later.

- **Camera:** `/cleaning/walkthrough` opens a full-screen live camera (rear lens),
  modeled on the Quote Tool's crew camera. Live capture means no picking old pictures
  from the camera roll. The zone picker sits in the top bar like the Quote Tool's
  campaign picker and stays set between shots. The shutter can be tapped again and
  again.
- **Per photo, on the spot:** draw on the photo (circle or arrow the exact spot, undo,
  clear), name it (or tap an existing item in that zone to attach the photo to it),
  constant or variable, weekday(s) or every N weeks, AM / PM / Either, "if needed",
  optional note. All required except the note and the drawing.
- **Never re-shoot:** shots wait in a queue sheet over the camera and upload in the
  background. A failed upload stays queued and retries; the queue survives a refresh
  or a closed tab (stored on the phone until it lands).
- **Proof:** the server stamps the save time; the phone's capture time is stored too.
  No GPS: the whole store is one location.
- **Photos:** shrunk to a JPEG on the phone before upload (the Quote Tool's
  `clientImage` helper), so a 12 MP shot uploads fast on store wifi and iPhone HEIC
  never reaches the server. Drawings are saved as shapes on top of the original, not
  burned in, so they can be edited later.
- **Where it lands:** every save is a draft item. `/cleaning/items` lists drafts by
  zone with their photos and drawings; Naldo or a planner edits, approves, or deletes.
- **Seeded first:** the 6 zones (split into 13 areas on 2026-10-26) and the 36 BOH constants from the paper sheet, so the
  walk can attach reference photos to them. FOH constants come later; FOH items
  photographed on the walk land as drafts.
- **Order:** Naldo paste-runs the migration in the Supabase SQL editor, then the PR
  merges and deploys. Naldo invites Mariana, Eric and Nathan as leaders before the walk.

## Phase 1 core (built 2026-10-25, live from Monday Oct 26)

Built ahead of the Thursday target so the 36 BOH constants run in the app from the
walkthrough day on; variables join as drafts are approved.

- **Migration** `20261026030000_cleaning_board.sql`: slot caps, weeks, assignments,
  and three database functions for the steps that must land together (complete with a
  stored photo, reject into a redo, close past days with miss, owner and carry-over).
- **Hourly job** `/api/cron/cleaning`: from 3am closes past days (so the closing shift
  can finish last night's list after midnight; Today shows it as "Still open from last
  night"), builds the current week if it was never built (nothing lands before today,
  or in today's AM after 2pm), builds next week from Thursday 8pm, stamps the week
  published on Monday. A miss carries over exactly once; a variable dropped after a
  second miss stays overdue and is placed first next week.
- **Screens**: `/cleaning` (today), `/cleaning/week` (board and print),
  `/cleaning/settings` (caps, zones, coordinator tags), due dots on `/cleaning/items`.
- **Owner attribution** reads the Morning and Closing Setup leaders as planned. Setups
  is switched on (`lib/features.ts`), so a miss is owned by that day's posted Morning
  (AM) or Closing (PM) Setup leader, and records "no owner" when none was posted.
  Completions always record who did them.
- **Planner limits**: planners plan (add from today on; move, skip or remove only before
  the day); only the database functions complete, reject, mark misses or set owners, so a
  coordinator cannot rewrite her own record. The database enforces the same date rules
  as the screens, so a direct API call cannot skip or remove a clean on a day that has
  started. Retiring an item or hiding a zone takes its open cleans off the board from
  tomorrow on; today's stay owed.
- **Alerts (built 2026-10-26)**: the hourly job queues, at most once a day each,
  `cleaning_daily_summary` (#cleaning, from 6am, yesterday's counts and missed items,
  plus how many misses had no posted Setup leader), `cleaning_misses` (in-app to the
  coordinators, only when something was missed) and `cleaning_plan_reminder` (in-app to
  the coordinators, Saturday from 10am), plus `cleaning_week_published` (#cleaning,
  Monday from 6am). 6am rather than right after the 3am close so the coordinator's
  notice does not buzz her phone in the night. Each step runs on its own, so a stuck
  build never blocks an alert. The Discord and
  in-app events are separate keys because the Discord sender @mentions an event's
  recipient. With nobody tagged as coordinator, Location Manager and Director get the
  notices. Home shows leaders today's AM and PM progress.
- **To turn on the Discord posts**: create the #cleaning channel and its webhook, add it
  in `/settings/discord`, and point "Cleaning: yesterday's done and missed (6 AM)" and
  "Cleaning: week is live (Monday 6 AM)" at it. Until then the in-app notices work and the posts are
  skipped.
- **Not in this slice**: ATD log (and its `cleaning_atd_find` post), metrics. Both are
  Phase 2, below.

## Phase 2 (built 2026-10-26)

- **Migration** `20261026070000_cleaning_finds_and_trend.sql`: `cleaning_atd_finds`
  (the phone's photo id is the row id; the photo must be the poster's own upload; a
  planner can only link a find to an item or delete it, never rewrite it) and
  `cleaning_store_trend`, counts only, for Home.
- **Found and fixed** (`/cleaning/finds`): photo, area, one-line note. Each new find
  queues `cleaning_atd_find` for #cleaning with the photo (a signed link valid a year,
  since Discord shows the photo from it). A planner's "Add to master list" creates an
  active item with the find's photo as its reference photo.
- **Metrics** (`/cleaning/stats`): one counting rule with the Today screen and the
  morning summary (skipped and sent-back cleans are not owed; on time is done on or
  before its day, store-local; an open clean is not scored yet). Shift leaders come
  from posted Setups; a miss keeps the owner the close stamped on it. Leaders are listed
  by name, not ranked. Home shows every team member the store's on-time %.
- **To post finds to Discord**: point "Cleaning: found and fixed (with photo)" at
  #cleaning in `/settings/discord`, next to the other two Cleaning rows.

## Build phases

**Phase 0, this week (no code):** add the Cleaning section and tables to
`ARCHITECTURE.md` (the spec is law); turn the PDF into a constants seed file that
Mariana checks zone by zone (BOH table below); collect the variables from Monday's
walkthrough in whatever form it arrives (photos and notes are fine).

**Phase 1, BOH beta (target: first board built Thursday Oct 29, live Monday Nov 2):**
1. Schema, RLS, permission keys, storage bucket, seed (zones, BOH and FOH constants,
   slot caps).
2. Pure logic, test-first: next-due math, auto-place, carry-over, owner attribution,
   miss counting.
3. Master list, capture, draft approval.
4. Week board with move, skip, pull-in; Thursday build and Monday publish.
5. Today list with photo completion, "if needed", reject and redo.
6. Day-end job (misses, carry-overs, planner summary, Discord), Saturday reminder.
7. Print view matching the paper sheet.

**Phase 2 (week after beta):** metrics and leaderboard, ATD log with its Discord post.

**Phase 3 (after 2 stable BOH weeks):** FOH constants from its paper sheet (FOH areas
are already on the board), hand-off to team members, tokens, desktop board if wanted.

## Failure modes the tests must cover first

- The Thursday build or day-end job running twice creates nothing new.
- A double-tapped "done" records one completion.
- No clean is marked done without a stored photo.
- Store-local dates (America/New_York), Sundays closed, Saturday carries to Monday,
  daylight-saving change weeks.
- A slot capped at 0 gets no variables; overflow lands in the tray, not dropped.
- A weekly variable lands every week; a 13-week item lands once a quarter.
- Skips keep the item overdue; completions move the next due date; redo completions
  count, rejected ones do not count as on time.
- A clean done early in the week counts on time and doesn't also show as a miss.
- Owner attribution when no Setup posted or the leader changed mid-day.
- A retired item disappears from future weeks but keeps its history.
- Hidden FOH zones never show up in a BOH week build or in BOH metrics.
- Team members without `cleaning.view_reports` cannot read metrics, even by URL.

## Settled after the first draft

- Only Sunday counts as closed. Around any other closure Mariana moves cleans by hand.
- Zones are areas, not colors (2026-10-26, migration `20261026050000_cleaning_area_zones.sql`).
  The 36 BOH constants were moved to areas by best guess from their names; the less
  certain ones are Air vents, Rethermalizer (Machines), Lowboy gaskets (Boards) and Spray
  the whale (Dumpster). Mariana corrects any on the master list. FOH is on the board
  from the same date; it has no cleans until walkthrough items are approved.
- Vestibule cleans go in the Vestibule area, Red group (the zones message wins over the
  PDF's orange text; Naldo: either is fine).
- "Spray?Brush the whale" is "Spray the whale".
- Letting a person hold more than one role is a separate, app-wide change and is not
  part of this module. The coordinator tag covers cleaning until then.

## Before Phase 1 starts (Naldo)

0. ~~Decide how the app knows the AM and PM owner.~~ Settled: Setups is switched on,
   and the day-end close reads the posted Morning and Closing Setup leaders. Misses on a
   day with no posted Setup record "no owner".
1. Create the #cleaning Discord channel and its webhook.
2. Send the walkthrough's variables (photos and notes are fine) when ready.
3. Have Mariana check the BOH appendix below.

## Appendix: BOH constants seed (from the paper sheet, Mariana to verify)

Zones by text color on the PDF: blue = Blue, green = Green, yellow = Yellow. Since
2026-10-26 each color is split into its areas (see "Settled after the first draft").

| Day | AM | PM |
|---|---|---|
| Mon | White walls by back door (Blue); Secondary fry boil out (Green); Air vents (Yellow) | Deep clean dish washer (Blue); Boil out primary (Green); Holding cabinet (Yellow) |
| Tue | Dumpster pad scrub, if needed (Blue); Fry and oven vents (Green); Machine vents (Yellow) | Clean lockers / cup holders (Blue); Boards deep clean (Green); Lowboy gaskets (Green) |
| Wed | Freezer (Blue); Walk-in cooler (Blue); Prep shelving (Green) | Prep white walls (Green); Clean above machines (Yellow); Machine hood inner (Yellow) |
| Thu | Freezer / cooler doors (Blue); Deep clean Hobart mixer (Blue); Clean out fry fridges (Green) | Back splash on dish (Blue); Rethermalizer (Yellow); Breading deep clean (Yellow) |
| Fri | Boards lowboys (Green); Underneath boards (Green); Holding cabinet racks (Yellow) | "Clean" dish rack (Blue); Mop sink (Blue); Holding cabinet inner (Yellow) |
| Sat | Ovens deep clean (Green); Thawing cabinets 1/2 deep clean (Yellow); Thawing cabinets 2/3 deep clean (Yellow) | Spray the whale (Blue); Clean behind dirty dish rack (Blue); Prep lowboys (Green) |

36 BOH constants. The FOH sheet has about 70 entries (several repeat on two days);
they get the same treatment when FOH switches on. The "Guest Environment" page is a
copy of the BOH page and is ignored.

---

## Execution prompt (runs after approval)

```xml
<role>
Senior full-stack engineer on FarmingdaleIQ (Next.js 16 App Router, Supabase with RLS,
Vitest). Think like the restaurant leader who has to use this on a phone mid-shift, and
review like an auditor hunting idempotency holes and permission gaps.
</role>

<context>
Read AGENTS.md, ARCHITECTURE.md, docs/DESIGN-SYSTEM.md, then docs/CLEANING-PLAN.md.
The plan's "Decisions" table is the spec for this module; do not add scope beyond it.
Reference patterns: app/(app)/people/actions.ts (server actions), app/(app)/tasks/
materialize.ts (idempotent upsert materialization), app/(app)/checklists/logic.ts
(storeLocalNow, schedule logic), app/api/cron/checklists (cron + Discord payload),
supabase/migrations/20260803110000_work_order_photos.sql (photo storage),
app/(app)/training/schedule/page.tsx (print styling), lib/nav/page-map.ts (nav).
</context>

<task>
Build Phase 1 of docs/CLEANING-PLAN.md as a chain of PRs, one per numbered step,
each branched from fresh main and gated green before the next:
1. ARCHITECTURE.md Cleaning section + data model (docs-only PR).
2. Migration: tables, constraints, RLS, permission keys, storage bucket; seed zones,
   slot caps, BOH and FOH constants (FOH zones inactive). Seed values only from the
   plan appendix after Mariana's corrections.
3. app/(app)/cleaning/logic.ts + validation.ts, test-first, covering every item in
   "Failure modes the tests must cover first".
4. Master list, capture, approval screens and actions.
5. Week board, Thursday build, Monday publish, move/skip/pull-in actions.
6. Today list, photo completion, if-needed, reject/redo.
7. Day-end cron (misses, carry-over, coordinator summary, Discord daily post), Monday
   "week published" Discord post, Saturday reminder, vercel.json entries.
8. Print view.
Steps 4, 6 and 8 touch separate screens and can run in parallel after step 5's
shared actions land.
</task>

<output_shape>
Per PR: the code, tests beside the code, a commit body in the repo's house style
(what was wrong, what changed, why), and a PR body with a plain-English summary Naldo
can approve from his phone.
</output_shape>

<guardrails>
- Every mutation: "use server", requirePermission() first, zod validation from a
  sibling validation.ts, per-request Supabase client, ActionResult return.
- Migrations append-only; never edit an applied one.
- Store-local dates via storeLocalNow; never the server clock.
- No clean marked done without a stored photo.
- Discord webhook URLs stay server-side, and Discord posts name items, never people.
- Phone first: one-handed, scannable, shallow; follow docs/DESIGN-SYSTEM.md.
- No tokens, no accountability points, no competition, no team hand-off in Phase 1.
- Comments explain why, not what. No em dashes in any written text.
</guardrails>

<bar>
Done when: gates (typecheck, lint, test, build) are green on every PR; the Thursday
build produces next week's BOH board from the seed; a leader on a phone can complete
a clean with a photo; a missed clean carries over exactly once and is attributed to
the right Setup leader; the printout matches the paper sheet's layout; and a
rerun of every job changes nothing.
</bar>

<examples>
The current paper sheet (Cleaning Tasks PDF, BOH page) is the print target and the
mental model for the board: Mon to Sat columns, AM and PM halves, zone-colored items.
</examples>

<self_review>
Before each PR: reread the diff against the Decisions table and the failure-mode list;
hunt for double-insert paths, timezone slips, and any route or query a team member
could reach without the right permission key. Fix before opening the PR.
</self_review>
```
