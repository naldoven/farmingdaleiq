import type { EventKey, EventPayload } from "@/lib/events/bus";

export interface NotificationContent {
  title: string;
  body?: string;
  link?: string;
}

/**
 * Event keys the in-app notification center surfaces (ARCHITECTURE.md
 * "Notifications" > Events: "to-do assigned, setup posted..., infraction
 * received, disciplinary action triggered, recognition/shoutout received,
 * reward claim status, training assigned, follow-up assigned"), plus a
 * small set of clearly-adjacent keys (gift_sent, reward_fulfilled,
 * passport_stamped, graduation_ready, broadcast, top_performer) that the
 * same sentence's intent obviously covers.
 *
 * N4: `maint_request` and `work_order_status` also belong here. The
 * Maintenance module (ARCHITECTURE.md "Requests": "any team member submits a
 * maintenance request ... and is notified as its status changes") emits both
 * carrying the requester's `user_id` (see app/(app)/maintenance/logic.ts
 * `requesterRecipientPayload`), but they were previously only in
 * DISCORD_ROUTABLE — so the requester got a Discord post to leaders and no
 * in-app/push notification of their own request's outcome. Adding the keys
 * here makes the notification drain resolve that requester recipient.
 */
export const NOTIFIABLE_EVENT_KEYS: EventKey[] = [
  "task_assigned",
  "setup_posted",
  "infraction_issued",
  "disciplinary_triggered",
  "recognition",
  "gift_sent",
  "reward_claim",
  "reward_fulfilled",
  "training_assigned",
  "follow_up_assigned",
  "passport_stamped",
  "graduation_ready",
  "broadcast",
  "top_performer",
  "maint_request",
  "work_order_status",
];

/**
 * Accountability privacy rule (ARCHITECTURE.md "Discord integration" >
 * Privacy rule) is written for Discord, but the same spirit applies to the
 * in-app center: the recipient can see they got an infraction (that's the
 * point of the "my record" page), but this drain job never repeats point
 * counts or infraction-type text sourced from another module's payload — it
 * always uses a fixed, generic message and links to /accountability where
 * the owning module's own permission-gated view shows the real detail.
 */
const PRIVACY_GENERIC_KEYS = new Set<EventKey>([
  "infraction_issued",
  "disciplinary_triggered",
]);

const DEFAULT_TITLES: Partial<Record<EventKey, string>> = {
  task_assigned: "New to-do assigned",
  setup_posted: "You're on the schedule",
  infraction_issued: "You received an infraction",
  disciplinary_triggered: "A disciplinary action was issued",
  recognition: "You were recognized",
  gift_sent: "You received tokens",
  reward_claim: "Reward claim update",
  reward_fulfilled: "Your reward is ready",
  training_assigned: "New training assigned",
  follow_up_assigned: "Follow-up assigned to you",
  passport_stamped: "A passport was stamped",
  graduation_ready: "Ready for graduation review",
  broadcast: "Announcement",
  top_performer: "Top Performer!",
  maint_request: "Maintenance request update",
  work_order_status: "Work order update",
};

const DEFAULT_LINKS: Partial<Record<EventKey, string>> = {
  task_assigned: "/tasks",
  setup_posted: "/setups",
  infraction_issued: "/accountability",
  disciplinary_triggered: "/accountability",
  recognition: "/team",
  gift_sent: "/tokens",
  reward_claim: "/rewards",
  reward_fulfilled: "/rewards",
  training_assigned: "/training",
  follow_up_assigned: "/tasks",
  passport_stamped: "/training",
  graduation_ready: "/training/graduates",
  broadcast: "/team",
  top_performer: "/team",
  maint_request: "/maintenance",
  work_order_status: "/maintenance",
};

/**
 * Builds the in-app notification's title/body/link for one event. Prefers
 * whatever the producer put in the payload (`title`, `body`/`message`,
 * `link`/`url`) and falls back to a generic per-event default so the
 * notification is still readable before every producer has finalized its
 * payload shape.
 */
export function buildNotificationContent(
  key: EventKey,
  payload: EventPayload,
): NotificationContent {
  if (PRIVACY_GENERIC_KEYS.has(key)) {
    return {
      title: DEFAULT_TITLES[key] ?? key,
      link: DEFAULT_LINKS[key],
    };
  }

  const title =
    (typeof payload.title === "string" && payload.title) ||
    DEFAULT_TITLES[key] ||
    key;
  const body =
    (typeof payload.body === "string" && payload.body) ||
    (typeof payload.message === "string" && payload.message) ||
    undefined;
  const link =
    (typeof payload.link === "string" && payload.link) ||
    (typeof payload.url === "string" && payload.url) ||
    DEFAULT_LINKS[key];

  return { title, body, link };
}
