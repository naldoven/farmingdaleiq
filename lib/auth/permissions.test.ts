import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { PERMISSION_KEYS, hasPermission } from "./permissions";

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
});

describe("hasPermission", () => {
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
