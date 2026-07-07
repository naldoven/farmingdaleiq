import { describe, expect, it, vi, beforeEach } from "vitest";

import { FakeSupabase } from "@/lib/notify/test-support/fake-supabase";
import { processAppEvents } from "./events";

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
});
