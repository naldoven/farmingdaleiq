import { describe, expect, it } from "vitest";

import { buildNotificationContent } from "./templates";

describe("buildNotificationContent", () => {
  it("prefers payload title/body/link over defaults", () => {
    const content = buildNotificationContent("task_assigned", {
      title: "Clean the fryer",
      body: "Due by 5pm",
      link: "/tasks/42",
    });
    expect(content).toEqual({ title: "Clean the fryer", body: "Due by 5pm", link: "/tasks/42" });
  });

  it("falls back to defaults when payload has no title/body/link", () => {
    const content = buildNotificationContent("setup_posted", {});
    expect(content.title).toBe("You're on the schedule");
    expect(content.link).toBe("/setups");
    expect(content.body).toBeUndefined();
  });

  it("accepts message/url as aliases for body/link", () => {
    const content = buildNotificationContent("recognition", {
      message: "Great job today!",
      url: "/team/42",
    });
    expect(content.body).toBe("Great job today!");
    expect(content.link).toBe("/team/42");
  });

  describe("privacy rule for accountability events", () => {
    it("never surfaces infraction payload detail, even if the producer includes it", () => {
      const content = buildNotificationContent("infraction_issued", {
        title: "3 points — tardy",
        body: "You were late twice this week",
        infractionType: "tardiness",
        points: 3,
      });
      expect(content.title).toBe("You received an infraction");
      expect(content.body).toBeUndefined();
      expect(content.link).toBe("/accountability");
    });

    it("never surfaces disciplinary payload detail", () => {
      const content = buildNotificationContent("disciplinary_triggered", {
        title: "Written warning issued",
        body: "Reached 12 points",
      });
      expect(content.title).toBe("A disciplinary action was issued");
      expect(content.body).toBeUndefined();
    });
  });
});
