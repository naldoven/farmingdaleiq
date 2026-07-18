import { describe, expect, it, vi, beforeEach } from "vitest";

import { FakeSupabase } from "@/lib/notify/test-support/fake-supabase";
import { processAppEvents } from "./events";

/**
 * Wraps a FakeSupabase so that inserting a notification for `poisonUserId`
 * rejects with an FK-style error (mirrors notifications_user_id_fkey in prod).
 * Everything else delegates to the real in-memory fake.
 */
function poisonNotificationClient(db: FakeSupabase, poisonUserId: string) {
  return {
    from(name: string) {
      const table = db.from(name);
      if (name !== "notifications") return table;
      return {
        select: () => table.select(),
        insert: (values: Record<string, unknown>) => {
          if (values.user_id === poisonUserId) {
            const p = Promise.resolve({
              data: null,
              error: {
                message:
                  'insert or update on table "notifications" violates foreign key constraint "notifications_user_id_fkey"',
              },
            });
            return { then: p.then.bind(p) };
          }
          return table.insert(values);
        },
      };
    },
    rowsOf: (name: string) => db.rowsOf(name),
  } as unknown as Parameters<typeof processAppEvents>[1];
}

const { sendWebPushMock, sendDiscordWebhookMock } = vi.hoisted(() => ({
  sendWebPushMock: vi.fn(),
  sendDiscordWebhookMock: vi.fn(),
}));

vi.mock("@/lib/notify/push", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notify/push")>("@/lib/notify/push");
  return {
    ...actual,
    sendWebPush: sendWebPushMock,
  };
});

vi.mock("@/lib/discord/client", () => ({
  sendDiscordWebhook: sendDiscordWebhookMock,
}));

beforeEach(() => {
  sendWebPushMock.mockReset();
  sendWebPushMock.mockResolvedValue(undefined);
  sendDiscordWebhookMock.mockReset();
});

function makeClient(seed: Record<string, Record<string, unknown>[]>) {
  const db = new FakeSupabase(seed);
  return { db, client: db as unknown as Parameters<typeof processAppEvents>[1] };
}

describe("processAppEvents", () => {
  it("creates an in-app notification for a notifiable event with a resolvable recipient", async () => {
    const { db, client } = makeClient({
      app_events: [
        { id: "evt-1", event_key: "task_assigned", payload: { userId: "user-1", title: "Sweep the lobby" } },
      ],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);

    expect(result.notificationsCreated).toBe(1);
    const notifications = db.rowsOf("notifications");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ user_id: "user-1", kind: "task_assigned", title: "Sweep the lobby" });
  });

  it("is idempotent: running twice over the same event does not duplicate the notification", async () => {
    const { db, client } = makeClient({
      app_events: [
        { id: "evt-1", event_key: "task_assigned", payload: { userId: "user-1", title: "Sweep the lobby" } },
      ],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    await processAppEvents(200, client);
    const second = await processAppEvents(200, client);

    expect(second.notificationsCreated).toBe(0);
    expect(db.rowsOf("notifications")).toHaveLength(1);
  });

  it("skips events with no resolvable recipient rather than throwing", async () => {
    const { client } = makeClient({
      app_events: [{ id: "evt-1", event_key: "broadcast", payload: { title: "Store closes early Friday" } }],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);
    expect(result.scanned).toBe(1);
    expect(result.notificationsCreated).toBe(0);
  });

  it("fans out Web Push to every subscription for the recipient", async () => {
    const { client } = makeClient({
      app_events: [{ id: "evt-1", event_key: "task_assigned", payload: { userId: "user-1", title: "Task" } }],
      notifications: [],
      push_subscriptions: [
        { id: "sub-1", user_id: "user-1", endpoint: "https://push.example/a", p256dh: "p1", auth: "a1" },
        { id: "sub-2", user_id: "user-1", endpoint: "https://push.example/b", p256dh: "p2", auth: "a2" },
      ],
      profiles: [],
    });

    const result = await processAppEvents(200, client);
    expect(result.pushSent).toBe(2);
    expect(sendWebPushMock).toHaveBeenCalledTimes(2);
  });

  it("queues a Discord message when a route is configured, and skips when it isn't", async () => {
    const { db, client } = makeClient({
      app_events: [
        { id: "evt-1", event_key: "maint_request", payload: { title: "Ice machine leaking" } },
        { id: "evt-2", event_key: "equipment_down", payload: { title: "Fryer #2 down" } },
      ],
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_event_routes: [{ event_key: "maint_request", channel_id: "chan-1", enabled: true }],
      discord_outbox: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);

    expect(result.discordQueued).toBe(1);
    expect(db.rowsOf("discord_outbox")).toHaveLength(1);
  });

  it("never leaks infraction detail into the Discord message it queues", async () => {
    const { db, client } = makeClient({
      app_events: [
        {
          id: "evt-1",
          event_key: "infraction_issued",
          payload: { userId: "user-1", title: "3 points — tardy", points: 3 },
        },
      ],
      discord_channels: [{ id: "chan-leaders", webhook_url: "https://discord.example/leaders", active: true }],
      discord_event_routes: [{ event_key: "infraction_issued", channel_id: "chan-leaders", enabled: true }],
      discord_outbox: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [{ id: "user-1", name: "Jamie Rivera", discord_user_id: "555" }],
    });

    await processAppEvents(200, client);

    const outboxRow = db.rowsOf("discord_outbox")[0];
    const payload = outboxRow.payload as { content: string };
    expect(payload.content).toBe("⚠️ Jamie Rivera received an infraction.");
    expect(payload.content).not.toContain("points");
    expect(payload.content).not.toContain("3");
  });

  it("honors a per-instance notifyDiscord: false override even when the route is enabled", async () => {
    const { db, client } = makeClient({
      app_events: [
        {
          id: "evt-1",
          event_key: "task_overdue",
          payload: { title: "Sweep the lobby", notifyDiscord: false },
        },
      ],
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_event_routes: [{ event_key: "task_overdue", channel_id: "chan-1", enabled: true }],
      discord_outbox: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);

    expect(result.discordQueued).toBe(0);
    expect(db.rowsOf("discord_outbox")).toHaveLength(0);
  });

  it("is idempotent for Discord too: rerunning does not double-queue", async () => {
    const { db, client } = makeClient({
      app_events: [{ id: "evt-1", event_key: "maint_request", payload: { title: "Ice machine leaking" } }],
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_event_routes: [{ event_key: "maint_request", channel_id: "chan-1", enabled: true }],
      discord_outbox: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    await processAppEvents(200, client);
    await processAppEvents(200, client);

    expect(db.rowsOf("discord_outbox")).toHaveLength(1);
  });

  it("advances a durable cursor so the window moves past `limit` (parity #7)", async () => {
    // Three notifiable events, oldest-first. With limit=2 the old code would
    // re-fetch the same oldest 2 every run and never reach evt-3.
    const { db, client } = makeClient({
      app_events: [
        { id: "evt-1", event_key: "task_assigned", created_at: "2026-07-07T10:00:00.000Z", payload: { user_id: "u1", title: "A" } },
        { id: "evt-2", event_key: "task_assigned", created_at: "2026-07-07T10:01:00.000Z", payload: { user_id: "u2", title: "B" } },
        { id: "evt-3", event_key: "task_assigned", created_at: "2026-07-07T10:02:00.000Z", payload: { user_id: "u3", title: "C" } },
      ],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const first = await processAppEvents(2, client);
    expect(first.scanned).toBe(2);
    expect(first.notificationsCreated).toBe(2);

    // Cursor parked on the batch high-water mark (evt-2).
    const cursor = db.rowsOf("job_cursors")[0];
    expect(cursor).toMatchObject({ job_name: "process-events", last_event_id: "evt-2" });

    const second = await processAppEvents(2, client);
    // Window advanced: only evt-3 remains, not a re-scan of evt-1/evt-2.
    expect(second.scanned).toBe(1);
    expect(second.notificationsCreated).toBe(1);

    const recipients = db.rowsOf("notifications").map((n) => n.user_id).sort();
    expect(recipients).toEqual(["u1", "u2", "u3"]);
  });

  it("fans a broadcast (no explicit recipient) out to every active profile", async () => {
    const { db, client } = makeClient({
      app_events: [
        { id: "evt-1", event_key: "broadcast", created_at: "2026-07-07T10:00:00.000Z", payload: { title: "Store closes early Friday" } },
      ],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [
        { id: "u1", active: true },
        { id: "u2", active: true },
        { id: "u3", active: false },
      ],
    });

    const result = await processAppEvents(200, client);

    expect(result.notificationsCreated).toBe(2);
    const recipients = db.rowsOf("notifications").map((n) => n.user_id).sort();
    expect(recipients).toEqual(["u1", "u2"]);
  });

  it("honors a per-instance discord_channel_id override over the global route (parity #8)", async () => {
    const { db, client } = makeClient({
      app_events: [
        {
          id: "evt-1",
          event_key: "maint_request",
          created_at: "2026-07-07T10:00:00.000Z",
          payload: { title: "Ice machine leaking", discord_channel_id: "chan-override" },
        },
      ],
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_event_routes: [{ event_key: "maint_request", channel_id: "chan-1", enabled: true }],
      discord_outbox: [],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);

    expect(result.discordQueued).toBe(1);
    expect(db.rowsOf("discord_outbox")[0]).toMatchObject({ channel_id: "chan-override" });
  });

  it("dead-letters a poisoned recipient: good events still process and the cursor advances past it (N1)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeSupabase({
      app_events: [
        { id: "evt-good", event_key: "task_assigned", created_at: "2026-07-07T10:00:00.000Z", payload: { user_id: "u-good", title: "A" } },
        { id: "evt-poison", event_key: "task_assigned", created_at: "2026-07-07T10:01:00.000Z", payload: { user_id: "u-poison", title: "B" } },
      ],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });
    const client = poisonNotificationClient(db, "u-poison");

    const result = await processAppEvents(200, client);

    // The good event created its notification; the poison one was skipped, not
    // rethrown. Before the fix the whole batch threw and nothing was created.
    expect(result.scanned).toBe(2);
    expect(result.notificationsCreated).toBe(1);
    expect(db.rowsOf("notifications").map((n) => n.user_id)).toEqual(["u-good"]);

    // The cursor advanced PAST the poison row (batch high-water mark), so it is
    // dead-lettered rather than re-scanned forever.
    expect(db.rowsOf("job_cursors")[0]).toMatchObject({
      job_name: "process-events",
      last_event_id: "evt-poison",
    });

    // A second run finds nothing new — the poison event is not retried.
    const second = await processAppEvents(200, client);
    expect(second.scanned).toBe(0);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("isolates a poisoned recipient WITHIN one event so the other recipients still get notified (N1)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeSupabase({
      app_events: [
        {
          id: "evt-1",
          event_key: "broadcast",
          created_at: "2026-07-07T10:00:00.000Z",
          payload: { user_ids: ["u-good", "u-poison"], title: "All hands" },
        },
      ],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });
    const client = poisonNotificationClient(db, "u-poison");

    const result = await processAppEvents(200, client);

    expect(result.notificationsCreated).toBe(1);
    expect(db.rowsOf("notifications").map((n) => n.user_id)).toEqual(["u-good"]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("honors the canonical notify_discord: false opt-out", async () => {
    const { db, client } = makeClient({
      app_events: [
        {
          id: "evt-1",
          event_key: "task_overdue",
          created_at: "2026-07-07T10:00:00.000Z",
          payload: { title: "Sweep the lobby", notify_discord: false },
        },
      ],
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_event_routes: [{ event_key: "task_overdue", channel_id: "chan-1", enabled: true }],
      discord_outbox: [],
      job_cursors: [],
      notifications: [],
      push_subscriptions: [],
      profiles: [],
    });

    const result = await processAppEvents(200, client);

    expect(result.discordQueued).toBe(0);
    expect(db.rowsOf("discord_outbox")).toHaveLength(0);
  });
});
