# Broadcast release readiness

Switched on 2026-10-25 by flipping `broadcast` in `lib/features.ts`. Turning the flag off again is the rollback: the Broadcast action leaves the Menu, the form leaves the feed page, `feed.post_broadcast` leaves the role editor, broadcast posts drop out of the feed and the Team page, and `broadcast` events stop fanning out. No database change ships with this module.

## Confirmed Farmingdale rules

- A broadcast is a leader announcement (rollout, event, policy update) posted to the Team Feed. Every signed-in employee can read it, like it, and comment on it.
- Team Leader and above hold `feed.post_broadcast`. This matches the live `role_permissions` rows checked on 2026-10-25.
- A broadcast is store-wide by design: the notification drain sends one in-app notification ("Announcement") to every active employee, and Web Push to anyone with a subscription. It is also a Discord event ("Wins and announcements" route) once a channel is wired.

## What was wrong and what changed

- **A double tap posted twice, store-wide.** `createBroadcast` had no double-submit guard. A second tap or a retried request created a second post and a second `broadcast` event, and each event notifies every active employee. The same leader posting the same text within five minutes now gets the existing post back and no second event. Recognition already carried the equivalent guard.
- **The Menu's Broadcast button landed on the wrong page.** It linked to `/team`, which only lists the three most recent broadcasts. The form is on `/team/feed`. The button now goes there.
- **A full-length broadcast would be rejected by Discord.** The body may be 2000 characters and Discord's content limit is 2000, so the "Announcement" title pushed a long post over the limit. Discord answers 400, the outbox retries five times, then the post is lost. Messages are now clamped to 2000 characters, keeping the title and any mention intact.

## What already held up under review

- `createBroadcast` calls `requirePermission("feed.post_broadcast")` first, then inserts through the per-request client. The `feed_posts` insert policy independently requires the same permission, `kind = 'broadcast'`, and an author of the caller or null. The `app_events` insert policy requires the same permission for a `broadcast` event, so nobody can forge a store-wide announcement by writing the event directly.
- The Discord message never lets Discord parse mentions out of user-typed text, so a typed "@everyone" in a broadcast does not ping the server. A broadcast also @mentions nobody: it is addressed to every active employee, so the Discord post carries no `<@id>` and no `allowed_mentions.users` (notifications and push still go to everyone).
- The notification drain is idempotent per event and recipient, and the Discord outbox is idempotent per event and channel, so a re-scanned event cannot double-notify.
- Broadcast posts render with the author's name and a "Broadcast" badge, and anyone can like or comment, the same as recognitions.

## What fires after the flag flips

Checked against the live database on 2026-10-25.

- **No cron belongs to this module.** Nothing new is scheduled.
- **Notification drain (`/api/jobs/process-events`, every 5 minutes).** `broadcast` is notifiable and Discord-routable again. One `broadcast` event exists, from 2026-07-18. The drain's cursor last advanced on 2026-10-24, well past it, so it does not replay. First tick does nothing.
- **First Discord post.** None. `discord_event_routes` has no row for `broadcast` and the only configured channel is Catering Notifications. Until a team channel is wired in Settings, a broadcast reaches the feed and in-app notifications only.
- **The next real broadcast** notifies all 11 active employees in-app. No push subscriptions exist today, so no push is sent.
- `feed_posts` has no broadcast rows today, so nothing new appears in the feed or on the Team page until a leader posts one.

## Store decisions still needed

- Which Discord channel carries broadcasts (ARCHITECTURE.md: the "Wins and announcements" bucket alongside recognitions and Top Performer). Until one is wired, broadcasts do not reach Discord.
- Confirm Team Leader is the lowest role that may post a broadcast. It is today.
- Whether a broadcast should also be pinned or expire. Today it is an ordinary feed post that scrolls away with the rest of the feed; the Team page shows the three most recent.
- Whether a broadcast should ever target a team or day-part instead of the whole store. The event payload supports explicit recipients, but the form has no such option.
