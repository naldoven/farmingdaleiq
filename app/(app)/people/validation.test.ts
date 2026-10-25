import { describe, expect, it } from "vitest";

import {
  assignRoleSchema,
  inviteUserSchema,
  selfUpdateProfileSchema,
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
    avatarUrl: "",
    active: true,
  };

  it("accepts a valid avatarUrl", () => {
    const result = updateProfileSchema.safeParse({
      ...base,
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL avatarUrl", () => {
    const result = updateProfileSchema.safeParse({ ...base, avatarUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated valid input", () => {
    expect(updateProfileSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = updateProfileSchema.safeParse({ ...base, name: "   " });
    expect(result.success).toBe(false);
  });

  describe("discordUserId", () => {
    it("accepts an empty id (clears it)", () => {
      expect(updateProfileSchema.safeParse({ ...base, discordUserId: "" }).success).toBe(true);
    });

    it("accepts a missing id", () => {
      const withoutId: Partial<typeof base> = { ...base };
      delete withoutId.discordUserId;
      expect(updateProfileSchema.safeParse(withoutId).success).toBe(true);
    });

    it("accepts an 18 digit id and trims surrounding spaces", () => {
      const result = updateProfileSchema.safeParse({
        ...base,
        discordUserId: "  123456789012345678 ",
      });
      expect(result.success).toBe(true);
      expect(result.data?.discordUserId).toBe("123456789012345678");
    });

    it("rejects a username with a message a manager can act on", () => {
      const result = updateProfileSchema.safeParse({ ...base, discordUserId: "jamie" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Discord ID must be the 17 to 20 digit number from Discord, not a username.",
      );
    });

    it("rejects a 10 digit number", () => {
      const result = updateProfileSchema.safeParse({ ...base, discordUserId: "1234567890" });
      expect(result.success).toBe(false);
    });
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

describe("selfUpdateProfileSchema", () => {
  it("accepts phone/birthdate/avatarUrl with no id, role, or name fields", () => {
    const result = selfUpdateProfileSchema.safeParse({
      phone: "555-0100",
      birthdate: "1990-01-01",
      avatarUrl: "https://example.com/me.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all-blank input", () => {
    const result = selfUpdateProfileSchema.safeParse({
      phone: "",
      birthdate: "",
      avatarUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL avatarUrl", () => {
    const result = selfUpdateProfileSchema.safeParse({
      phone: "",
      birthdate: "",
      avatarUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("strips privileged fields instead of erroring, so they can never reach the update", () => {
    const parsed = selfUpdateProfileSchema.parse({
      phone: "555-0100",
      birthdate: "",
      avatarUrl: "",
      role_id: "11111111-1111-4111-8111-111111111111",
      active: false,
      name: "Someone Else",
    } as never);
    expect(parsed).toEqual({ phone: "555-0100", birthdate: "", avatarUrl: "" });
  });
});
