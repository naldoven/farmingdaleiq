import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DIGEST_STORE_HOUR, queueTomorrowDigest } from "./digest";

type QueryResponse = { data: unknown; error: { message: string } | null };
type Filters = Array<[string, unknown]>;

/** What the claim compare-and-set returns: one row means this run won. */
let claimResponse: QueryResponse;
/** The job_cursors row's last_event_at before this run. */
let previousCursor: string | null;
let ordersResponse: QueryResponse;
let callsResponse: QueryResponse;
let eventInsertResponse: { error: { message: string } | null };
let touchedTables: string[];
let cursorReads: number;
let upserts: Array<{ values: Record<string, unknown>; options: unknown }>;
let updates: Array<{ values: Record<string, unknown>; filters: Filters }>;
let events: Array<Record<string, unknown>>;

function thenable(response: () => unknown, query: Record<string, unknown>) {
  query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response()).then(resolve, reject);
  return query;
}

function createFakeAdmin() {
  return {
    from(table: string) {
      touchedTables.push(table);

      if (table === "job_cursors") {
        return {
          upsert: (values: Record<string, unknown>, options: unknown) => {
            upserts.push({ values, options });
            return Promise.resolve({ error: null });
          },
          select: () => {
            const query: Record<string, unknown> = {};
            query.eq = () => query;
            query.maybeSingle = () => {
              cursorReads += 1;
              return Promise.resolve({ data: { last_event_at: previousCursor }, error: null });
            };
            return query;
          },
          update: (values: Record<string, unknown>) => {
            const filters: Filters = [];
            updates.push({ values, filters });
            const query: Record<string, unknown> = {};
            query.eq = (column: string, value: unknown) => {
              filters.push([column, value]);
              return query;
            };
            query.or = (expression: string) => {
              filters.push(["or", expression]);
              return query;
            };
            // The claim ends in .select(); the release is awaited directly.
            query.select = () => Promise.resolve(claimResponse);
            return thenable(() => ({ error: null }), query);
          },
        };
      }

      if (table === "catering_orders") {
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.neq = () => query;
        return thenable(() => ordersResponse, query);
      }

      if (table === "catering_checklist_items") {
        const query: Record<string, unknown> = {};
        query.select = () => query;
        query.in = () => query;
        query.eq = () => query;
        return thenable(() => callsResponse, query);
      }

      if (table === "app_events") {
        return {
          insert: (values: Record<string, unknown>) => {
            events.push(values);
            return Promise.resolve(eventInsertResponse);
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

// The fake only implements the calls the digest makes.
const supabase = () => createFakeAdmin() as unknown as Parameters<typeof queueTomorrowDigest>[0];

// 2026-10-25 is a Sunday in EDT (UTC-4), so tomorrow is Monday 2026-10-26.
const SIX_OH_FIVE_PM = new Date("2026-10-25T22:05:00.000Z");
const FIVE_FIFTY_NINE_PM = new Date("2026-10-25T21:59:00.000Z");

beforeEach(() => {
  claimResponse = { data: [{ job_name: "catering-tomorrow-digest" }], error: null };
  previousCursor = "2026-10-24T22:05:00.000Z";
  ordersResponse = {
    data: [
      { id: "o1", guest_name: "Pat Lee", event_time: "11:30:00", headcount: 25, fulfillment: "delivery", stage: "setup" },
      { id: "o2", guest_name: "Sam Roe", event_time: "13:00:00", headcount: 12, fulfillment: "pickup", stage: "confirm" },
    ],
    error: null,
  };
  callsResponse = {
    data: [
      { order_id: "o1", done: true },
      { order_id: "o1", done: true },
      { order_id: "o2", done: true },
      { order_id: "o2", done: false },
    ],
    error: null,
  };
  eventInsertResponse = { error: null };
  touchedTables = [];
  cursorReads = 0;
  upserts = [];
  updates = [];
  events = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("queueTomorrowDigest", () => {
  it("posts from 6 PM store time", () => {
    expect(DIGEST_STORE_HOUR).toBe(18);
  });

  it("touches nothing before 6 PM store time", async () => {
    vi.setSystemTime(FIVE_FIFTY_NINE_PM);
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "too_early" });
    expect(touchedTables).toEqual([]);
    expect(events).toEqual([]);
  });

  it("claims the evening, then queues exactly one digest event", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "queued" });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].values.job_name).toBe("catering-tomorrow-digest");
    expect(upserts[0].options).toEqual({ onConflict: "job_name", ignoreDuplicates: true });

    // One update: the claim. Store midnight on 10-25 is 04:00Z (EDT).
    expect(updates).toHaveLength(1);
    expect(updates[0].values.last_event_at).toBe("2026-10-25T22:05:00.000Z");
    expect(updates[0].filters).toContainEqual(["job_name", "catering-tomorrow-digest"]);
    expect(updates[0].filters).toContainEqual([
      "or",
      "last_event_at.is.null,last_event_at.lt.2026-10-25T04:00:00.000Z",
    ]);

    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(events[0].event_key).toBe("catering_tomorrow_digest");
    expect(payload.digestDate).toBe("2026-10-26");
    expect(payload.orderCount).toBe(2);
    expect(payload.callsOutstanding).toBe(1);
    expect(payload.title).toBe("Tomorrow's catering");

    const lines = String(payload.message).split(String.fromCharCode(10));
    const pat = lines.find((line) => line.includes("Pat Lee"));
    const sam = lines.find((line) => line.includes("Sam Roe"));
    expect(pat).toBeDefined();
    expect(pat).not.toContain("CALL NOT DONE");
    expect(sam).toContain("CALL NOT DONE");
    expect(lines[0]).toBe("Mon, Oct 26: 2 orders, 1 still needs a confirmation call");
  });

  it("counts an order with no Confirmation Call rows as not called", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    callsResponse = { data: [{ order_id: "o1", done: true }], error: null };
    await queueTomorrowDigest(supabase(), new Date());
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.callsOutstanding).toBe(1);
    expect(String(payload.message)).toContain("Sam Roe");
  });

  it("posts the no-orders line without reading checklist rows", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    ordersResponse = { data: [], error: null };
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "queued" });
    expect(touchedTables).not.toContain("catering_checklist_items");
    expect((events[0].payload as Record<string, unknown>).message).toBe("Mon, Oct 26: no catering orders.");
  });

  it("stops after one read when the cursor is already stamped today", async () => {
    vi.setSystemTime(new Date("2026-10-25T23:30:00.000Z"));
    previousCursor = "2026-10-25T22:05:00.000Z";
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "already_sent" });
    expect(cursorReads).toBe(1);
    expect(touchedTables).toEqual(["job_cursors"]);
    expect(upserts).toEqual([]);
    expect(updates).toEqual([]);
    expect(events).toEqual([]);
  });

  it("returns already_sent and writes nothing when another run won the claim", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    claimResponse = { data: [], error: null };
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "already_sent" });
    expect(events).toEqual([]);
    expect(touchedTables).not.toContain("catering_orders");
    // Only the claim attempt; no release, since this run holds nothing.
    expect(updates).toHaveLength(1);
  });

  it("restores only its own claim when the event insert fails", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    eventInsertResponse = { error: { message: "insert failed" } };
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "error", error: "insert failed" });

    expect(updates).toHaveLength(2);
    const release = updates[1];
    expect(release.values.last_event_at).toBe(previousCursor);
    expect(release.filters).toContainEqual(["job_name", "catering-tomorrow-digest"]);
    expect(release.filters).toContainEqual(["last_event_at", "2026-10-25T22:05:00.000Z"]);
  });

  it("releases the claim when tomorrow's orders cannot be read", async () => {
    vi.setSystemTime(SIX_OH_FIVE_PM);
    ordersResponse = { data: null, error: { message: "read failed" } };
    const result = await queueTomorrowDigest(supabase(), new Date());
    expect(result).toEqual({ status: "error", error: "read failed" });
    expect(updates).toHaveLength(2);
    expect(updates[1].values.last_event_at).toBe(previousCursor);
    expect(events).toEqual([]);
  });
});
