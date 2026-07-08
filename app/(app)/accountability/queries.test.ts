import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { fetchMyInfractions } from "./queries";

/**
 * Fills the "no test coverage for actions, queries, or cron" gap in
 * docs/KITCHENIQ-PARITY-AUDIT.md. Confirms fetchMyInfractions reads through
 * the anonymity-enforcing `my_infractions` view (never the base `infractions`
 * table) and surfaces query errors instead of throwing.
 */
function fakeSupabase(response: { data: unknown; error: { message: string } | null }) {
  let calledTable: string | null = null;
  const builder = {
    select: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  const client = {
    from: (table: string) => {
      calledTable = table;
      return builder;
    },
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    getCalledTable: () => calledTable,
  };
}

describe("fetchMyInfractions", () => {
  it("reads from the my_infractions view, not the base infractions table", async () => {
    const row = {
      id: "infraction-1",
      user_id: "user-1",
      type_id: "type-1",
      type_name: "Late to Shift",
      points: 4,
      note: null,
      issued_at: "2026-06-01T00:00:00.000Z",
      expires_at: "2026-07-31T00:00:00.000Z",
    };
    const { client, getCalledTable } = fakeSupabase({ data: [row], error: null });

    const result = await fetchMyInfractions(client);

    expect(getCalledTable()).toBe("my_infractions");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([row]);
  });

  it("surfaces a query error instead of throwing", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });

    const result = await fetchMyInfractions(client);

    expect(result.error).toBe("boom");
    expect(result.data).toEqual([]);
  });

  it("defaults to an empty array when the view returns no rows", async () => {
    const { client } = fakeSupabase({ data: null, error: null });

    const result = await fetchMyInfractions(client);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
});
