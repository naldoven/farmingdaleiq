import { describe, expect, it, vi } from "vitest";

import { countPositionHistory, deleteGuard } from "@/app/(app)/settings/positions/delete-guard";

/**
 * The delete guard reads four tables before a position or group is deleted
 * (see delete-guard.ts). The Supabase client is faked as a thenable query
 * builder keyed by table, so each case states which table holds what.
 */

interface FakeResponse {
  data?: unknown;
  count?: number | null;
  error?: { message: string } | null;
}

function fakeSupabase(responses: Record<string, FakeResponse>) {
  const inCalls: { table: string; column: string; values: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const builder: PromiseLike<FakeResponse> & Record<string, unknown> = {
      select: () => builder,
      in: (column: string, values: unknown[]) => {
        inCalls.push({ table, column, values });
        return builder;
      },
      then(onFulfilled, onRejected) {
        const response = responses[table] ?? { data: [], count: 0, error: null };
        return Promise.resolve({ error: null, ...response }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  });
  // The guard only needs from(); the cast keeps the fake small.
  return { client: { from } as never, from, inCalls };
}

const POSITION_IDS = ["p1", "p2"];

describe("countPositionHistory", () => {
  it("returns zeros without touching the database when there are no positions", async () => {
    const { client, from } = fakeSupabase({});
    await expect(countPositionHistory(client, [])).resolves.toEqual({
      ok: true,
      history: { ratings: 0, enrollments: 0, itemRecords: 0 },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("counts ratings, enrollments on the position's passport, and item records", async () => {
    const { client, inCalls } = fakeSupabase({
      position_ratings: { count: 4 },
      passports: { data: [{ id: "pass1" }] },
      passport_enrollments: { count: 2 },
      passport_item_progress: { count: 9 },
    });

    await expect(countPositionHistory(client, POSITION_IDS)).resolves.toEqual({
      ok: true,
      history: { ratings: 4, enrollments: 2, itemRecords: 9 },
    });
    expect(inCalls).toEqual([
      { table: "position_ratings", column: "position_id", values: POSITION_IDS },
      { table: "passports", column: "position_id", values: POSITION_IDS },
      { table: "passport_enrollments", column: "passport_id", values: ["pass1"] },
      { table: "passport_item_progress", column: "passport_enrollments.passport_id", values: ["pass1"] },
    ]);
  });

  it("skips the passport tables when the positions have no passport", async () => {
    const { client, from } = fakeSupabase({ position_ratings: { count: 3 }, passports: { data: [] } });

    await expect(countPositionHistory(client, POSITION_IDS)).resolves.toEqual({
      ok: true,
      history: { ratings: 3, enrollments: 0, itemRecords: 0 },
    });
    const tables = from.mock.calls.map((call) => call[0]);
    expect(tables).not.toContain("passport_enrollments");
    expect(tables).not.toContain("passport_item_progress");
  });

  it.each(["position_ratings", "passports", "passport_enrollments", "passport_item_progress"])(
    "fails closed when the %s read fails",
    async (failing) => {
      const { client } = fakeSupabase({
        position_ratings: { count: 0 },
        passports: { data: [{ id: "pass1" }] },
        passport_enrollments: { count: 0 },
        passport_item_progress: { count: 0 },
        [failing]: { error: { message: "boom" }, count: null, data: null },
      });
      const result = await countPositionHistory(client, POSITION_IDS);
      expect(result.ok).toBe(false);
    },
  );

  it("fails closed when a count comes back null instead of a number", async () => {
    const { client } = fakeSupabase({ position_ratings: { count: null } });
    const result = await countPositionHistory(client, POSITION_IDS);
    expect(result.ok).toBe(false);
  });
});

describe("deleteGuard", () => {
  it("refuses a position that has ratings, naming what exists", async () => {
    const { client } = fakeSupabase({ position_ratings: { count: 12 }, passports: { data: [] } });
    const message = await deleteGuard(client, { kind: "position", name: "Register 1" }, ["p1"]);
    expect(message).toContain('"Register 1"');
    expect(message).toContain("12 ratings");
    expect(message).toContain("Ratings matrix");
  });

  it("refuses a position whose only history is passport enrollments or item records", async () => {
    const enrolled = fakeSupabase({
      position_ratings: { count: 0 },
      passports: { data: [{ id: "pass1" }] },
      passport_enrollments: { count: 1 },
      passport_item_progress: { count: 0 },
    });
    expect(await deleteGuard(enrolled.client, { kind: "position", name: "Breading" }, ["p1"])).toContain(
      "1 trainee passport enrollment",
    );

    const stamped = fakeSupabase({
      position_ratings: { count: 0 },
      passports: { data: [{ id: "pass1" }] },
      passport_enrollments: { count: 0 },
      passport_item_progress: { count: 5 },
    });
    expect(await deleteGuard(stamped.client, { kind: "position", name: "Breading" }, ["p1"])).toContain(
      "5 passport item records",
    );
  });

  it("allows a position with no history", async () => {
    const { client } = fakeSupabase({
      position_ratings: { count: 0 },
      passports: { data: [{ id: "pass1" }] },
      passport_enrollments: { count: 0 },
      passport_item_progress: { count: 0 },
    });
    expect(await deleteGuard(client, { kind: "position", name: "Curbside" }, ["p1"])).toBeNull();
  });

  it("refuses a group when any of its positions has history", async () => {
    const { client } = fakeSupabase({
      position_ratings: { count: 0 },
      passports: { data: [{ id: "pass1" }, { id: "pass2" }] },
      passport_enrollments: { count: 0 },
      passport_item_progress: { count: 3 },
    });
    const message = await deleteGuard(client, { kind: "group", name: "Kitchen" }, POSITION_IDS);
    expect(message).toContain('group "Kitchen"');
    expect(message).toContain("3 passport item records");
  });

  it("allows an empty group", async () => {
    const { client } = fakeSupabase({});
    expect(await deleteGuard(client, { kind: "group", name: "Empty" }, [])).toBeNull();
  });

  it("returns the lookup error as the refusal, so a failed check never becomes a delete", async () => {
    const { client } = fakeSupabase({ position_ratings: { error: { message: "boom" }, count: null } });
    const message = await deleteGuard(client, { kind: "position", name: "Register 1" }, ["p1"]);
    expect(message).toContain("nothing was deleted");
  });
});
