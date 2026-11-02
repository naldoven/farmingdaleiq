import { describe, expect, it } from "vitest";

import type { RecoverySendView } from "@/app/(app)/guest-recovery/types";
import {
  daysOwed,
  matchesSearch,
  nothingReachedGuest,
  outcomeMessage,
  sendOutcomeSummary,
  summarizeChannel,
  timeAgo,
} from "@/app/(app)/guest-recovery/view";

const NOW = new Date("2026-10-22T20:00:00.000Z");

function send(over: Partial<RecoverySendView>): RecoverySendView {
  return {
    id: "s",
    channel: "email",
    kind: "initial",
    status: "sent",
    error: null,
    createdAt: "2026-10-22T19:00:00.000Z",
    sentAt: "2026-10-22T19:00:05.000Z",
    ...over,
  };
}

describe("summarizeChannel", () => {
  it("says there is no contact for a channel the guest did not give", () => {
    expect(summarizeChannel("sms", [], false, NOW)).toMatchObject({ state: "none", label: "No phone given" });
  });

  it("shows sent when the newest send went out", () => {
    expect(summarizeChannel("email", [send({})], true, NOW)).toMatchObject({ state: "sent", sentAt: "2026-10-22T19:00:05.000Z" });
  });

  it("lets a newer failed resend show over an older success", () => {
    const sends = [send({}), send({ id: "s2", kind: "resend", status: "failed", error: "Bad key", createdAt: "2026-10-22T19:30:00.000Z", sentAt: null })];
    expect(summarizeChannel("email", sends, true, NOW).state).toBe("failed");
  });

  it("calls a send stuck on sending for over two minutes unknown, not failed", () => {
    const stuck = send({ status: "sending", sentAt: null, createdAt: "2026-10-22T19:00:00.000Z" });
    expect(summarizeChannel("email", [stuck], true, NOW).state).toBe("unknown");
    const fresh = send({ status: "sending", sentAt: null, createdAt: "2026-10-22T19:59:30.000Z" });
    expect(summarizeChannel("email", [fresh], true, NOW).state).toBe("none");
  });

  it("treats a thrown-provider failure as unknown so nobody resends blindly", () => {
    const unknown = send({ channel: "sms", status: "failed", error: "Unknown: the request may have gone out.", sentAt: null });
    expect(summarizeChannel("sms", [unknown], true, NOW).state).toBe("unknown");
  });

  it("shows the skip reason for a text that was switched off", () => {
    const skipped = send({ channel: "sms", status: "skipped", error: "Texting is not turned on yet.", sentAt: null });
    expect(summarizeChannel("sms", [skipped], true, NOW)).toMatchObject({ state: "skipped", label: "Texting is not turned on yet." });
  });
});

describe("nothingReachedGuest", () => {
  it("is true until any send succeeds", () => {
    expect(nothingReachedGuest({ sends: [] })).toBe(true);
    expect(nothingReachedGuest({ sends: [send({ status: "failed" })] })).toBe(true);
    expect(nothingReachedGuest({ sends: [send({})] })).toBe(false);
  });
});

describe("outcomeMessage", () => {
  it("explains a second scan instead of failing", () => {
    expect(outcomeMessage("give", "already_given")).toEqual({ ok: true, message: "Already handed over. Nothing changed." });
  });

  it("refuses to hand over a voided recovery and to void a handed-over one", () => {
    expect(outcomeMessage("give", "void").ok).toBe(false);
    expect(outcomeMessage("void", "given").ok).toBe(false);
  });
});

describe("sendOutcomeSummary", () => {
  it("covers sent, failed, already sent and nothing", () => {
    expect(sendOutcomeSummary([{ channel: "email", result: "sent" }, { channel: "sms", result: "sent" }])).toBe("Guest emailed and texted.");
    expect(sendOutcomeSummary([{ channel: "email", result: "failed", reason: "x" }])).toMatch(/Email did not send/);
    expect(sendOutcomeSummary([{ channel: "email", result: "already_sent" }])).toBe("Already saved and sent.");
    expect(sendOutcomeSummary([])).toMatch(/Nothing was sent yet/);
  });
});

describe("timeAgo and daysOwed", () => {
  it("rounds down to the largest unit", () => {
    expect(timeAgo("2026-10-22T19:59:40.000Z", NOW)).toBe("just now");
    expect(timeAgo("2026-10-22T19:55:00.000Z", NOW)).toBe("5 min ago");
    expect(timeAgo("2026-10-22T17:00:00.000Z", NOW)).toBe("3 hr ago");
    expect(timeAgo("2026-10-19T20:00:00.000Z", NOW)).toBe("3 days ago");
    expect(daysOwed("2026-10-14T19:00:00.000Z", NOW)).toBe(8);
  });
});

describe("matchesSearch", () => {
  const recovery = { guestName: "Nolan Patrick", orderNumber: "8407578" };
  it("matches name or order number, ignoring case, and everything when blank", () => {
    expect(matchesSearch(recovery, "nolan")).toBe(true);
    expect(matchesSearch(recovery, "8407")).toBe(true);
    expect(matchesSearch(recovery, "zzz")).toBe(false);
    expect(matchesSearch(recovery, "  ")).toBe(true);
  });
});
