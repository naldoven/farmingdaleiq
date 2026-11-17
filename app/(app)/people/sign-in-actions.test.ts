import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-in tools for managers (docs/STAFF-SIGN-IN-PLAN.md): invite by share
 * link, "New setup link", "Set temporary password", and the rank guard on role
 * changes. Every one of these hands out or changes someone's way into the app,
 * so the tests pin three things: the permission check runs first, the rank
 * guard runs before any account is touched, and nothing secret (link or
 * password) reaches the audit event.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/auth/rank-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rank-guard")>(
    "@/lib/auth/rank-guard",
  );
  return { ...actual, requireOutranks: vi.fn(), requireCanAssignRole: vi.fn() };
});

vi.mock("@/lib/auth/setup-link", () => ({ makeSetupLink: vi.fn() }));
vi.mock("@/lib/events/bus", () => ({ emitEvent: vi.fn(async () => undefined) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import {
  RANK_GUARD_MESSAGE,
  RankGuardError,
  requireCanAssignRole,
  requireOutranks,
} from "@/lib/auth/rank-guard";
import { makeSetupLink } from "@/lib/auth/setup-link";
import { emitEvent } from "@/lib/events/bus";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { assignRole, inviteUser, newSetupLink, setTemporaryPassword } from "./actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockRequireOutranks = vi.mocked(requireOutranks);
const mockRequireCanAssignRole = vi.mocked(requireCanAssignRole);
const mockMakeSetupLink = vi.mocked(makeSetupLink);
const mockEmit = vi.mocked(emitEvent);
const mockCreateClient = vi.mocked(createClient);
const mockServiceRole = vi.mocked(createServiceRoleClient);

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const LINK = "https://app.example.com/auth/confirm?token_hash=secret-hash&type=recovery";

function queryResult(result: { error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function adminWith(admin: Record<string, unknown>) {
  mockServiceRole.mockReturnValue({ auth: { admin } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
  mockRequireOutranks.mockResolvedValue({ actorId: ACTOR });
  mockRequireCanAssignRole.mockResolvedValue({ actorId: ACTOR });
  mockMakeSetupLink.mockResolvedValue(LINK);
});

describe("inviteUser (share link, no email)", () => {
  function dbOk() {
    const profiles = queryResult({ error: null });
    const priv = queryResult({ error: null });
    mockCreateClient.mockResolvedValue({
      from: vi.fn((t: string) => (t === "profiles" ? profiles : priv)),
    } as never);
    return { profiles, priv };
  }

  it("creates a confirmed account with no password and no email, then returns a setup link", async () => {
    const createUser = vi.fn(async () => ({ data: { user: { id: TARGET } }, error: null }));
    const inviteUserByEmail = vi.fn();
    adminWith({ createUser, inviteUserByEmail });
    dbOk();

    const result = await inviteUser({ name: "Alex", email: "alex@example.com", roleId: null, phone: "" });

    expect(createUser).toHaveBeenCalledWith({
      email: "alex@example.com",
      email_confirm: true,
      user_metadata: { name: "Alex" },
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(mockMakeSetupLink).toHaveBeenCalledWith("alex@example.com");
    expect(result).toEqual({ ok: true, data: { userId: TARGET, link: LINK } });
    expect(mockEmit).toHaveBeenCalledWith("people_setup_link_created", {
      actor_id: ACTOR,
      target_id: TARGET,
    });
    expect(JSON.stringify(mockEmit.mock.calls)).not.toContain("secret-hash");
  });

  it("refuses a role above the manager's own before creating any account", async () => {
    mockRequireCanAssignRole.mockRejectedValue(
      new RankGuardError("You can't give someone a role above your own."),
    );
    const createUser = vi.fn();
    adminWith({ createUser });

    const result = await inviteUser({
      name: "Alex",
      email: "alex@example.com",
      roleId: "55555555-5555-4555-8555-555555555555",
      phone: "",
    });

    expect(result).toEqual({ ok: false, error: "You can't give someone a role above your own." });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("turns an email that already has an account into a plain message and writes nothing", async () => {
    const createUser = vi.fn(async () => ({
      data: { user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    }));
    adminWith({ createUser });

    const result = await inviteUser({ name: "Alex", email: "alex@example.com", roleId: null, phone: "" });

    expect(result).toEqual({
      ok: false,
      error: "alex@example.com already has an account. Use New setup link on their profile.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockMakeSetupLink).not.toHaveBeenCalled();
  });

  it("still reports the new account when only the link step fails, so nobody adds them twice", async () => {
    adminWith({ createUser: vi.fn(async () => ({ data: { user: { id: TARGET } }, error: null })) });
    dbOk();
    mockMakeSetupLink.mockRejectedValue(new Error("Could not make a setup link. Try again."));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await inviteUser({ name: "Alex", email: "alex@example.com", roleId: null, phone: "" });

    expect(result).toEqual({ ok: true, data: { userId: TARGET, link: null } });
    expect(mockEmit).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("newSetupLink", () => {
  it("fails closed without people.manage and never reaches the admin API", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("people.manage"));
    const result = await newSetupLink({ profileId: TARGET });
    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(mockServiceRole).not.toHaveBeenCalled();
    expect(mockMakeSetupLink).not.toHaveBeenCalled();
  });

  it("refuses a person at or above the manager's rank before making any link", async () => {
    mockRequireOutranks.mockRejectedValue(new RankGuardError());
    const result = await newSetupLink({ profileId: TARGET });
    expect(result).toEqual({ ok: false, error: RANK_GUARD_MESSAGE });
    expect(mockServiceRole).not.toHaveBeenCalled();
    expect(mockMakeSetupLink).not.toHaveBeenCalled();
  });

  it("refuses a malformed id", async () => {
    const result = await newSetupLink({ profileId: "not-a-uuid" });
    expect(result.ok).toBe(false);
    expect(mockMakeSetupLink).not.toHaveBeenCalled();
  });

  it("looks up the email on the server, returns the link, and audits ids only", async () => {
    const getUserById = vi.fn(async () => ({
      data: { user: { id: TARGET, email: "alex@example.com" } },
      error: null,
    }));
    adminWith({ getUserById });

    const result = await newSetupLink({ profileId: TARGET });

    expect(getUserById).toHaveBeenCalledWith(TARGET);
    expect(mockMakeSetupLink).toHaveBeenCalledWith("alex@example.com");
    expect(result).toEqual({ ok: true, data: { link: LINK } });
    expect(mockEmit).toHaveBeenCalledWith("people_setup_link_created", {
      actor_id: ACTOR,
      target_id: TARGET,
    });
    expect(JSON.stringify(mockEmit.mock.calls)).not.toContain("secret-hash");
  });
});

describe("setTemporaryPassword", () => {
  it("fails closed without people.manage", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("people.manage"));
    const result = await setTemporaryPassword({ profileId: TARGET, password: "TempPass123" });
    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(mockServiceRole).not.toHaveBeenCalled();
  });

  it("refuses a password under 8 characters without touching the account", async () => {
    const updateUserById = vi.fn();
    adminWith({ updateUserById });
    const result = await setTemporaryPassword({ profileId: TARGET, password: "short" });
    expect(result.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a person at or above the manager's rank", async () => {
    mockRequireOutranks.mockRejectedValue(new RankGuardError());
    const updateUserById = vi.fn();
    adminWith({ updateUserById });
    const result = await setTemporaryPassword({ profileId: TARGET, password: "TempPass123" });
    expect(result).toEqual({ ok: false, error: RANK_GUARD_MESSAGE });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("sets the password with the forced-change flag in app_metadata (never user_metadata)", async () => {
    const updateUserById = vi.fn(async () => ({ data: { user: { id: TARGET } }, error: null }));
    adminWith({ updateUserById });

    const result = await setTemporaryPassword({ profileId: TARGET, password: "TempPass123" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateUserById).toHaveBeenCalledWith(TARGET, {
      password: "TempPass123",
      app_metadata: { must_change_password: true },
    });
    expect(mockEmit).toHaveBeenCalledWith("people_temp_password_set", {
      actor_id: ACTOR,
      target_id: TARGET,
    });
    expect(JSON.stringify(mockEmit.mock.calls)).not.toContain("TempPass123");
    expect(JSON.stringify(result)).not.toContain("TempPass123");
  });
});

describe("assignRole rank guard (an Assistant Director cannot demote a Director)", () => {
  it("refuses to change the role of someone at or above the manager's rank", async () => {
    mockRequireOutranks.mockRejectedValue(new RankGuardError());
    const result = await assignRole({ id: TARGET, roleId: null });
    expect(result).toEqual({ ok: false, error: RANK_GUARD_MESSAGE });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("still changes the role of someone ranked below", async () => {
    const profiles = queryResult({ error: null });
    mockCreateClient.mockResolvedValue({ from: vi.fn(() => profiles) } as never);
    const result = await assignRole({ id: TARGET, roleId: null });
    expect(mockRequireOutranks).toHaveBeenCalledWith(TARGET);
    expect(result).toEqual({ ok: true, data: undefined });
  });
});
