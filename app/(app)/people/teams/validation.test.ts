import { describe, expect, it } from "vitest";

import {
  addMemberSchema,
  createTeamSchema,
  renameTeamSchema,
} from "./validation";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("createTeamSchema", () => {
  it("accepts a non-empty name", () => {
    expect(createTeamSchema.safeParse({ name: "Kitchen Crew" }).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(createTeamSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("renameTeamSchema", () => {
  it("requires a valid uuid id", () => {
    const result = renameTeamSchema.safeParse({ id: "not-a-uuid", name: "FOH" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid rename", () => {
    const result = renameTeamSchema.safeParse({ id: UUID_A, name: "FOH" });
    expect(result.success).toBe(true);
  });
});

describe("addMemberSchema", () => {
  it("requires both teamId and userId to be uuids", () => {
    expect(
      addMemberSchema.safeParse({ teamId: UUID_A, userId: UUID_B }).success,
    ).toBe(true);
    expect(
      addMemberSchema.safeParse({ teamId: UUID_A, userId: "nope" }).success,
    ).toBe(false);
  });
});
