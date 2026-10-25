import { describe, expect, it } from "vitest";

import { DISCORD_CONTENT_MAX_CHARS, DISCORD_ROUTABLE_EVENT_KEYS, buildDiscordMessage } from "./format";

// 18 digits, the usual length of a Discord user id (snowflake).
const VALID_ID = "123456789012345678";

describe("buildDiscordMessage", () => {
  it("routes the woken modules' events (broadcast, break_overdue)", () => {
    expect(DISCORD_ROUTABLE_EVENT_KEYS).toContain("broadcast");
    expect(DISCORD_ROUTABLE_EVENT_KEYS).toContain("break_overdue");
  });

  it("clamps a 2000-character broadcast so Discord does not reject the post", () => {
    const body = "x".repeat(2000);
    const msg = buildDiscordMessage("broadcast", { body });
    expect(msg.content.length).toBeLessThanOrEqual(DISCORD_CONTENT_MAX_CHARS);
    expect(msg.content.startsWith("📣 **Announcement**")).toBe(true);
    expect(msg.content.endsWith("…")).toBe(true);
    expect(msg.allowed_mentions).toEqual({ parse: [] });
  });

  it("keeps the recipient mention when clamping", () => {
    const body = "y".repeat(2000);
    const msg = buildDiscordMessage("recognition", { body }, { recipientDiscordId: VALID_ID });
    expect(msg.content.length).toBeLessThanOrEqual(DISCORD_CONTENT_MAX_CHARS);
    expect(msg.content.endsWith(`<@${VALID_ID}>`)).toBe(true);
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

  it("joins title, detail and mention with plain colons, never an em dash", () => {
    const plain = buildDiscordMessage("maint_request", {
      title: "Walk-in freezer won't cool",
      message: "Reported by Jamie",
    });
    expect(plain.content).toBe("🔧 **Walk-in freezer won't cool**: Reported by Jamie");

    const mentioned = buildDiscordMessage(
      "recognition",
      { title: "Great shift", message: "Thanks for covering" },
      { recipientDiscordId: VALID_ID },
    );
    expect(mentioned.content).toBe(`🎉 **Great shift**: Thanks for covering: <@${VALID_ID}>`);

    const titleOnly = buildDiscordMessage("equipment_down", { title: "Fryer #2 down" });
    expect(titleOnly.content).toBe("🔴 **Fryer #2 down**");

    for (const msg of [plain, mentioned, titleOnly]) {
      expect(msg.content).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("embeds an @mention when a discord id is provided", () => {
    const msg = buildDiscordMessage(
      "setup_posted",
      { title: "You're on Register" },
      { recipientDiscordId: VALID_ID },
    );
    expect(msg.content).toContain(`<@${VALID_ID}>`);
  });

  it("omits the mention when no discord id is available", () => {
    const msg = buildDiscordMessage("setup_posted", { title: "You're on Register" });
    expect(msg.content).not.toContain("<@");
  });

  describe("allowed_mentions (no free-text pings)", () => {
    it("allows no pings at all when there is no recipient", () => {
      const msg = buildDiscordMessage("maint_request", { title: "Walk-in freezer won't cool" });
      expect(msg.allowed_mentions).toEqual({ parse: [] });
    });

    it("treats an empty or null discord id as no recipient", () => {
      for (const recipientDiscordId of ["", null, undefined]) {
        const msg = buildDiscordMessage("setup_posted", { title: "x" }, { recipientDiscordId });
        expect(msg.allowed_mentions).toEqual({ parse: [] });
      }
    });

    it("re-allows only the recipient's id, with nothing parsed from content", () => {
      const msg = buildDiscordMessage(
        "setup_posted",
        { title: "You're on Register" },
        { recipientDiscordId: VALID_ID },
      );
      expect(msg.allowed_mentions).toEqual({ parse: [], users: [VALID_ID] });
    });

    it("sends a plain no-ping post when the stored id is not a numeric snowflake", () => {
      // A username or a short number would make Discord reject the whole
      // webhook message with a 400, so the post goes out without a mention.
      for (const recipientDiscordId of ["jamie", "@jamie", "1234567890", "12345678901234x6"]) {
        const msg = buildDiscordMessage(
          "recognition",
          { title: "Great shift" },
          { recipientDiscordId },
        );
        expect(msg.content).toContain("Great shift");
        expect(msg.content).not.toContain("<@");
        expect(msg.content).not.toContain(recipientDiscordId);
        expect(msg.allowed_mentions).toEqual({ parse: [] });
      }
    });

    it("keeps typed @everyone, @here and role pings inert even with a recipient", () => {
      const msg = buildDiscordMessage(
        "recognition",
        { title: "@everyone", message: "@here look <@&987654321> <@555>" },
        { recipientDiscordId: VALID_ID },
      );
      // The text still reads as typed; Discord just must not act on it.
      expect(msg.content).toContain("@everyone");
      expect(msg.allowed_mentions?.parse).toEqual([]);
      expect(msg.allowed_mentions?.users).toEqual([VALID_ID]);
    });

    it("allows no pings on the privacy-redacted branch, even with a recipient", () => {
      const msg = buildDiscordMessage(
        "infraction_issued",
        { title: "@everyone" },
        { recipientDiscordId: VALID_ID },
      );
      expect(msg.allowed_mentions).toEqual({ parse: [] });
    });
  });

  describe("accountability privacy rule", () => {
    it("redacts infraction_issued regardless of payload content", () => {
      const msg = buildDiscordMessage(
        "infraction_issued",
        { title: "3 points — tardy", points: 3, infractionType: "tardiness" },
        { recipientName: "Jamie Rivera", recipientDiscordId: VALID_ID },
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
