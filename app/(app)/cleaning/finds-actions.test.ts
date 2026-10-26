import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard-first coverage for the found-and-fixed planner actions. The
 * invariants that matter: a caller without planning rights never reaches a
 * table, a double tap makes one item, and a failed photo copy never costs the
 * planner the item they just approved.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import { convertFind, deleteFind } from "@/app/(app)/cleaning/finds-actions";
import type { ItemDetailsInput } from "@/app/(app)/cleaning/validation";
import { createClient } from "@/lib/supabase/server";

const mockCreateClient = vi.mocked(createClient);
const mockRevalidate = vi.mocked(revalidatePath);

const USER_ID = "22222222-2222-4222-8222-222222222222";
const FIND_ID = "44444444-4444-4444-8444-444444444444";
const ZONE_ID = "33333333-3333-4333-8333-333333333333";
const DENIED = { ok: false, error: "You don't have permission to do this." };
const POSTED_AT = "2026-10-26T19:42:00Z";

const DETAILS: ItemDetailsInput = {
  zoneId: ZONE_ID,
  name: "Grease behind the fryer",
  kind: "variable",
  intervalWeeks: 4,
  half: "pm",
  ifNeeded: false,
  note: "",
};

type Result = { data?: unknown; error?: { message: string; code?: string } | null };
type Op = "select" | "insert" | "update" | "delete";

interface Recorded {
  table: string;
  op: Op;
  payload?: unknown;
  filters: [string, unknown[]][];
}

/**
 * Chainable stand-in for the supabase-js builder. Responses are keyed
 * "table.op"; anything not listed answers { data: null, error: null }. Every
 * call is recorded so tests can check what was written and how it was filtered.
 */
function makeClient(options: {
  canPlan: boolean;
  responses?: Record<string, Result>;
  copy?: (from: string, to: string) => Promise<{ error: { message: string } | null }>;
}) {
  const recorded: Recorded[] = [];
  const from = vi.fn((table: string) => {
    const entry: Recorded = { table, op: "select", filters: [] };
    recorded.push(entry);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "insert", "update", "delete", "eq", "is", "limit"]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        if (method === "insert" || method === "update" || method === "delete") {
          entry.op = method;
          entry.payload = args[0];
        } else if (method === "eq" || method === "is") {
          entry.filters.push([method, args]);
        }
        return builder;
      });
    }
    const answer = () => options.responses?.[`${table}.${entry.op}`] ?? { data: null, error: null };
    builder.maybeSingle = vi.fn(async () => answer());
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(answer()).then(resolve, reject);
    return builder;
  });
  const copyImpl: NonNullable<typeof options.copy> = options.copy ?? (async () => ({ error: null }));
  const copy = vi.fn(copyImpl);
  const client = {
    rpc: vi.fn(async () => ({ data: options.canPlan, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
    storage: { from: vi.fn(() => ({ copy })) },
    from,
  };
  const writes = (table: string, op: Op) => recorded.filter((r) => r.table === table && r.op === op);
  return { client, from, copy, recorded, writes };
}

function useClient(options: Parameters<typeof makeClient>[0]) {
  const made = makeClient(options);
  mockCreateClient.mockResolvedValue(made.client as never);
  return made;
}

const STORE = { "stores.select": { data: { timezone: "America/New_York" }, error: null } };

const OPEN_FIND = {
  "cleaning_atd_finds.select": {
    data: { id: FIND_ID, photo_path: `finds/${FIND_ID}.jpg`, posted_at: POSTED_AT, converted_item_id: null },
    error: null,
  },
};

const CLAIMED = { "cleaning_atd_finds.update": { data: [{ id: FIND_ID }], error: null } };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("planner-only actions", () => {
  it("refuse a caller without planning rights and never touch a table", async () => {
    const { from, copy } = useClient({ canPlan: false });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual(DENIED);
    expect(await deleteFind({ id: FIND_ID })).toEqual(DENIED);
    expect(from).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("convertFind", () => {
  it("makes an approved item from the details, links the find, and copies the photo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 01:30Z on Oct 27 is 9:30 PM on Oct 26 in the store, so the start date
    // must be the 26th, not the server's 27th.
    vi.setSystemTime(new Date("2026-10-27T01:30:00Z"));
    const { writes, copy } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, ...CLAIMED },
    });

    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });

    const [item] = writes("cleaning_items", "insert");
    const row = item!.payload as Record<string, unknown>;
    expect(row).toMatchObject({
      zone_id: ZONE_ID,
      name: "Grease behind the fryer",
      kind: "variable",
      interval_weeks: 4,
      days_of_week: null,
      half: "pm",
      if_needed: false,
      note: null,
      status: "active",
      approved_by: USER_ID,
      start_on: "2026-10-26",
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(row.approved_at as string)).not.toBeNaN();

    const [claim] = writes("cleaning_atd_finds", "update");
    expect(claim!.payload).toEqual({ converted_item_id: row.id });
    expect(claim!.filters).toEqual([
      ["eq", ["id", FIND_ID]],
      ["is", ["converted_item_id", null]],
    ]);

    const [photo] = writes("cleaning_item_photos", "insert");
    const photoRow = photo!.payload as Record<string, unknown>;
    expect(photoRow).toMatchObject({
      item_id: row.id,
      capture_source: "live",
      captured_at: POSTED_AT,
    });
    expect(photoRow.storage_path).toBe(`items/${photoRow.id}.jpg`);
    expect(copy).toHaveBeenCalledWith(`finds/${FIND_ID}.jpg`, photoRow.storage_path);

    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/finds");
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/items");
  });

  it("keeps the photo's extension for the copy", async () => {
    const { copy } = useClient({
      canPlan: true,
      responses: {
        ...STORE,
        ...CLAIMED,
        "cleaning_atd_finds.select": {
          data: { id: FIND_ID, photo_path: `finds/${FIND_ID}.webp`, posted_at: POSTED_AT, converted_item_id: null },
          error: null,
        },
      },
    });
    await convertFind({ findId: FIND_ID, details: DETAILS });
    expect(copy.mock.calls[0]![1]).toMatch(/^items\/[0-9a-f-]{36}\.webp$/);
  });

  it("answers ok without a second item when the find is already on the master list", async () => {
    const { writes, copy } = useClient({
      canPlan: true,
      responses: {
        "cleaning_atd_finds.select": {
          data: { id: FIND_ID, photo_path: `finds/${FIND_ID}.jpg`, posted_at: POSTED_AT, converted_item_id: "item-1" },
          error: null,
        },
      },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });
    expect(writes("cleaning_items", "insert")).toHaveLength(0);
    expect(writes("cleaning_atd_finds", "update")).toHaveLength(0);
    expect(copy).not.toHaveBeenCalled();
  });

  it("says so when the find is gone", async () => {
    const { writes } = useClient({ canPlan: true, responses: { "cleaning_atd_finds.select": { data: null, error: null } } });
    const result = await convertFind({ findId: FIND_ID, details: DETAILS });
    expect(result).toEqual({ ok: false, error: "That find was not found. It may have been deleted." });
    expect(writes("cleaning_items", "insert")).toHaveLength(0);
  });

  it("rejects bad details with the form's own message and writes nothing", async () => {
    const { from } = useClient({ canPlan: true });
    const result = await convertFind({
      findId: FIND_ID,
      details: { ...DETAILS, kind: "constant", half: "am", daysOfWeek: [] },
    });
    expect(result).toEqual({ ok: false, error: "Pick at least one day" });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a find id that is not a uuid", async () => {
    const { from } = useClient({ canPlan: true });
    const result = await convertFind({ findId: "../../x", details: DETAILS });
    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("stops when the item cannot be saved: no link, no photo", async () => {
    const { writes, copy } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, "cleaning_items.insert": { error: { message: "new row violates check" } } },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: false, error: "new row violates check" });
    expect(writes("cleaning_atd_finds", "update")).toHaveLength(0);
    expect(copy).not.toHaveBeenCalled();
  });

  it("takes its item back when another tap claimed the find first", async () => {
    const { writes, copy } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, "cleaning_atd_finds.update": { data: [], error: null } },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });

    const made = (writes("cleaning_items", "insert")[0]!.payload as { id: string }).id;
    const [removed] = writes("cleaning_items", "delete");
    expect(removed!.filters).toEqual([["eq", ["id", made]]]);
    expect(copy).not.toHaveBeenCalled();
    expect(writes("cleaning_item_photos", "insert")).toHaveLength(0);
  });

  it("takes its item back and reports the error when the link fails", async () => {
    const { writes, copy } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, "cleaning_atd_finds.update": { data: null, error: { message: "link failed" } } },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: false, error: "link failed" });
    expect(writes("cleaning_items", "delete")).toHaveLength(1);
    expect(copy).not.toHaveBeenCalled();
  });

  it("keeps the item when the photo copy fails", async () => {
    const { writes } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, ...CLAIMED },
      copy: async () => ({ error: { message: "storage down" } }),
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });
    expect(writes("cleaning_items", "delete")).toHaveLength(0);
    expect(writes("cleaning_item_photos", "insert")).toHaveLength(0);
  });

  it("keeps the item when the copy throws", async () => {
    useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, ...CLAIMED },
      copy: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });
  });

  it("keeps the item when the photo row cannot be saved", async () => {
    const { writes } = useClient({
      canPlan: true,
      responses: { ...STORE, ...OPEN_FIND, ...CLAIMED, "cleaning_item_photos.insert": { error: { message: "rls" } } },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });
    expect(writes("cleaning_items", "delete")).toHaveLength(0);
  });

  it("skips the photo when the stored path is not a find path", async () => {
    const { copy } = useClient({
      canPlan: true,
      responses: {
        ...STORE,
        ...CLAIMED,
        "cleaning_atd_finds.select": {
          data: { id: FIND_ID, photo_path: "done/elsewhere.jpg", posted_at: POSTED_AT, converted_item_id: null },
          error: null,
        },
      },
    });
    expect(await convertFind({ findId: FIND_ID, details: DETAILS })).toEqual({ ok: true, data: undefined });
    expect(copy).not.toHaveBeenCalled();
  });
});

describe("deleteFind", () => {
  it("deletes an unconverted find by id and refreshes the log", async () => {
    const { writes } = useClient({
      canPlan: true,
      responses: { "cleaning_atd_finds.delete": { data: [{ id: FIND_ID }], error: null } },
    });
    expect(await deleteFind({ id: FIND_ID })).toEqual({ ok: true, data: undefined });
    const [removed] = writes("cleaning_atd_finds", "delete");
    expect(removed!.filters).toEqual([
      ["eq", ["id", FIND_ID]],
      ["is", ["converted_item_id", null]],
    ]);
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/finds");
  });

  it("keeps a find that is already on the master list", async () => {
    useClient({
      canPlan: true,
      responses: {
        "cleaning_atd_finds.delete": { data: [], error: null },
        "cleaning_atd_finds.select": { data: { id: FIND_ID }, error: null },
      },
    });
    expect(await deleteFind({ id: FIND_ID })).toEqual({
      ok: false,
      error: "That find is on the master list, so it stays in the log.",
    });
  });

  it("treats a find already gone as deleted (double tap)", async () => {
    useClient({ canPlan: true, responses: { "cleaning_atd_finds.delete": { data: [], error: null } } });
    expect(await deleteFind({ id: FIND_ID })).toEqual({ ok: true, data: undefined });
  });

  it("rejects an id that is not a uuid before any delete", async () => {
    const { writes } = useClient({ canPlan: true });
    expect((await deleteFind({ id: "nope" })).ok).toBe(false);
    expect(writes("cleaning_atd_finds", "delete")).toHaveLength(0);
  });

  it("reports a database refusal", async () => {
    useClient({ canPlan: true, responses: { "cleaning_atd_finds.delete": { error: { message: "rls" } } } });
    expect(await deleteFind({ id: FIND_ID })).toEqual({ ok: false, error: "rls" });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});
