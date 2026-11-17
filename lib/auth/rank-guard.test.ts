import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  RANK_GUARD_MESSAGE,
  canActOn,
  guardRank,
  requireCanAssignRole,
  requireOutranks,
} from "./rank-guard";

const mockCreateClient = vi.mocked(createClient);

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

describe("canActOn (lower rank number = more senior)", () => {
  it("allows acting on someone ranked below you", () => {
    expect(canActOn(3, 5, false)).toBe(true);
    expect(canActOn(1, 10, false)).toBe(true);
  });

  it("blocks the same rank", () => {
    expect(canActOn(3, 3, false)).toBe(false);
  });

  it("blocks someone ranked above you", () => {
    expect(canActOn(3, 2, false)).toBe(false);
    expect(canActOn(3, 1, false)).toBe(false);
  });

  it("blocks yourself even when the ranks would allow it", () => {
    expect(canActOn(1, 10, true)).toBe(false);
  });

  it("blocks an actor with no ranked role", () => {
    expect(canActOn(null, 10, false)).toBe(false);
    expect(canActOn(null, null, false)).toBe(false);
  });

  it("allows acting on a person with no role (they hold no permissions at all)", () => {
    expect(canActOn(3, null, false)).toBe(true);
  });
});

describe("guardRank", () => {
  const ranks = new Map<string, number | null>([
    ["r-tl", 6],
    ["r-odd", null],
  ]);

  it("is null for a person with no role, so a ranked manager may act", () => {
    expect(guardRank(null, ranks)).toBeNull();
    expect(canActOn(3, guardRank(null, ranks), false)).toBe(true);
  });

  it("is the role's rank for a ranked role", () => {
    expect(guardRank("r-tl", ranks)).toBe(6);
  });

  it("treats a role with no rank as senior to everyone, so it is refused", () => {
    expect(canActOn(1, guardRank("r-odd", ranks), false)).toBe(false);
  });
});

/** profiles + roles read through the per-request client. */
function mockDb(opts: {
  userId: string | null;
  profiles: { id: string; role_id: string | null }[];
  roles: { id: string; rank: number | null }[];
}) {
  const profilesQuery = {
    select: vi.fn(() => profilesQuery),
    in: vi.fn(async () => ({ data: opts.profiles, error: null })),
    eq: vi.fn((_col: string, id: string) => ({
      maybeSingle: async () => ({
        data: opts.profiles.find((p) => p.id === id) ?? null,
        error: null,
      }),
    })),
  };
  const rolesQuery = {
    select: vi.fn(async () => ({ data: opts.roles, error: null })),
  };
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.userId ? { id: opts.userId } : null } })) },
    from: vi.fn((table: string) => (table === "profiles" ? profilesQuery : rolesQuery)),
  } as never);
}

describe("requireOutranks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes when the signed-in person outranks the target", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [
        { id: ACTOR, role_id: "r-ad" },
        { id: TARGET, role_id: "r-tl" },
      ],
      roles: [
        { id: "r-ad", rank: 3 },
        { id: "r-tl", rank: 6 },
      ],
    });
    await expect(requireOutranks(TARGET)).resolves.toEqual({ actorId: ACTOR });
  });

  it("throws the plain rank message for a senior target", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [
        { id: ACTOR, role_id: "r-ad" },
        { id: TARGET, role_id: "r-dir" },
      ],
      roles: [
        { id: "r-ad", rank: 3 },
        { id: "r-dir", rank: 2 },
      ],
    });
    await expect(requireOutranks(TARGET)).rejects.toThrow(RANK_GUARD_MESSAGE);
  });

  it("throws for the caller's own profile", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [{ id: ACTOR, role_id: "r-lm" }],
      roles: [{ id: "r-lm", rank: 1 }],
    });
    await expect(requireOutranks(ACTOR)).rejects.toThrow(RANK_GUARD_MESSAGE);
  });

  it("throws when nobody is signed in", async () => {
    mockDb({ userId: null, profiles: [], roles: [] });
    await expect(requireOutranks(TARGET)).rejects.toThrow();
  });

  it("throws for a target whose role has no rank", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [
        { id: ACTOR, role_id: "r-lm" },
        { id: TARGET, role_id: "r-odd" },
      ],
      roles: [
        { id: "r-lm", rank: 1 },
        { id: "r-odd", rank: null },
      ],
    });
    await expect(requireOutranks(TARGET)).rejects.toThrow(RANK_GUARD_MESSAGE);
  });

  it("passes for a target with no role at all", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [
        { id: ACTOR, role_id: "r-ad" },
        { id: TARGET, role_id: null },
      ],
      roles: [{ id: "r-ad", rank: 3 }],
    });
    await expect(requireOutranks(TARGET)).resolves.toEqual({ actorId: ACTOR });
  });

  it("throws when the target profile does not exist", async () => {
    mockDb({
      userId: ACTOR,
      profiles: [{ id: ACTOR, role_id: "r-lm" }],
      roles: [{ id: "r-lm", rank: 1 }],
    });
    await expect(requireOutranks(TARGET)).rejects.toThrow("That person could not be found.");
  });
});

describe("requireCanAssignRole (checked before Add person creates anything)", () => {
  beforeEach(() => vi.clearAllMocks());

  const roles = [
    { id: "r-dir", rank: 2 },
    { id: "r-ad", rank: 3 },
    { id: "r-tl", rank: 6 },
  ];

  it("allows a role at or below the caller's own rank", async () => {
    mockDb({ userId: ACTOR, profiles: [{ id: ACTOR, role_id: "r-ad" }], roles });
    await expect(requireCanAssignRole("r-tl")).resolves.toEqual({ actorId: ACTOR });
    await expect(requireCanAssignRole("r-ad")).resolves.toEqual({ actorId: ACTOR });
  });

  it("refuses a role senior to the caller's own", async () => {
    mockDb({ userId: ACTOR, profiles: [{ id: ACTOR, role_id: "r-ad" }], roles });
    await expect(requireCanAssignRole("r-dir")).rejects.toThrow("You can't give someone a role above your own.");
  });

  it("allows no role at all", async () => {
    mockDb({ userId: ACTOR, profiles: [{ id: ACTOR, role_id: "r-ad" }], roles });
    await expect(requireCanAssignRole(null)).resolves.toEqual({ actorId: ACTOR });
  });

  it("refuses an unknown role id", async () => {
    mockDb({ userId: ACTOR, profiles: [{ id: ACTOR, role_id: "r-ad" }], roles });
    await expect(requireCanAssignRole("r-nope")).rejects.toThrow("That role could not be found.");
  });
});
