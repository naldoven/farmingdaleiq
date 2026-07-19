import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RAT2: replaceCurrentRating must be honest about a lost-update race. The rate
 * write is "flip old is_current=false, then insert the new current row"; a
 * concurrent duplicate loses the DB partial-unique index race (Postgres 23505).
 * The old code caught the 23505 and returned a bare ok with NO read-back, so a
 * losing rater saw success while their value was silently discarded. These
 * tests pin the fixed behavior: on 23505 it reads the now-current row back and
 * returns THAT value, and the identical-payload double-submit still succeeds.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { replaceCurrentRating } from "./actions";

const UNIQUE_VIOLATION = "23505";

type Result = { data?: unknown; error?: unknown };

/**
 * Minimal position_ratings client stand-in. The action makes three shapes of
 * call and each terminal method maps to one:
 *   - update(...).eq().eq().eq()            (the is_current flip)  -> awaited
 *   - insert(...).select(...).single()      (the new current row)  -> single()
 *   - select(...).eq()...maybeSingle()      (the read-back)        -> maybeSingle()
 *   - update(...).eq().eq().is()            (resolve rerate)       -> awaited
 */
function makeSupabase(opts: { insert: Result; readback?: Result }) {
  const single = vi.fn(async () => opts.insert);
  const maybeSingle = vi.fn(async () => opts.readback ?? { data: null, error: null });
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.update = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.is = vi.fn(chain);
  builder.single = single;
  builder.maybeSingle = maybeSingle;
  // Awaiting an update chain (flip / resolve-rerate) resolves to no error.
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);

  return {
    client: { from: vi.fn(() => builder) } as never,
    single,
    maybeSingle,
  };
}

const PARAMS = {
  userId: "11111111-1111-4111-8111-111111111111",
  positionId: "22222222-2222-4222-8222-222222222222",
  categoryScores: null,
  ratedBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("replaceCurrentRating", () => {
  it("returns the freshly written value on the normal (no-conflict) path", async () => {
    const { client } = makeSupabase({
      insert: { data: { stars: 4, comment: "Solid" }, error: null },
    });

    const result = await replaceCurrentRating(client, { ...PARAMS, stars: 4, comment: "Solid" });

    expect(result).toEqual({ ok: true, data: { stars: 4, comment: "Solid" } });
  });

  it("on a 23505 race, reads back and returns the ACTUAL current value, not the discarded one", async () => {
    // This rater attempted 1.0 but lost the race; the winner's 5.0 is current.
    const { client, maybeSingle } = makeSupabase({
      insert: { data: null, error: { code: UNIQUE_VIOLATION, message: "duplicate key" } },
      readback: { data: { stars: 5, comment: "Great" }, error: null },
    });

    const result = await replaceCurrentRating(client, { ...PARAMS, stars: 1, comment: "Weak" });

    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: { stars: 5, comment: "Great" } });
  });

  it("treats an identical-payload double-submit as success (idempotent)", async () => {
    const { client } = makeSupabase({
      insert: { data: null, error: { code: UNIQUE_VIOLATION, message: "duplicate key" } },
      readback: { data: { stars: 4, comment: "Same note" }, error: null },
    });

    const result = await replaceCurrentRating(client, { ...PARAMS, stars: 4, comment: "Same note" });

    expect(result).toEqual({ ok: true, data: { stars: 4, comment: "Same note" } });
  });

  it("fails honestly (not a false ok) if a 23505 leaves no current row to read back", async () => {
    const { client } = makeSupabase({
      insert: { data: null, error: { code: UNIQUE_VIOLATION, message: "duplicate key" } },
      readback: { data: null, error: null },
    });

    const result = await replaceCurrentRating(client, { ...PARAMS, stars: 3, comment: "" });

    expect(result.ok).toBe(false);
  });

  it("surfaces a non-unique insert error instead of swallowing it", async () => {
    const { client } = makeSupabase({
      insert: { data: null, error: { code: "23503", message: "fk violation" } },
    });

    const result = await replaceCurrentRating(client, { ...PARAMS, stars: 3, comment: "" });

    expect(result).toEqual({ ok: false, error: "fk violation" });
  });
});
