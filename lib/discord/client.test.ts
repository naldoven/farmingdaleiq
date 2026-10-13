import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendDiscordWebhook } from "./client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(): unknown {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("sendDiscordWebhook allowed_mentions", () => {
  it("defaults to no pings when the message has none (legacy outbox rows, other callers)", async () => {
    await sendDiscordWebhook("https://discord.example/hook", { content: "hey @everyone" });

    expect(sentBody()).toEqual({ content: "hey @everyone", allowed_mentions: { parse: [] } });
  });

  it("keeps an explicit allowed_mentions value untouched", async () => {
    await sendDiscordWebhook("https://discord.example/hook", {
      content: "<@123456789> you're up",
      allowed_mentions: { parse: [], users: ["123456789"] },
    });

    expect(sentBody()).toEqual({
      content: "<@123456789> you're up",
      allowed_mentions: { parse: [], users: ["123456789"] },
    });
  });

  it("still throws on a non-2xx response so the outbox can back off", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    await expect(
      sendDiscordWebhook("https://discord.example/hook", { content: "hi" }),
    ).rejects.toThrow("Discord webhook responded with 429");
  });
});
