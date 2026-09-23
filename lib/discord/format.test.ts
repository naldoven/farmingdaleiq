import { describe, expect, it } from "vitest";

import { DISCORD_ROUTABLE_EVENT_KEYS, buildDiscordMessage } from "./format";

describe("buildDiscordMessage", () => {
  it("does not advertise dormant feature routes", () => {
    expect(DISCORD_ROUTABLE_EVENT_KEYS).not.toContain("broadcast");
    expect(DISCORD_ROUTABLE_EVENT_KEYS).not.toContain("break_overdue");
  });

  it("never routes accountability events to Discord", () => {
    expect(DISCORD_ROUTABLE_EVENT_KEYS).not.toContain("infraction_issued");
    expect(DISCORD_ROUTABLE_EVENT_KEYS).not.toContain("disciplinary_triggered");
  });

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
      expect(msg.content).toBe("⚠️ A private accountability event was recorded in FarmingdaleIQ.");
      expect(msg.content).not.toContain("point");
      expect(msg.content).not.toContain("tardiness");
      expect(msg.content).not.toContain("Jamie Rivera");
      expect(msg.content).not.toContain("<@");
    });

    it("redacts disciplinary_triggered regardless of payload content", () => {
      const msg = buildDiscordMessage(
        "disciplinary_triggered",
        { title: "Written warning", detail: "12 points accumulated" },
        { recipientName: "Alex Chen" },
      );
      expect(msg.content).toBe("⚠️ A private accountability event was recorded in FarmingdaleIQ.");
      expect(msg.content).not.toContain("Alex Chen");
    });

    it("does not disclose an identity when none is supplied", () => {
      const msg = buildDiscordMessage("infraction_issued", {});
      expect(msg.content).toBe("⚠️ A private accountability event was recorded in FarmingdaleIQ.");
    });
  });
});
