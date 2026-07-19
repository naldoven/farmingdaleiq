import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PermissionError } from "@/lib/auth/permissions";
import { toActionError } from "./action-error";

describe("toActionError", () => {
  it("maps a PermissionError to a friendly permission line", () => {
    expect(toActionError(new PermissionError("settings.manage"))).toBe(
      "You don't have permission to do this.",
    );
  });

  it("turns a ZodError into a friendly single line, never raw JSON", () => {
    let caught: unknown;
    try {
      z.object({ toUserId: z.string().uuid("Pick a coworker first.") }).parse({
        toUserId: "",
      });
    } catch (error) {
      caught = error;
    }

    const message = toActionError(caught);
    expect(message).toBe("Pick a coworker first.");
    // The bug this fixes: a ZodError's own .message is a JSON array of issues.
    expect(message.startsWith("[")).toBe(false);
    expect(message).not.toContain('"code"');
  });

  it("joins multiple Zod issues into one line", () => {
    let caught: unknown;
    try {
      z.object({
        name: z.string().min(1, "Name is required"),
        age: z.number().int("Age must be a whole number"),
      }).parse({ name: "", age: 1.5 });
    } catch (error) {
      caught = error;
    }

    const message = toActionError(caught);
    expect(message).toContain("Name is required");
    expect(message).toContain("Age must be a whole number");
    expect(message).toContain("; ");
  });

  it("passes through a plain Error message", () => {
    expect(toActionError(new Error("Could not post the recognition."))).toBe(
      "Could not post the recognition.",
    );
  });

  it("falls back to a generic line for a non-Error value", () => {
    expect(toActionError("boom")).toBe("Something went wrong.");
    expect(toActionError(null)).toBe("Something went wrong.");
    expect(toActionError(undefined)).toBe("Something went wrong.");
    expect(toActionError({ message: "not a real Error" })).toBe(
      "Something went wrong.",
    );
  });
});
