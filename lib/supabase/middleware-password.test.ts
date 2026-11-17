import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { mustChangePassword, updateSession } from "./middleware";

const flagged = { id: "u1", app_metadata: { must_change_password: true }, user_metadata: {} };
const normal = { id: "u2", app_metadata: {}, user_metadata: {} };

describe("mustChangePassword", () => {
  it("is true for a flagged person on any app page", () => {
    expect(mustChangePassword(flagged, "/")).toBe(true);
    expect(mustChangePassword(flagged, "/people")).toBe(true);
    expect(mustChangePassword(flagged, "/api/notifications")).toBe(true);
  });

  it("lets a flagged person reach /set-password itself, the auth pages and public paths", () => {
    expect(mustChangePassword(flagged, "/set-password")).toBe(false);
    expect(mustChangePassword(flagged, "/auth/confirm")).toBe(false);
    expect(mustChangePassword(flagged, "/auth/callback")).toBe(false);
    expect(mustChangePassword(flagged, "/login")).toBe(false);
    expect(mustChangePassword(flagged, "/offline.html")).toBe(false);
  });

  it("ignores a flag in user_metadata, which people can edit themselves", () => {
    const selfFlagged = { id: "u3", app_metadata: {}, user_metadata: { must_change_password: true } };
    expect(mustChangePassword(selfFlagged, "/")).toBe(false);
  });

  it("is false with no flag and with nobody signed in", () => {
    expect(mustChangePassword(normal, "/")).toBe(false);
    expect(mustChangePassword(null, "/")).toBe(false);
  });
});

describe("updateSession with a temporary password", () => {
  beforeEach(() => getUser.mockReset());

  function request(path: string) {
    return new NextRequest(new URL(path, "https://app.example.com"));
  }

  it("sends a flagged person to /set-password", async () => {
    getUser.mockResolvedValue({ data: { user: flagged } });
    const res = await updateSession(request("/people"));
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/set-password");
  });

  it("does not redirect a flagged person who is already on /set-password", async () => {
    getUser.mockResolvedValue({ data: { user: flagged } });
    const res = await updateSession(request("/set-password"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves everyone else alone", async () => {
    getUser.mockResolvedValue({ data: { user: normal } });
    const res = await updateSession(request("/people"));
    expect(res.headers.get("location")).toBeNull();
  });
});
