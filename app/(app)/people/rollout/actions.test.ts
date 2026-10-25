import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * checkInviteList is read-only, so the things worth proving are: the
 * permission guard runs first (and fails closed before any DB access), the
 * result has the documented shape, and nothing is written.
 */

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { checkInviteList } from "./actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

function makeAdmin(result: { data?: unknown; error?: unknown }) {
  const select = vi.fn(async () => result);
  const writes = {
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  const from = vi.fn(() => ({ select, ...writes }));
  return {
    client: { from } as unknown as ReturnType<typeof createServiceRoleClient>,
    from,
    select,
    writes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined as never);
});

describe("checkInviteList", () => {
  it("fails closed without touching the database when permission is missing", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("people.manage"));

    const result = await checkInviteList({ emails: "new1@example.test" });

    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("checks people.manage and returns matched, missing, and invalid", async () => {
    const admin = makeAdmin({
      data: [{ email: "Person1@example.test" }, { email: null }, { email: "person2@example.test" }],
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(admin.client);

    const result = await checkInviteList({
      emails: "person1@example.test, new1@example.test\nnot-an-email",
    });

    expect(mockRequirePermission).toHaveBeenCalledWith("people.manage");
    expect(admin.from).toHaveBeenCalledWith("profiles_private");
    expect(admin.select).toHaveBeenCalledWith("email");
    expect(result).toEqual({
      ok: true,
      data: { matched: 1, missing: ["new1@example.test"], invalid: ["not-an-email"] },
    });
  });

  it("never writes", async () => {
    const admin = makeAdmin({ data: [], error: null });
    mockCreateServiceRoleClient.mockReturnValue(admin.client);

    await checkInviteList({ emails: "new1@example.test" });

    for (const write of Object.values(admin.writes)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("rejects a paste over 5000 characters before reading anything", async () => {
    const result = await checkInviteList({ emails: "a".repeat(5001) });

    expect(result.ok).toBe(false);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns a plain error when the read fails", async () => {
    const admin = makeAdmin({ data: null, error: { message: "boom" } });
    mockCreateServiceRoleClient.mockReturnValue(admin.client);

    const result = await checkInviteList({ emails: "new1@example.test" });

    expect(result).toEqual({ ok: false, error: "Could not read existing accounts. Try again." });
  });
});
