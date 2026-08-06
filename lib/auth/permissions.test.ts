import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { ALL_PERMISSION_KEYS, PERMISSION_KEYS, hasPermission } from "./permissions";

beforeEach(() => {
  createClientMock.mockReset();
});

describe("PERMISSION_KEYS", () => {
  it("is a non-empty list of unique, dot-namespaced keys", () => {
    expect(Array.isArray(PERMISSION_KEYS)).toBe(true);
    expect(PERMISSION_KEYS.length).toBeGreaterThan(0);

    const unique = new Set(PERMISSION_KEYS);
    expect(unique.size).toBe(PERMISSION_KEYS.length);

    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("keeps dormant feature permissions out of the role editor", () => {
    expect(ALL_PERMISSION_KEYS).toContain("feed.post_broadcast");
    expect(ALL_PERMISSION_KEYS).toContain("breaks.view");
    expect(ALL_PERMISSION_KEYS).toContain("setups.view");
    expect(PERMISSION_KEYS).not.toContain("feed.post_broadcast");
    expect(PERMISSION_KEYS).not.toContain("breaks.view");
    expect(PERMISSION_KEYS).not.toContain("setups.view");
  });
});

describe("hasPermission", () => {
  it("fails dormant feature permissions without querying Supabase", async () => {
    await expect(hasPermission("feed.post_broadcast")).resolves.toBe(false);
    await expect(hasPermission("breaks.view")).resolves.toBe(false);
    await expect(hasPermission("setups.view")).resolves.toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns the RPC grant when the permission check succeeds", async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });

    await expect(hasPermission("people.view")).resolves.toBe(true);
  });

  it("fails closed when Supabase returns an RPC error", async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc failed") }),
    });

    await expect(hasPermission("people.view")).resolves.toBe(false);
  });

  it("fails closed when creating the session client throws", async () => {
    createClientMock.mockRejectedValue(new Error("session unavailable"));

    await expect(hasPermission("people.view")).resolves.toBe(false);
  });

  it("fails closed when the permission request rejects", async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockRejectedValue(new Error("network unavailable")),
    });

    await expect(hasPermission("people.view")).resolves.toBe(false);
  });
});
