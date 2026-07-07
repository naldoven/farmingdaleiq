import { describe, expect, it } from "vitest";

import {
  assignRoleSchema,
  inviteUserSchema,
  updateProfileSchema,
} from "./validation";

describe("updateProfileSchema", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Jamie Rivera",
    phone: "",
    discordUserId: "",
    birthdate: "",
    hiredOn: "",
    active: true,
  };

  it("accepts a fully populated valid input", () => {
    expect(updateProfileSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = updateProfileSchema.safeParse({ ...base, name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid id", () => {
    const result = updateProfileSchema.safeParse({ ...base, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing active flag", () => {
    const withoutActive: Partial<typeof base> = { ...base };
    delete withoutActive.active;
    const result = updateProfileSchema.safeParse(withoutActive);
    expect(result.success).toBe(false);
  });
});

describe("assignRoleSchema", () => {
  it("allows a null roleId (unassigning a role)", () => {
    const result = assignRoleSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      roleId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid roleId", () => {
    const result = assignRoleSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      roleId: "team-leader",
    });
    expect(result.success).toBe(false);
  });
});

describe("inviteUserSchema", () => {
  it("accepts a valid invite", () => {
    const result = inviteUserSchema.safeParse({
      name: "Alex Chen",
      email: "alex@example.com",
      roleId: null,
      phone: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = inviteUserSchema.safeParse({
      name: "Alex Chen",
      email: "not-an-email",
      roleId: null,
      phone: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const result = inviteUserSchema.safeParse({
      name: "",
      email: "alex@example.com",
      roleId: null,
      phone: "",
    });
    expect(result.success).toBe(false);
  });
});
