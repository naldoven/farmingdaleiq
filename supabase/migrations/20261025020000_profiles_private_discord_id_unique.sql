-- Two accounts must never share a Discord ID.
--
-- Why: mentions, test pings, and any lookup by Discord ID assume an ID points
-- at exactly one person. The first-login link (linkMyDiscordId) and the People
-- profile edit (updateProfile) both check for a taken ID with a read before
-- they write, and a read-then-write check cannot stop two saves landing at the
-- same moment. This index makes the database the final referee: the second
-- writer gets SQLSTATE 23505, which both actions turn into "That Discord ID is
-- already linked to another person."
--
-- Partial on purpose: most rows have no Discord ID yet (null), and nulls must
-- not collide with each other.
--
-- Safe to apply now, before the code that relies on it deploys: no Discord IDs
-- have been saved yet, so the index build has no duplicates to trip over. If a
-- duplicate did exist the build would fail loudly instead of picking a winner.
-- Append-only: this adds an index and changes no existing object.

create unique index if not exists profiles_private_discord_user_id_uq on public.profiles_private (discord_user_id) where discord_user_id is not null;
