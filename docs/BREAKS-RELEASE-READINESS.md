# Breaks release readiness

Switched on 2026-10-25 by flipping `breaks` in `lib/features.ts`. Turning the flag off again is the rollback: the pages return 404, the permissions leave the role editor, the cron route answers 404, and `break_overdue` drops out of every notification and Discord list. The database changes below are additive and stay in place either way.

## Confirmed Farmingdale rules

- One live break rule: a scheduled shift of 6 hours or more earns one 30-minute unpaid meal break. This is the only rule confirmed from KitchenIQ.
- The seeded minor rule (4 hours earns 30 minutes) is a New York law preset marked `SEED-DEFAULT`. It is in the table and the engine will apply it to anyone under 18 with a birthdate on file, but the store has not confirmed it.
- Breaks are planned per posted setup. A leader authorizes a break, the team member starts it, the leader completes it. A break authorized but not started within 10 minutes is flagged overdue; a break still open is marked missed only after the later of the person's scheduled end and the day-part end has passed (never before its due time), and only for setups dated today or yesterday in store time. The 10-minute grace is a `SEED-DEFAULT`.
- Every role can view breaks. Team Leader and above hold `breaks.manage` (authorize, start, complete, regenerate the plan). This matches the live `role_permissions` rows checked on 2026-10-25.

## What was wrong and what changed

- **No adult could ever earn a break.** The engine measured a shift as arrival to the end of the setup's day-part. Every seeded day-part is under five hours (Morning is the longest at 06:00 to 11:00), so the 6-hour rule never matched. The setups e2e spec even relies on this. Fix: `setup_assignments.scheduled_end` records when each person is scheduled to leave, and the engine measures arrival to scheduled end. With no scheduled end recorded it falls back to the old day-part math, so nothing already saved behaves differently.
- **One shift, one break.** A person on the Lunch and Dinner setups of the same date works one shift. The plan now skips anyone who already has a break of that kind on any setup for the same date, instead of granting one per setup.
- **Two leaders refreshing the plan at once could insert the same break twice.** The read-then-insert had no database backstop. A unique index on `breaks (setup_id, user_id, kind)` now exists and the insert is an upsert that ignores duplicates.
- **Two leaders tapping buttons at once could skip a state.** Authorize, start and complete validated the transition against a stale read and then wrote unconditionally. The write is now a compare-and-swap on the status that was validated. A lost race that landed the same state is a quiet success; one that landed a different state tells the leader to refresh.
- **Minor status used the server's calendar day.** Vercel runs in UTC, so from 8pm New York the server thinks it is tomorrow and would have treated someone as 18 a day early. Age is now computed on the store's calendar day through `lib/time`.
- **The overdue sweep carried its own copy of the grace window.** It now calls the same `isOverdue()` the board and tests use.
- **Dead link.** The Breaks page linked to the setup board, which is still dormant and returns 404. The link and the empty-state hint now appear only when the Setups module is on.
- **Cron restored.** `/api/cron/breaks-overdue` is back in `vercel.json` every 5 minutes. It was removed when the module went dormant.

## What fires after the flag flips

Checked against the live database on 2026-10-25.

- **First cron tick (within 5 minutes of deploy).** `breaks` has zero rows and `setups` has zero rows, so the sweep finds nothing to flag or mark missed, emits no events, and returns `{ flagged: 0, missed: 0 }`. The route needs `CRON_SECRET` on Vercel; without it the route refuses every call with 403, which is the safe failure.
- **First Discord post.** None. `break_overdue` is now routable, but `discord_event_routes` has no row for it and the only configured channel is Catering Notifications. Until a leaders channel is wired in Settings, overdue and missed breaks write an `app_events` row and nothing else. They do not create in-app notifications either (`break_overdue` is not in the notifiable list), so today a leader learns about an overdue break from the red badge on the board.
- **Old events.** Four `setup_posted` and one `broadcast` event from July 2026 sit in `app_events`. The notification drain's cursor is already past them (last advanced 2026-10-24), so they will not replay.
- **Breaks need posted setups.** Until the Setups module is woken, no setup can be created or posted, so no break rows can appear. The Breaks page and compliance report render empty states. Nothing can misfire because nothing can be created.

## Database change (applied by the agent only after Naldo's go)

`supabase/migrations/20261025000100_breaks_release_readiness.sql` (the `...000000` slot is taken by the already-applied catering migration):

1. Adds the nullable column `setup_assignments.scheduled_end timestamptz`.
2. Adds the unique index `breaks_setup_user_kind_uq` on `breaks (setup_id, user_id, kind)`.

Both are additive. The `breaks` table is empty, so the index cannot collide. The code depends on both, so the migration applies before the PR merges.

## Permissions and data access

- Every mutation calls `requirePermission("breaks.manage")` first, then writes through the per-request client so RLS re-checks the same key.
- Birthdates live in the locked `profiles_private` table. The plan reads them with the service-role client, uses them only to pick an age band, and never returns them to the browser.
- The overdue sweep is a service-role mutation that lives in a plain lib module, not a `"use server"` file, so it is reachable only through the cron route and its shared secret.

## Store decisions still needed

- Which Discord channel receives overdue and missed break alerts. Without a route, leaders only see them on the board. Whether a leader should also get an in-app or push notification is a product call; today none fires.
- Confirm the New York minor rule (4 hours earns a 30-minute break) is store policy, or remove it. It is seeded and will apply to anyone under 18 with a birthdate on file.
- Confirm the 10-minute overdue grace window.
- Confirm that a shift spanning several day-part setups earns one break, not one per setup. The code now assumes one.
- Whether every assigned person's scheduled end should be required before a setup can be posted. Today it is optional and a missing value quietly falls back to the day-part end, which almost never earns a break.
- A Break Rules settings screen does not exist yet ("Coming soon" in Settings). Rule changes are database edits until that ships.
