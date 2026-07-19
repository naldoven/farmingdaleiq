/**
 * Pure helper for the checklists cron's `checklist_missed` emission (N5).
 *
 * A `checklist_schedule` carries per-schedule Discord controls
 * (`notify_discord`, `discord_channel_id` — supabase/migrations/
 * 20260707001600_notifications_discord.sql). Before this, the cron emitted
 * `checklist_missed` with only `{ runId, scheduleId }`, so those columns were
 * never forwarded and a leader could not mute (or re-route) the missed-alert
 * Discord post for one noisy schedule.
 *
 * The notify consumer (lib/notify/events.ts `processDiscordForEvent`) honors
 * the canonical `DiscordControlFields` (lib/events/bus.ts): a payload
 * `notify_discord: false` SUPPRESSES the Discord post ahead of the global
 * `discord_event_routes` toggle, and `discord_channel_id` overrides the
 * routed channel for that one event. `checklist_missed` is not in
 * NOTIFIABLE_EVENT_KEYS, so these fields only ever gate the Discord fan-out —
 * the in-app "missed" state on the run itself is unaffected.
 *
 * Forwarding the schedule's actual `notify_discord` boolean makes the flag a
 * real per-schedule gate (ARCHITECTURE.md "Discord integration" > "The flag":
 * "Leaders toggle it on for the important stuff"): a schedule left at the
 * column default (`false`) is muted, and one a leader flips on posts through
 * the global route. `discord_channel_id` is only forwarded when set so an
 * unset schedule falls back to the routed channel.
 */
export interface ScheduleDiscordControls {
  notify_discord: boolean | null;
  discord_channel_id: string | null;
}

export function buildChecklistMissedPayload(input: {
  runId: string;
  scheduleId: string;
  controls?: ScheduleDiscordControls;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    runId: input.runId,
    scheduleId: input.scheduleId,
  };

  const controls = input.controls;
  if (controls) {
    if (controls.notify_discord != null) {
      payload.notify_discord = controls.notify_discord;
    }
    if (controls.discord_channel_id) {
      payload.discord_channel_id = controls.discord_channel_id;
    }
  }

  return payload;
}
