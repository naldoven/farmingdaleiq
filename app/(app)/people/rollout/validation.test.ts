import { describe, expect, it } from "vitest";

import { checkInviteListSchema } from "./validation";

describe("checkInviteListSchema", () => {
  it("accepts an empty paste and a paste at the limit", () => {
    expect(checkInviteListSchema.safeParse({ emails: "" }).success).toBe(true);
    expect(checkInviteListSchema.safeParse({ emails: "a".repeat(5000) }).success).toBe(true);
  });

  it("rejects a paste over 5000 characters", () => {
    expect(checkInviteListSchema.safeParse({ emails: "a".repeat(5001) }).success).toBe(false);
  });

  it("rejects a missing or non-string value", () => {
    expect(checkInviteListSchema.safeParse({}).success).toBe(false);
    expect(checkInviteListSchema.safeParse({ emails: 5 }).success).toBe(false);
  });
});
