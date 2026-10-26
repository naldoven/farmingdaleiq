import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runDriverReminders = vi.fn(async (): Promise<{ status: string; error?: string }> => ({ status: "idle" }));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("./reminders", () => ({
  runDriverReminders: (...args: unknown[]) => (runDriverReminders as (...a: unknown[]) => unknown)(...args),
}));

import { GET } from "./route";

function request(auth?: string) {
  const headers = new Headers();
  if (auth !== undefined) headers.set("authorization", auth);
  return new NextRequest("https://example.test/api/cron/catering-drivers", { headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "secret");
  runDriverReminders.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/cron/catering-drivers", () => {
  it("refuses a request without the cron secret", async () => {
    const response = await GET(request("Bearer wrong"));
    expect(response.status).toBe(401);
    expect(runDriverReminders).not.toHaveBeenCalled();
  });

  it("refuses everything when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
  });

  it("runs the reminders with the secret", async () => {
    const response = await GET(request("Bearer secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "idle" });
  });

  it("answers 500 when the run fails", async () => {
    runDriverReminders.mockResolvedValueOnce({ status: "error", error: "boom" });
    const response = await GET(request("Bearer secret"));
    expect(response.status).toBe(500);
  });
});
