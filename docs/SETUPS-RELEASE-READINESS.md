# Setups release readiness

Switched on 2026-10-25 by flipping `setups` in `lib/features.ts`. Turning the flag off again is the rollback: the Setup board and templates pages return 404, the permissions leave the role editor, `setup_posted` drops out of the notification and task-creation lists, and Lead Duties tasks disappear from the task views. No database change ships with this module.

## Confirmed Farmingdale rules

- Six day-parts: Morning 06:00 to 11:00, Lunch 11:00 to 15:00, Mid 15:00 to 17:00, Dinner 17:00 to 19:00, Night 19:00 to 23:00, Closing 23:00 to 23:45.
- Shift Supervisor and above hold `setups.manage` (build a setup, assign people, edit templates and the layout). Team Leader and above hold `setups.post` (post the setup, shift notes, pick the Top Performer). Every role can view the board. This matches the live `role_permissions` rows checked on 2026-10-25.
- Top Performer pays 20 tokens and posts to the team feed. The 20 is a `SEED-DEFAULT` in `token_earning_rules`.
- Positions are still the Avondale `SEED-DEFAULT` list in five groups (Front Counter, Drive Thru, Dining Room, Kitchen, Back of House Support). The live store also has an unrelated "FOH" group of training-roadmap stations that share a few names (Register 1, Register 2) with setup positions. Farmingdale's own station list is ARCHITECTURE.md open question 1.

## Store layout

The live store already has one layout, "Main Floor (Default)", active for every day-part, with 12 tiles placed by hand. The repo did not know how to create it, so a fresh environment had no board at all. This pass adds:

- A seedable default layout with the same name, covering all 19 seeded positions (front counter and drive thru across the top, dining room beneath, kitchen line, back of house at the bottom). It appears as a one-tap "Start from the default floor plan" when the store has no layout. It is idempotent: any existing layout means the store already decided, and nothing is inserted. On the live store it does nothing.
- Tile labels now read as the position name. The live tiles stored the group name as the area label, and the canvas preferred the label, so every tile read "Front Counter" or "Kitchen" instead of "Register 1" or "Breading". No data change was needed.
- Up and down arrows in the list view beside the existing left and right. Phones have no drag-and-drop, so the list view is the only way to arrange tiles from a phone, and it could only move sideways.

The layout stays fully editable: drag on desktop, step with arrows on a phone, add or remove tiles, create more layouts per day-part, activate or deactivate. The real floor plan (open question 7) is still owed, but it no longer blocks the module.

## What was wrong and what changed

- **Top Performer could be anyone.** The action checked the permission and the once-per-shift rule but not that the person was on the setup. The board only offers assigned people, but UI hiding is not security, and the event mints tokens. The action now refuses a pick who is not assigned to that setup.
- **Layout tiles showed the wrong name** (see above).
- **Layout editing was desktop-only** (see above).
- **No default layout existed in the repo** (see above).
- **The setups e2e spec referenced a button label that no longer exists** ("Create setup from template"). It now matches the board ("Build setup"). CI skips the e2e job today because the live Supabase secrets are not configured in the repository, so this only matters once they are.

## What already held up under review

- Creating a setup is idempotent on (date, day-part) through a unique index and a 23505 fallback. Assignments upsert on (setup, position). Posting is a compare-and-swap on `posted_at`, so a double tap or two leaders posting at once emits one `setup_posted` and generates breaks once.
- Every mutation calls `requirePermission` first and writes through the per-request client; RLS enforces the same keys (`setups.manage` for build, assign, templates, layouts; `setups.post` for post, notes, Top Performer).
- Birthdates and hire dates for badges are read from the locked `profiles_private` table with the service-role client and used only to compute badges; the raw dates never reach the browser.
- Posting a setup materializes position-linked checklist runs and tasks for the assigned people on the same keys the nightly crons use, so neither path duplicates the other.
- Dates and times go through `lib/time`: the board defaults to the store's calendar day, arrival and scheduled-end inputs round-trip in New York wall-clock time, and the hourly roster buckets by store hour.

## What fires after the flag flips

Checked against the live database on 2026-10-25.

- **No cron belongs to this module.** Nothing new is scheduled.
- **Tasks event drain (`/api/tasks/events`, every 5 minutes).** `setup_posted` is back in its list, and this drain has no cursor: it rescans every `setup_posted` event. Five exist from July 2026. Three carry no `leader_user_id` and map to nothing. The other two already produced their Lead Duties tasks in July, and the drain skips events whose task exists. First tick creates zero tasks.
- **Notification drain (`/api/jobs/process-events`).** `setup_posted` is notifiable again, but the drain's cursor last advanced on 2026-10-24, well past the July events, so none replay. The next real post notifies each assigned person in-app ("You're on the schedule"). No push subscriptions exist, so no push is sent.
- **Discord.** `setup_posted` is not a Discord event. `top_performer` is, but it has no `discord_event_routes` row and the only configured channel is Catering Notifications, so a Top Performer pick posts to the team feed and the person's notifications only. No Discord post fires.
- **Tokens cron.** No `top_performer` events exist to replay; the one Top Performer feed post on record already paid out.
- **Lead Duties tasks** reappear in the task lists. Two exist, both dated July 2026, so they are not in anyone's "today" view.

## Store decisions still needed

- The real floor plan (open question 7): a photo or sketch of the setup whiteboard, so the default layout can be arranged to match. The editor can do it tile by tile once the plan is known.
- Farmingdale's position groups and positions (open question 1). The Avondale list is a placeholder and the training-roadmap "FOH" group shares names with it. Whether the two groups should be reconciled.
- Confirm the Top Performer amount (20 tokens) and whether a leader should be able to pick someone who worked but was not on the posted board.
- Whether the shift leader should be chosen when building a setup. Today the board always leaves it blank, so Lead Duties fall to whoever taps Post.
- Which Discord channel, if any, should carry Top Performer and setup posts. Today neither reaches Discord.
- Whether a scheduled end should be required for every assigned person before posting (also listed under Breaks). Without it the break engine almost never grants a break.
