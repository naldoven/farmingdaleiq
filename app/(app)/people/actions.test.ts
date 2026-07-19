import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level coverage (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [LOW]:
 * "Zero test coverage for actions, gating, and the privilege guard — the
 * most security-critical trigger has no test"). Two things are covered:
 *
 * 1. The PermissionError path — every admin-only action must fail closed
 *    (and never touch the database) when the caller lacks the permission,
 *    proven here by mocking requirePermission to throw and asserting
 *    createClient/createServiceRoleClient are never called.
 * 2. A self-escalation attempt against `updateOwnProfile` — the one action
 *    in this file that intentionally skips requirePermission(). It must be
 *    impossible to smuggle role_id/active/discord_user_id/name/email
 *    through it even if a caller casts extra fields past the TypeScript
 *    type, and it must always target the *caller's own* id, never one
 *    supplied by the input.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return {
    ...actual,
    requirePermission: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  assignRole,
  bootstrapFirstAdmin,
  getBootstrapEligibility,
  inviteUser,
  updateOwnProfile,
  updateProfile,
} from "./actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

/** Minimal chainable Supabase query-builder stand-in: every method returns
 * the same object, and the object itself resolves (via `.then`) to the
 * preset result — matching how supabase-js query builders are awaitable. */
function makeQueryResult(result: { data?: unknown; error?: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.upsert = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const CALLER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PermissionError path (fail closed, never touch the database)", () => {
  beforeEach(() => {
    mockRequirePermission.mockRejectedValue(new PermissionError("people.manage"));
  });

  it("updateProfile returns a generic error and never calls createClient", async () => {
    const result = await updateProfile({
      id: PROFILE_ID,
      name: "Jamie Rivera",
      phone: "",
      discordUserId: "",
      birthdate: "",
      hiredOn: "",
      avatarUrl: "",
      active: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("assignRole returns a generic error and never calls createClient", async () => {
    const result = await assignRole({ id: PROFILE_ID, roleId: null });

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("inviteUser returns a generic error and never calls createServiceRoleClient", async () => {
    const result = await inviteUser({
      name: "Alex Chen",
      email: "alex@example.com",
      roleId: null,
      phone: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe("updateOwnProfile self-escalation attempt", () => {
  it("writes avatar_url to profiles and phone/birthdate to profiles_private, scoped to the caller's own id", async () => {
    // PPL2b: PII (phone/birthdate) now lives on the locked profiles_private
    // table, keyed by profile_id; only avatar_url stays on profiles. Both
    // writes must target the caller's own row.
    const profilesResult = makeQueryResult({ error: null });
    const privateResult = makeQueryResult({ error: null });
    const fromMock = vi.fn((table: string) =>
      table === "profiles" ? profilesResult : privateResult,
    );

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: CALLER_ID } } })) },
      from: fromMock,
    } as never);

    // Cast past the TypeScript type to simulate a caller trying to smuggle
    // privileged fields through the self-service action.
    const maliciousInput = {
      phone: "555-0100",
      birthdate: "1990-01-01",
      avatarUrl: "https://example.com/me.png",
      role_id: "11111111-1111-4111-8111-111111111111",
      active: false,
      id: PROFILE_ID, // attempting to target someone else's row
    } as unknown as Parameters<typeof updateOwnProfile>[0];

    const result = await updateOwnProfile(maliciousInput);

    expect(result.ok).toBe(true);

    // Non-PII (avatar_url) on profiles, own id only.
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(profilesResult.update).toHaveBeenCalledWith({
      avatar_url: "https://example.com/me.png",
    });
    expect(profilesResult.eq).toHaveBeenCalledWith("id", CALLER_ID);

    // PII (phone/birthdate) on profiles_private, keyed by profile_id, own id
    // only. Never role_id/active/discord_user_id/name/email, and never anyone
    // else's id.
    expect(fromMock).toHaveBeenCalledWith("profiles_private");
    expect(privateResult.update).toHaveBeenCalledWith({
      phone: "555-0100",
      birthdate: "1990-01-01",
    });
    expect(privateResult.eq).toHaveBeenCalledWith("profile_id", CALLER_ID);
    expect(privateResult.eq).not.toHaveBeenCalledWith("profile_id", PROFILE_ID);
    expect(profilesResult.eq).not.toHaveBeenCalledWith("id", PROFILE_ID);
  });

  it("rejects when nobody is signed in, without writing anything", async () => {
    const fromMock = vi.fn();
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: fromMock,
    } as never);

    const result = await updateOwnProfile({ phone: "555-0100", birthdate: "", avatarUrl: "" });

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("PPL2b: PII writes are routed to profiles_private", () => {
  it("updateProfile writes non-PII to profiles and phone/discord/birthdate/hired_on to profiles_private", async () => {
    mockRequirePermission.mockResolvedValue(undefined);
    const profilesResult = makeQueryResult({ error: null });
    const privateResult = makeQueryResult({ error: null });
    const fromMock = vi.fn((table: string) =>
      table === "profiles" ? profilesResult : privateResult,
    );
    mockCreateClient.mockResolvedValue({ from: fromMock } as never);

    const result = await updateProfile({
      id: PROFILE_ID,
      name: "Jamie Rivera",
      phone: "555-0100",
      discordUserId: "424242",
      birthdate: "2010-05-01",
      hiredOn: "2024-01-01",
      avatarUrl: "",
      active: true,
    });

    expect(result.ok).toBe(true);
    // Non-PII on profiles.
    expect(profilesResult.update).toHaveBeenCalledWith({
      name: "Jamie Rivera",
      avatar_url: null,
      active: true,
    });
    expect(profilesResult.eq).toHaveBeenCalledWith("id", PROFILE_ID);
    // PII on profiles_private, keyed by profile_id — never on profiles.
    expect(fromMock).toHaveBeenCalledWith("profiles_private");
    expect(privateResult.update).toHaveBeenCalledWith({
      phone: "555-0100",
      discord_user_id: "424242",
      birthdate: "2010-05-01",
      hired_on: "2024-01-01",
    });
    expect(privateResult.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID);
  });

  it("inviteUser writes name/role to profiles and phone to profiles_private", async () => {
    mockRequirePermission.mockResolvedValue(undefined);
    const adminClient = {
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(async () => ({
            data: { user: { id: PROFILE_ID } },
            error: null,
          })),
        },
      },
    };
    mockCreateServiceRoleClient.mockReturnValue(adminClient as never);

    const profilesResult = makeQueryResult({ error: null });
    const privateResult = makeQueryResult({ error: null });
    const fromMock = vi.fn((table: string) =>
      table === "profiles" ? profilesResult : privateResult,
    );
    mockCreateClient.mockResolvedValue({ from: fromMock } as never);

    const result = await inviteUser({
      name: "Alex Chen",
      email: "alex@example.com",
      roleId: null,
      phone: "555-0100",
    });

    expect(result.ok).toBe(true);
    expect(profilesResult.update).toHaveBeenCalledWith({
      name: "Alex Chen",
      role_id: null,
    });
    expect(profilesResult.eq).toHaveBeenCalledWith("id", PROFILE_ID);
    // Phone is PII → profiles_private only.
    expect(fromMock).toHaveBeenCalledWith("profiles_private");
    expect(privateResult.update).toHaveBeenCalledWith({ phone: "555-0100" });
    expect(privateResult.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID);
  });
});

describe("bootstrap: getBootstrapEligibility / bootstrapFirstAdmin", () => {
  it("is ineligible once any profile already holds an admin role", async () => {
    const adminRolesResult = makeQueryResult({
      data: [{ role_id: "role-lm" }],
      error: null,
    });
    const profileCountResult = makeQueryResult({ data: null, error: null, count: 1 });

    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === "role_permissions" ? adminRolesResult : profileCountResult,
      ),
    } as never);

    const eligibility = await getBootstrapEligibility();

    expect(eligibility).toEqual({
      eligible: false,
      reason: "An admin already exists for this store. Ask them to invite you.",
    });
  });

  it("bootstrapFirstAdmin refuses to promote when an admin already exists, and never writes", async () => {
    const adminRolesResult = makeQueryResult({
      data: [{ role_id: "role-lm" }],
      error: null,
    });
    const profileCountResult = makeQueryResult({ data: null, error: null, count: 1 });
    const rolesResult = makeQueryResult({ data: null, error: null });

    const serviceFrom = vi.fn((table: string) => {
      if (table === "role_permissions") return adminRolesResult;
      if (table === "profiles") return profileCountResult;
      return rolesResult;
    });
    mockCreateServiceRoleClient.mockReturnValue({ from: serviceFrom } as never);
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: CALLER_ID } } })) },
    } as never);

    const result = await bootstrapFirstAdmin();

    expect(result.ok).toBe(false);
    // Only the eligibility reads happened (role_permissions, profiles count)
    // — no attempt to read/write `roles` or update the caller's profile.
    expect(serviceFrom).toHaveBeenCalledWith("role_permissions");
    expect(serviceFrom).toHaveBeenCalledWith("profiles");
    expect(serviceFrom).not.toHaveBeenCalledWith("roles");
  });

  it("bootstrapFirstAdmin promotes the caller to the top-ranked role when eligible", async () => {
    const adminRolesResult = makeQueryResult({
      data: [{ role_id: "role-lm" }],
      error: null,
    });
    const profileCountResult = makeQueryResult({ data: null, error: null, count: 0 });
    const rolesResult = makeQueryResult({
      data: { id: "role-lm", name: "Location Manager" },
      error: null,
    });
    const profileUpdateResult = makeQueryResult({ error: null });

    let profilesCallCount = 0;
    const serviceFrom = vi.fn((table: string) => {
      if (table === "role_permissions") return adminRolesResult;
      if (table === "roles") return rolesResult;
      if (table === "profiles") {
        profilesCallCount += 1;
        return profilesCallCount === 1 ? profileCountResult : profileUpdateResult;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockCreateServiceRoleClient.mockReturnValue({ from: serviceFrom } as never);
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: CALLER_ID } } })) },
    } as never);

    const result = await bootstrapFirstAdmin();

    expect(result).toEqual({
      ok: true,
      data: { roleId: "role-lm", roleName: "Location Manager" },
    });
    expect(profileUpdateResult.update).toHaveBeenCalledWith({ role_id: "role-lm" });
    expect(profileUpdateResult.eq).toHaveBeenCalledWith("id", CALLER_ID);
  });
});
