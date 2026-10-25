-- Route the nightly "Tomorrow's catering" digest (event key
-- catering_tomorrow_digest, queued by app/api/cron/catering/route.ts) to the
-- same Discord channel new catering orders already post to, so the digest
-- works the evening the code deploys without a trip to /settings/discord.
-- The route stays editable there like every other event key.
--
-- Deploy order: safe to apply before or after the code. Before: the row sits
-- unused until the cron emits the first digest. After: the consumer skips
-- the digest (no route) until this runs, and nothing is lost because the
-- digest is re-queued the next evening.
--
-- Idempotent: event_key is the primary key, so a re-run inserts nothing, and
-- a route an admin already set by hand is left alone.
insert into public.discord_event_routes (event_key, channel_id, enabled)
select 'catering_tomorrow_digest', r.channel_id, r.enabled
from public.discord_event_routes r
where r.event_key = 'catering_order_new'
on conflict (event_key) do nothing;
