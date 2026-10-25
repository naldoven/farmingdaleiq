import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the guarantees the self-service Discord link rests on:
 *   1. `linkMyDiscordId` writes only the caller's own row, only the
 *      discord_user_id column, only a numeric id, only while the stored value is
 *      still what was read (so two saves cannot both win), refuses an id another
 *      profile holds, and fails closed when it cannot check.
 *   2. Neither save nor ping ever shows raw database or config error text.
 *   3. `linkMyDiscordId` never revalidates: a revalidation re-renders the layout,
 *      which would drop the gate before the person reaches the test ping step.
 *   4. `sendMyDiscordTestPing` refuses when recognition has no route or the daily
 *      count cannot be read, and otherwise queues one mention-only message keyed
 *      to the caller.
 *   5. `skipDiscordLinkForNow` scopes the cookie to the caller's user id.
 *
 * Supabase is mocked as a minimal chainable/thenable builder (same approach
 * as app/(app)/settings/discord/actions.test.ts); the per-request and
 * service-role clients are separate mocks so the test can assert WHICH one
 * performed the write.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
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
const OTHER_VALID_ID = "987654321098765432";
const RAW_DB_TEXT = "permission denied for table profiles_private (internal detail)";

interface Filter {
  op: "eq" | "is";
  column: string;
  value: unknown;
}
interface UpdateCall {
  table: string;
  payload: unknown;
  filters: Filter[];
}

let storedDiscordId: string | null = null;
let ownRowMissing = false;
let ownReadFails = false;
let idTakenByOther = false;
let takenCheckFails = false;
let updateRows = 1;
let updateError: { code?: string; message: string } | null = null;
let pingsToday: number | null = 0;
let countFails = false;
let signedIn = true;
let serviceClientThrows = false;
const userUpdates: UpdateCall[] = [];
const adminUpdates: UpdateCall[] = [];

function makeClient(kind: "user" | "admin", updates: UpdateCall[]) {
  const from = vi.fn((table: string) => {
    let call: UpdateCall | null = null;
    const builder: PromiseLike<unknown> & Record<string, unknown> = {
      select: () => builder,
      neq: () => builder,
      like: () => builder,
      gte: () => builder,
      limit: () => builder,
      update: (payload: unknown) => {
        call = { table, payload, filters: [] };
        updates.push(call);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call?.filters.push({ op: "eq", column, value });
        return builder;
      },
      is: (column: string, value: unknown) => {
        call?.filters.push({ op: "is", column, value });
        return builder;
      },
      // The service-role client's single-row read is the "is this id taken by
      // someone else" probe; the per-request client's is the caller's own row.
      maybeSingle: async () => {
        if (kind === "admin") {
          return {
            data: idTakenByOther ? { profile_id: "other-user" } : null,
            error: takenCheckFails ? { message: RAW_DB_TEXT } : null,
          };
        }
        if (ownReadFails) return { data: null, error: { message: RAW_DB_TEXT } };
        return {
          data: ownRowMissing ? null : { discord_user_id: storedDiscordId },
          error: null,
        };
      },
      // Awaiting the builder directly is either an update (with .select() it
      // returns the matched rows) or the head-count query (daily ping cap).
      then(onFulfilled, onRejected) {
        const result = call
          ? {
              data: updateError
                ? null
                : Array.from({ length: updateRows }, () => ({ profile_id: USER_ID })),
              error: updateError,
            }
          : {
              data: null,
              error: countFails ? { message: RAW_DB_TEXT } : null,
              count: countFails ? null : pingsToday,
            };
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  });
  return {
    from,
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: USER_ID } : null } }),
    },
  };
}

const userClient = makeClient("user", userUpdates);
const adminClient = makeClient("admin", adminUpdates);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => userClient,
  createServiceRoleClient: () => {
    if (serviceClientThrows) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return adminClient;
  },
}));

import { DISCORD_ID_TAKEN_MESSAGE } from "@/lib/discord/id-conflict";
import { linkMyDiscordId, sendMyDiscordTestPing, skipDiscordLinkForNow } from "./actions";

beforeEach(() => {
  storedDiscordId = null;
  ownRowMissing = false;
  ownReadFails = false;
  idTakenByOther = false;
  takenCheckFails = false;
  updateRows = 1;
  updateError = null;
  pingsToday = 0;
  countFails = false;
  signedIn = true;
  serviceClientThrows = false;
  userUpdates.length = 0;
  adminUpdates.length = 0;
  vi.clearAllMocks();
  getRoute.mockResolvedValue({ channelId: "chan-1", webhookUrl: "https://discord.com/api/webhooks/x" });
  enqueue.mockResolvedValue({ queued: true });
  deliver.mockResolvedValue({ delivered: 1, retried: 0, failed: 0 });
});

function expectPlainError(result: { ok: boolean; error?: string }) {
  expect(result.ok).toBe(false);
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain("internal detail");
  expect(result.error).not.toContain("permission denied");
  expect(result.error).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
}

describe("linkMyDiscordId", () => {
  it("writes only discord_user_id, to the caller's own row, through the service role", async () => {
    const result = await linkMyDiscordId({ discordUserId: ` ${GOOD_ID} ` });

    expect(result.ok).toBe(true);
    expect(userUpdates).toHaveLength(0);
    expect(adminUpdates).toHaveLength(1);
    expect(adminUpdates[0].table).toBe("profiles_private");
    expect(adminUpdates[0].payload).toEqual({ discord_user_id: GOOD_ID });
    const ownRowFilters = adminUpdates[0].filters.filter((f) => f.column === "profile_id");
    expect(ownRowFilters).toEqual([{ op: "eq", column: "profile_id", value: USER_ID }]);
  });

  it("only updates while the stored id is still null", async () => {
    await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(adminUpdates[0].filters).toContainEqual({
      op: "is",
      column: "discord_user_id",
      value: null,
    });
  });

  it("never revalidates, so the layout keeps the gate up for the ping step", async () => {
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a username without touching the database", async () => {
    const result = await linkMyDiscordId({ discordUserId: "jamie" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Copy User ID");
    expect(adminUpdates).toHaveLength(0);
    expect(adminClient.from).not.toHaveBeenCalled();
  });

  it("rejects a number that is too short to be a Discord id", async () => {
    const result = await linkMyDiscordId({ discordUserId: "12345" });

    expect(result.ok).toBe(false);
    expect(adminUpdates).toHaveLength(0);
  });

  it("refuses to replace a different id that is already valid", async () => {
    storedDiscordId = OTHER_VALID_ID;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    expect(adminUpdates).toHaveLength(0);
  });

  it("treats saving the id that is already stored as success without writing again", async () => {
    storedDiscordId = GOOD_ID;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(true);
    expect(adminUpdates).toHaveLength(0);
  });

  it("replaces a stored value that is not a real id, only while it is still that value", async () => {
    storedDiscordId = "old-username";
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(true);
    expect(adminUpdates).toHaveLength(1);
    expect(adminUpdates[0].filters).toContainEqual({
      op: "eq",
      column: "discord_user_id",
      value: "old-username",
    });
  });

  it("refuses an id that another profile already holds", async () => {
    idTakenByOther = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result).toEqual({ ok: false, error: DISCORD_ID_TAKEN_MESSAGE });
    expect(adminUpdates).toHaveLength(0);
  });

  it("fails closed when the duplicate check itself errors", async () => {
    takenCheckFails = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expectPlainError(result);
    expect(adminUpdates).toHaveLength(0);
  });

  it("refuses when a racing save already changed the row (conditional update matched nothing)", async () => {
    updateRows = 0;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("changed while saving");
  });

  it("maps a unique-index violation (SQLSTATE 23505) to the plain taken message", async () => {
    updateError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "profiles_private_discord_user_id_uq"',
    };
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result).toEqual({ ok: false, error: DISCORD_ID_TAKEN_MESSAGE });
  });

  it("shows a plain message, not database text, when the write fails", async () => {
    updateError = { code: "42501", message: RAW_DB_TEXT };
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expectPlainError(result);
  });

  it("shows a plain message, not database text, when reading the caller's row fails", async () => {
    ownReadFails = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expectPlainError(result);
    expect(adminUpdates).toHaveLength(0);
  });

  it("shows a plain message, not config text, when the service client cannot be built", async () => {
    serviceClientThrows = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expectPlainError(result);
  });

  it("says so when the profile row does not exist", async () => {
    ownRowMissing = true;
    const result = await linkMyDiscordId({ discordUserId: GOOD_ID });

    expect(result.ok).toBe(false);
    expect(adminUpdates).toHaveLength(0);
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

  it("shows a plain message when reading the caller's row fails", async () => {
    ownReadFails = true;
    const result = await sendMyDiscordTestPing();

    expectPlainError(result);
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

  it("still allows a ping just under the daily cap", async () => {
    storedDiscordId = GOOD_ID;
    pingsToday = 2;

    const result = await sendMyDiscordTestPing();

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
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

  it("refuses, instead of allowing, when the daily count query fails", async () => {
    storedDiscordId = GOOD_ID;
    countFails = true;

    const result = await sendMyDiscordTestPing();

    expectPlainError(result);
    expect(enqueue).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("refuses when the count comes back empty", async () => {
    storedDiscordId = GOOD_ID;
    pingsToday = null;

    const result = await sendMyDiscordTestPing();

    expect(result.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("shows a plain message when the outbox throws", async () => {
    storedDiscordId = GOOD_ID;
    enqueue.mockRejectedValue(new Error(RAW_DB_TEXT));

    const result = await sendMyDiscordTestPing();

    expectPlainError(result);
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
