import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the three guarantees the self-service Discord link rests on:
 *   1. `linkMyDiscordId` writes only the caller's own row, only when no valid
 *      id is stored yet, and only a numeric id.
 *   2. `sendMyDiscordTestPing` refuses when recognition has no route and
 *      otherwise queues one mention-only message keyed to the caller.
 *   3. `skipDiscordLinkForNow` scopes the cookie to the caller's user id.
 *
 * Supabase is mocked as a minimal chainable/thenable builder (same approach
 * as app/(app)/settings/discord/actions.test.ts); the per-request and
 * service-role clients are separate mocks so the test can assert WHICH one
 * performed the write.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet, get: () => undefined }),
}));

interface EnqueueInput {
  channelId: string;
  message: { content: string; allowed_mentions: unknown };
  sourceEventId: string;
}

const enqueue = vi.fn<(input: EnqueueInput) => Promise<{ queued: boolean }>>();
const deliver = vi.fn<(limit: number) => Promise<{ delivered: number; retried: number; failed: number }>>();
vi.mock("@/lib/discord/outbox", () => ({
  enqueueDiscordMessage: (input: EnqueueInput) => enqueue(input),
  deliverPendingOutbox: (limit: number) => deliver(limit),
}));

const getRoute = vi.fn<(key: string) => Promise<{ channelId: string; webhookUrl: string } | null>>();
vi.mock("@/lib/discord/routes", () => ({
  getDiscordRoute: (key: string) => getRoute(key),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOOD_ID = "123456789012345678";

let storedDiscordId: string | null = null;
let idTakenByOther = false;
let pingsToday = 0;
let signedIn = true;
const userUpdates: { payload: unknown; filters: unknown[] }[] = [];
const adminUpdates: { payload: unknown; filters: unknown[] }[] = [];

function makeClient(updates: { payload: unknown; filters: unknown[] }[]) {
  let pendingUpdate: { payload: unknown; filters: unknown[] } | null = null;
  let lastSelect = "";
  const builder: PromiseLike<{ data: unknown; error: null; count: number }> &
    Record<string, unknown> = {
    select: (columns: string) => {
      lastSelect = columns;
      return builder;
    },
    neq: () => builder,
    like: () => builder,
    gte: () => builder,
    limit: () => builder,
    update: (payload: unknown) => {
      pendingUpdate = { payload, filters: [] };
      updates.push(pendingUpdate);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      pendingUpdate?.filters.push([column, value]);
      return builder;
    },
    // Two reads share this builder: the caller's own row (discord_user_id) and
    // the "is this id taken by someone else" probe (profile_id).
    maybeSingle: async () =>
      lastSelect === "profile_id"
        ? { data: idTakenByOther ? { profile_id: "other-user" } : null, error: null }
        : { data: { discord_user_id: storedDiscordId }, error: null },
    // Awaiting the builder directly is the head-count query (daily ping cap)
    // or an update; both resolve with no rows.
    then(onFulfilled, onRejected) {
      pendingUpdate = null;
      return Promise.resolve({ data: null, error: null, count: pingsToday }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return {
    from: vi.fn(() => builder),
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: USER_ID } : null } }),
    },
  };
}

const userClient = makeClient(userUpdates);
const adminClient = makeClient(adminUpdates);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => userClient,
  createServiceRoleClient: () => adminClient,
}));

import { linkMyDiscordId, sendMyDiscordTestPing, skipDiscordLinkForNow } from "./actions";

beforeEach(() => {
  storedDiscordId = null;
  idTakenByOther = false;
  pingsToday = 0;
  signedIn = true;
  userUpdates.length = 0;
  adminUpdates.length = 0;
  vi.clearAllMocks();
  getRoute.mockResolvedValue({ channelId: "chan-1", webhookUrl: "https://discord.com/api/webhooks/x" });
  enqueue.mockResolvedValue({ queued: true });
  deliver.mockResolvedValue({ delivered: 1, retried: 0, failed: 0 });
});

describe("linkMyDiscordId", () => {
  it("writes the numeric id to the caller's own row through the service role", async () => {
    const result = await linkMyDiscordId({ discordUserId: ` ${GOOD_ID} ` });

    expect(result.ok).toBe(true);
    expect(userUpdates).toHaveLength(0);
    expect(adminUpdates).toHaveLength(1);
    expect(adminUpdates[0].payload).toEqual({ discord_user_id: GOOD_ID });
    expect(adminUpdates[0].filters).toEqual([["profile_id", USER_ID]]);
  });

  it("rejects a username without touching the database", async () => {
    const result = await linkMyDiscordId({ discordUserId: "jamie" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Copy User ID");
    expect(adminUpdates).toHaveLength(0);
  });

  it("refuses to overwrite an id that is already valid", async () => {
    storedDiscordId = "987654321098765432";
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    expect(adminUpdates).toHaveLength(0);
  });

  it("refuses an id that another profile already holds", async () => {
    idTakenByOther = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("another account");
    expect(adminUpdates).toHaveLength(0);
  });

  it("replaces a stored value that is not a real id", async () => {
    storedDiscordId = "old-username";
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(true);
    expect(adminUpdates).toHaveLength(1);
  });

  it("requires a signed-in user", async () => {
    signedIn = false;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    expect(adminUpdates).toHaveLength(0);
  });
});

describe("sendMyDiscordTestPing", () => {
  it("refuses until an id is saved", async () => {
    const result = await sendMyDiscordTestPing();

    expect(result.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses when recognition has no Discord route", async () => {
    storedDiscordId = GOOD_ID;
    getRoute.mockResolvedValue(null);

    const result = await sendMyDiscordTestPing();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("recognition");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("queues one mention-only message keyed to the caller and drains the outbox", async () => {
    storedDiscordId = GOOD_ID;

    const result = await sendMyDiscordTestPing();

    expect(result).toEqual({ ok: true, data: { queued: true, delivered: true } });
    expect(getRoute).toHaveBeenCalledWith("recognition");
    expect(enqueue).toHaveBeenCalledTimes(1);
    const input = enqueue.mock.calls[0][0];
    expect(input.channelId).toBe("chan-1");
    expect(input.message.content).toContain(`<@${GOOD_ID}>`);
    expect(input.message.allowed_mentions).toEqual({ parse: [], users: [GOOD_ID] });
    expect(input.sourceEventId.startsWith(`discord-link-test-${USER_ID}-`)).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("stops at the daily cap without queueing", async () => {
    storedDiscordId = GOOD_ID;
    pingsToday = 3;

    const result = await sendMyDiscordTestPing();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("today");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reports a repeat instead of posting twice when the outbox already has this ping", async () => {
    storedDiscordId = GOOD_ID;
    enqueue.mockResolvedValue({ queued: false });

    const result = await sendMyDiscordTestPing();

    expect(result).toEqual({ ok: true, data: { queued: false, delivered: false } });
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("skipDiscordLinkForNow", () => {
  it("sets a cookie scoped to the caller's user id", async () => {
    const result = await skipDiscordLinkForNow();

    expect(result.ok).toBe(true);
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0] as [string, string, { httpOnly: boolean }];
    expect(name).toBe("fiq_discord_link_skip");
    expect(value).toBe(USER_ID);
    expect(options.httpOnly).toBe(true);
  });
});
