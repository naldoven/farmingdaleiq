import { describe, expect, it } from "vitest";

import {
  buildRolloutRows,
  compareEmailList,
  formatLastSeen,
  summarizeRollout,
  type RolloutRow,
} from "./logic";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("buildRolloutRows", () => {
  const base = {
    profiles: [
      { id: B, name: "Zed Person", role_id: "r1", active: true },
      { id: A, name: "Amy Person", role_id: null, active: true },
      { id: C, name: "Moe Person", role_id: "missing", active: false },
    ],
    roleNameById: new Map([["r1", "Shift Leader"]]),
    privateRows: [
      { profile_id: A, discord_user_id: "123456789012345678" },
      { profile_id: B, discord_user_id: "zed_username" },
    ],
    pushUserIds: [A, A, C],
    authUsers: [
      { id: A, last_sign_in_at: "2026-10-20T15:00:00Z" },
      { id: B, last_sign_in_at: null },
    ],
  };

  it("sorts by name and joins role names", () => {
    const rows = buildRolloutRows(base);
    expect(rows.map((r) => r.name)).toEqual(["Amy Person", "Moe Person", "Zed Person"]);
    expect(rows[2].roleName).toBe("Shift Leader");
    expect(rows[0].roleName).toBeNull();
    expect(rows[1].roleName).toBeNull();
  });

  it("counts a stored username as not linked to Discord", () => {
    const rows = buildRolloutRows(base);
    expect(rows.find((r) => r.id === A)?.hasDiscordId).toBe(true);
    expect(rows.find((r) => r.id === B)?.hasDiscordId).toBe(false);
    expect(rows.find((r) => r.id === C)?.hasDiscordId).toBe(false);
  });

  it("treats a non-null last sign-in as signed in", () => {
    const rows = buildRolloutRows(base);
    const amy = rows.find((r) => r.id === A);
    expect(amy?.signedIn).toBe(true);
    expect(amy?.lastSeenAt).toBe("2026-10-20T15:00:00Z");
    const zed = rows.find((r) => r.id === B);
    expect(zed?.signedIn).toBe(false);
    expect(zed?.lastSeenAt).toBeNull();
    expect(rows.find((r) => r.id === C)?.signedIn).toBe(false);
  });

  it("marks push opt-in once per person even with several devices", () => {
    const rows = buildRolloutRows(base);
    expect(rows.find((r) => r.id === A)?.pushOptedIn).toBe(true);
    expect(rows.find((r) => r.id === B)?.pushOptedIn).toBe(false);
  });

  it("handles empty input", () => {
    expect(
      buildRolloutRows({
        profiles: [],
        roleNameById: new Map(),
        privateRows: [],
        pushUserIds: [],
        authUsers: [],
      }),
    ).toEqual([]);
  });
});

describe("summarizeRollout", () => {
  const row = (over: Partial<RolloutRow>): RolloutRow => ({
    id: "x",
    name: "X",
    roleName: null,
    active: true,
    signedIn: false,
    lastSeenAt: null,
    hasDiscordId: false,
    pushOptedIn: false,
    ...over,
  });

  it("counts active rows only", () => {
    const summary = summarizeRollout([
      row({ signedIn: true, hasDiscordId: true, pushOptedIn: true }),
      row({ signedIn: true }),
      row({ active: false, signedIn: true, hasDiscordId: true, pushOptedIn: true }),
    ]);
    expect(summary).toEqual({ total: 2, signedIn: 2, discordLinked: 1, pushOptedIn: 1 });
  });

  it("returns zeros for no rows", () => {
    expect(summarizeRollout([])).toEqual({ total: 0, signedIn: 0, discordLinked: 0, pushOptedIn: 0 });
  });
});

describe("compareEmailList", () => {
  const known = ["Person1@Example.test", "person2@example.test"];

  it("matches case-insensitively and reports missing addresses lowercased", () => {
    const result = compareEmailList("PERSON1@example.test\nnew1@example.test", known);
    expect(result).toEqual({ matched: 1, missing: ["new1@example.test"], invalid: [] });
  });

  it("splits on commas, semicolons, spaces, and newlines", () => {
    const result = compareEmailList(
      "person1@example.test, new1@example.test;new2@example.test  person2@example.test\r\nnew3@example.test",
      known,
    );
    expect(result.matched).toBe(2);
    expect(result.missing).toEqual(["new1@example.test", "new2@example.test", "new3@example.test"]);
  });

  it("dedupes repeats, including case variants", () => {
    const result = compareEmailList(
      "new1@example.test NEW1@example.test person1@example.test person1@EXAMPLE.test",
      known,
    );
    expect(result).toEqual({ matched: 1, missing: ["new1@example.test"], invalid: [] });
  });

  it("flags entries without an @ and a dot after it as invalid", () => {
    const result = compareEmailList("nope, a@b, @example.test, a@.test x@y.", known);
    expect(result.matched).toBe(0);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual(["nope", "a@b", "@example.test", "a@.test", "x@y."]);
  });

  it("strips angle brackets from pasted contacts", () => {
    const result = compareEmailList("<person2@example.test>", known);
    expect(result).toEqual({ matched: 1, missing: [], invalid: [] });
  });

  it("handles an empty paste and an empty known list", () => {
    expect(compareEmailList("  \n ", known)).toEqual({ matched: 0, missing: [], invalid: [] });
    expect(compareEmailList("a@b.test", [])).toEqual({ matched: 0, missing: ["a@b.test"], invalid: [] });
  });
});

describe("formatLastSeen", () => {
  // 2026-10-25 noon in New York (EDT, UTC-4).
  const now = new Date("2026-10-25T16:00:00Z");

  it("returns Never for null or a bad value", () => {
    expect(formatLastSeen(null, now)).toBe("Never");
    expect(formatLastSeen("not a date", now)).toBe("Never");
  });

  it("returns Today for earlier the same store day", () => {
    expect(formatLastSeen("2026-10-25T05:00:00Z", now)).toBe("Today");
  });

  it("uses store calendar days, not 24-hour blocks", () => {
    // 11pm EDT on the 24th is only 13 hours before `now` but still yesterday.
    expect(formatLastSeen("2026-10-25T03:00:00Z", now)).toBe("Yesterday");
    // 12:30am EDT on the 25th is Today even though UTC says the 25th too.
    expect(formatLastSeen("2026-10-25T04:30:00Z", now)).toBe("Today");
  });

  it("returns N days ago up to 30 days", () => {
    expect(formatLastSeen("2026-10-22T16:00:00Z", now)).toBe("3 days ago");
    expect(formatLastSeen("2026-09-25T16:00:00Z", now)).toBe("30 days ago");
  });

  it("returns a short date beyond 30 days", () => {
    expect(formatLastSeen("2026-09-10T16:00:00Z", now)).toBe("Sep 10, 2026");
  });
});
