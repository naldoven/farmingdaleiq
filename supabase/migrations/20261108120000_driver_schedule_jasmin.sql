-- Driver reservations: Jasmin's schedule (2026-11-02 voice memo).
--
-- 1. A new reminder kind for the 6 AM ping to the Opening director. The retired
--    kinds (night_ping, night_escalation) stay allowed so rows already sent
--    keep reading and the scorecard keeps counting the escalations.
-- 2. The Discord role that escalations tag (the directors). Optional: blank
--    posts without a tag. The pattern matches a Discord snowflake, because a
--    malformed <@&id> makes Discord reject the whole webhook message.

alter table public.catering_driver_reminders
  drop constraint catering_driver_reminders_kind_check;

alter table public.catering_driver_reminders
  add constraint catering_driver_reminders_kind_check check (kind in (
    'night_ping',
    'night_last_call',
    'night_escalation',
    'opening_ping',
    'morning_ping',
    'morning_last_call',
    'arrival',
    'before_60',
    'before_30_escalation'
  ));

alter table public.catering_driver_settings
  add column directors_discord_role_id text
    check (directors_discord_role_id is null or directors_discord_role_id ~ '^[0-9]{15,25}$');
