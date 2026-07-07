import { describe, expect, it, vi, beforeEach } from "vitest";

import { FakeSupabase } from "@/lib/notify/test-support/fake-supabase";
import { computeNextRetryDelayMinutes, deliverPendingOutbox, enqueueDiscordMessage } from "./outbox";

const { sendDiscordWebhookMock } = vi.hoisted(() => ({
  sendDiscordWebhookMock: vi.fn(),
}));

vi.mock("./client", () => ({
  sendDiscordWebhook: sendDiscordWebhookMock,
}));

beforeEach(() => {
  sendDiscordWebhookMock.mockReset();
});

describe("computeNextRetryDelayMinutes", () => {
  it("follows the documented backoff schedule", () => {
    expect(computeNextRetryDelayMinutes(1)).toBe(1);
    expect(computeNextRetryDelayMinutes(2)).toBe(5);
    expect(computeNextRetryDelayMinutes(3)).toBe(15);
    expect(computeNextRetryDelayMinutes(4)).toBe(30);
    expect(computeNextRetryDelayMinutes(5)).toBe(60);
  });

  it("caps at the longest tier for attempt counts beyond the schedule", () => {
    expect(computeNextRetryDelayMinutes(99)).toBe(60);
  });
});

describe("enqueueDiscordMessage idempotency", () => {
  it("queues a message once for a given source event", async () => {
    const db = new FakeSupabase({ discord_outbox: [] });
    const client = db as unknown as Parameters<typeof enqueueDiscordMessage>[1];

    const first = await enqueueDiscordMessage(
      { channelId: "chan-1", message: { content: "hello" }, sourceEventId: "evt-1" },
      client,
    );
    expect(first.queued).toBe(true);
    expect(db.rowsOf("discord_outbox")).toHaveLength(1);

    const second = await enqueueDiscordMessage(
      { channelId: "chan-1", message: { content: "hello" }, sourceEventId: "evt-1" },
      client,
    );
    expect(second.queued).toBe(false);
    expect(db.rowsOf("discord_outbox")).toHaveLength(1);
  });

  it("queues separately for a different source event or channel", async () => {
    const db = new FakeSupabase({ discord_outbox: [] });
    const client = db as unknown as Parameters<typeof enqueueDiscordMessage>[1];

    await enqueueDiscordMessage(
      { channelId: "chan-1", message: { content: "a" }, sourceEventId: "evt-1" },
      client,
    );
    await enqueueDiscordMessage(
      { channelId: "chan-1", message: { content: "b" }, sourceEventId: "evt-2" },
      client,
    );
    await enqueueDiscordMessage(
      { channelId: "chan-2", message: { content: "c" }, sourceEventId: "evt-1" },
      client,
    );

    expect(db.rowsOf("discord_outbox")).toHaveLength(3);
  });
});

describe("deliverPendingOutbox", () => {
  it("marks a successfully delivered message as sent", async () => {
    sendDiscordWebhookMock.mockResolvedValueOnce(undefined);

    const db = new FakeSupabase({
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_outbox: [
        { id: "row-1", channel_id: "chan-1", payload: { content: "hi" }, status: "pending", attempts: 0 },
      ],
    });
    const client = db as unknown as Parameters<typeof deliverPendingOutbox>[1];

    const result = await deliverPendingOutbox(25, client);

    expect(result).toEqual({ delivered: 1, retried: 0, failed: 0 });
    expect(db.rowsOf("discord_outbox")[0].status).toBe("sent");
  });

  it("schedules a backoff retry on failure without marking it failed yet", async () => {
    sendDiscordWebhookMock.mockRejectedValueOnce(new Error("network error"));

    const db = new FakeSupabase({
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_outbox: [
        { id: "row-1", channel_id: "chan-1", payload: { content: "hi" }, status: "pending", attempts: 0 },
      ],
    });
    const client = db as unknown as Parameters<typeof deliverPendingOutbox>[1];

    const result = await deliverPendingOutbox(25, client);

    expect(result).toEqual({ delivered: 0, retried: 1, failed: 0 });
    const row = db.rowsOf("discord_outbox")[0];
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.next_retry_at).toBeTruthy();
  });

  it("marks permanently failed after MAX_ATTEMPTS", async () => {
    sendDiscordWebhookMock.mockRejectedValue(new Error("network error"));

    const db = new FakeSupabase({
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: true }],
      discord_outbox: [
        { id: "row-1", channel_id: "chan-1", payload: { content: "hi" }, status: "pending", attempts: 4 },
      ],
    });
    const client = db as unknown as Parameters<typeof deliverPendingOutbox>[1];

    const result = await deliverPendingOutbox(25, client);

    expect(result).toEqual({ delivered: 0, retried: 0, failed: 1 });
    const row = db.rowsOf("discord_outbox")[0];
    expect(row.status).toBe("failed");
  });

  it("fails immediately if the channel has been deactivated", async () => {
    const db = new FakeSupabase({
      discord_channels: [{ id: "chan-1", webhook_url: "https://discord.example/hook", active: false }],
      discord_outbox: [
        { id: "row-1", channel_id: "chan-1", payload: { content: "hi" }, status: "pending", attempts: 0 },
      ],
    });
    const client = db as unknown as Parameters<typeof deliverPendingOutbox>[1];

    const result = await deliverPendingOutbox(25, client);

    expect(result).toEqual({ delivered: 0, retried: 0, failed: 1 });
    expect(sendDiscordWebhookMock).not.toHaveBeenCalled();
  });
});
