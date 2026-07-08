import { describe, expect, it } from "vitest";

import { activelyWorkedKeys, shouldCreateReratePrompt } from "./logic";

describe("activelyWorkedKeys", () => {
  it("keys pairs that have a recent assignment", () => {
    const keys = activelyWorkedKeys([
      { user_id: "u1", position_id: "p1" },
      { user_id: "u2", position_id: "p2" },
    ]);
    expect(keys.has("u1:p1")).toBe(true);
    expect(keys.has("u2:p2")).toBe(true);
    expect(keys.has("u1:p2")).toBe(false);
  });

  it("ignores rows missing a user_id or position_id", () => {
    const keys = activelyWorkedKeys([
      { user_id: null, position_id: "p1" },
      { user_id: "u1", position_id: null },
    ]);
    expect(keys.size).toBe(0);
  });
});

describe("shouldCreateReratePrompt", () => {
  it("creates a prompt only when actively worked and no prompt is already open", () => {
    expect(shouldCreateReratePrompt({ hasOpenPrompt: false, activelyWorked: true })).toBe(true);
  });

  it("skips when a prompt is already open", () => {
    expect(shouldCreateReratePrompt({ hasOpenPrompt: true, activelyWorked: true })).toBe(false);
  });

  it("skips a stale rating on a position that isn't actively worked", () => {
    expect(shouldCreateReratePrompt({ hasOpenPrompt: false, activelyWorked: false })).toBe(false);
  });
});
