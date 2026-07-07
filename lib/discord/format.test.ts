import { describe, expect, it } from "vitest";

import { buildDiscordMessage } from "./format";

describe("buildDiscordMessage", () => {
  it("builds a message with title and detail", () => {
    const msg = buildDiscordMessage("maint_request", {
      title: "Walk-in freezer won't cool",
      message: "Reported by Jamie",
    });
    expect(msg.content).toContain("Walk-in freezer won't cool");
    expect(msg.content).toContain("Reported by Jamie");
    expect(msg.content).toContain("🔧");
  });

  it("embeds an @mention when a discord id is provided", () => {
    const msg = buildDiscordMessage(
      "setup_posted",
      { title: "You're on Register" },
      { recipientDiscordId: "123456789" },
    );
    expect(msg.content).toContain("<@123456789>");
  });

  it("omits the mention when no discord id is available", () => {
    const msg = buildDiscordMessage("setup_posted", { title: "You're on Register" });
    expect(msg.content).not.toContain("<@");
  });

  describe("accountability privacy rule", () => {
    it("redacts infraction_issued regardless of payload content", () => {
      const msg = buildDiscordMessage(
        "infraction_issued",
        { title: "3 points — tardy", points: 3, infractionType: "tardiness" },
        { recipientName: "Jamie Rivera", recipientDiscordId: "999" },
      );
      expect(msg.content).toBe("⚠️ Jamie Rivera received an infraction.");
      expect(msg.content).not.toContain("point");
      expect(msg.content).not.toContain("tardiness");
      // Even accountability posts never @mention — the leaders channel sees
      // a name, not a ping that could draw attention publicly.
      expect(msg.content).not.toContain("<@");
    });

    it("redacts disciplinary_triggered regardless of payload content", () => {
      const msg = buildDiscordMessage(
        "disciplinary_triggered",
        { title: "Written warning", detail: "12 points accumulated" },
        { recipientName: "Alex Chen" },
      );
      expect(msg.content).toBe("⚠️ Alex Chen reached a disciplinary threshold.");
    });

    it("falls back to a generic name when none is supplied", () => {
      const msg = buildDiscordMessage("infraction_issued", {});
      expect(msg.content).toBe("⚠️ Someone received an infraction.");
    });
  });
});
