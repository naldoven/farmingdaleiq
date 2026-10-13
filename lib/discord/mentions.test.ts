import { describe, expect, it } from "vitest";

import { neutralizeDiscordMentions } from "./mentions";

describe("neutralizeDiscordMentions", () => {
  it("breaks @everyone, @here, user and role pings", () => {
    const out = neutralizeDiscordMentions("hi @everyone @here <@123> <@&456>");
    expect(out).not.toMatch(/@everyone|@here|<@\d|<@&\d/);
    expect(out).toBe("hi @​everyone @​here <@​123> <@​&456>");
  });

  it("leaves text without @ untouched", () => {
    expect(neutralizeDiscordMentions("Smith party, 40 guests")).toBe("Smith party, 40 guests");
  });

  it("keeps email addresses readable", () => {
    expect(neutralizeDiscordMentions("jo@example.com")).toBe("jo@​example.com");
  });
});
