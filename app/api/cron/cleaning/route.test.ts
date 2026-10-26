import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  publishSelect: vi.fn(),
  buildCleaningWeek: vi.fn(),
  queueDailySummary: vi.fn(),
  queuePlanReminder: vi.fn(),
  queueWeekPublished: vi.fn(),
  clock: { today: "2026-10-31", timeOfDay: "10:05:00", timeZone: "America/New_York" },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const query: Record<string, unknown> = {};
      query.update = () => query;
      query.lte = () => query;
      query.is = () => query;
      query.select = mocks.publishSelect;
      return query;
    },
  }),
}));
vi.mock("@/app/(app)/cleaning/queries", () => ({ loadStoreClock: async () => mocks.clock }));
vi.mock("@/app/(app)/cleaning/week-build", () => ({ buildCleaningWeek: mocks.buildCleaningWeek }));
vi.mock("@/app/api/cron/cleaning/alerts", () => ({
  SUMMARY_FROM: "06:00:00",
  queueDailySummary: mocks.queueDailySummary,
  queuePlanReminder: mocks.queuePlanReminder,
  queueWeekPublished: mocks.queueWeekPublished,
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/cron/cleaning", { headers: { authorization: "Bearer test-secret" } });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({ data: { missed: 0, carried: 0 }, error: null });
  mocks.publishSelect.mockResolvedValue({ data: [], error: null });
  mocks.buildCleaningWeek.mockResolvedValue({ status: "already_built" });
  mocks.queueDailySummary.mockResolvedValue({ status: "queued" });
  mocks.queuePlanReminder.mockResolvedValue({ status: "queued" });
  mocks.queueWeekPublished.mockResolvedValue({ status: "queued" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("cleaning cron", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/cleaning"));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("still sends the Saturday reminder and the summary when a build throws", async () => {
    mocks.buildCleaningWeek.mockRejectedValue(new Error("unique violation"));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errors).toEqual(["build this week: unique violation", "build next week: unique violation"]);
    expect(mocks.queuePlanReminder).toHaveBeenCalled();
    expect(mocks.queueDailySummary).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("skips only the summary when the close fails, since its counts depend on it", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "deadlock" } });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errors).toEqual(["close: deadlock"]);
    expect(mocks.queueDailySummary).not.toHaveBeenCalled();
    expect(mocks.buildCleaningWeek).toHaveBeenCalled();
    expect(mocks.queuePlanReminder).toHaveBeenCalled();
  });

  it("posts each week it just published, and only from 6am", async () => {
    mocks.publishSelect.mockResolvedValue({ data: [{ week_start: "2026-10-26" }], error: null });

    const morning = await GET(request());
    expect(morning.status).toBe(200);
    expect(mocks.queueWeekPublished).toHaveBeenCalledWith(expect.anything(), "2026-10-26");

    mocks.queueWeekPublished.mockClear();
    mocks.clock = { ...mocks.clock, timeOfDay: "00:05:00" };
    await GET(request());
    expect(mocks.publishSelect).toHaveBeenCalledTimes(1);
    expect(mocks.queueWeekPublished).not.toHaveBeenCalled();
    mocks.clock = { ...mocks.clock, timeOfDay: "10:05:00" };
  });

  it("reports a failed alert as a 500 so it shows in the logs", async () => {
    mocks.queuePlanReminder.mockResolvedValue({ status: "error", error: "insert failed" });
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect((await res.json()).errors).toEqual(["plan reminder: insert failed"]);
  });
});
