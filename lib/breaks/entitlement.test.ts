import { describe, expect, it } from "vitest";

import {
  ageBandFromBirthdate,
  authorizationToStartLagMinutes,
  buildBreakPlan,
  canTransition,
  computeBreakDueAt,
  entitledMinutesForKind,
  expandRuleToBreaks,
  isMissed,
  isOverdue,
  selectBreakRule,
  type BreakRule,
} from "./entitlement";

const NOW = new Date("2026-07-07T12:00:00-04:00");

// Mirrors supabase/migrations/20260707001900_seed_store_config.sql.
const ADULT_RULE: BreakRule = {
  id: "rule-adult",
  min_shift_minutes: 360,
  max_shift_minutes: 1440,
  age_band: "adult",
  rest_minutes_paid: 0,
  meal_minutes_unpaid: 30,
  sort: 1,
};

const MINOR_RULE: BreakRule = {
  id: "rule-minor",
  min_shift_minutes: 240,
  max_shift_minutes: 1440,
  age_band: "minor",
  rest_minutes_paid: 0,
  meal_minutes_unpaid: 30,
  sort: 10,
};

const RULES = [ADULT_RULE, MINOR_RULE];

describe("ageBandFromBirthdate", () => {
  it("is minor for under 18", () => {
    expect(ageBandFromBirthdate("2009-12-01", NOW)).toBe("minor");
  });

  it("is adult for 18+", () => {
    expect(ageBandFromBirthdate("2000-01-01", NOW)).toBe("adult");
  });

  it("defaults to adult when birthdate is missing", () => {
    expect(ageBandFromBirthdate(null, NOW)).toBe("adult");
  });
});

describe("selectBreakRule", () => {
  it("picks the adult rule for a 6-hour adult shift", () => {
    expect(selectBreakRule(RULES, "adult", 360)?.id).toBe("rule-adult");
  });

  it("returns null when the shift is shorter than any rule's minimum", () => {
    expect(selectBreakRule(RULES, "adult", 200)).toBeNull();
  });

  it("picks the minor rule for a 5-hour minor shift", () => {
    expect(selectBreakRule(RULES, "minor", 300)?.id).toBe("rule-minor");
  });

  it("picks the lowest-sort rule when multiple candidates match", () => {
    const duplicate: BreakRule = { ...ADULT_RULE, id: "rule-adult-2", sort: 5 };
    expect(selectBreakRule([duplicate, ADULT_RULE], "adult", 400)?.id).toBe("rule-adult");
  });
});

describe("expandRuleToBreaks", () => {
  it("expands a meal-only rule to a single meal break", () => {
    const planned = expandRuleToBreaks("user-1", ADULT_RULE);
    expect(planned).toEqual([{ userId: "user-1", ruleId: "rule-adult", kind: "meal", minutes: 30 }]);
  });

  it("expands a rule with both rest and meal minutes to two breaks", () => {
    const both: BreakRule = { ...ADULT_RULE, rest_minutes_paid: 10 };
    const planned = expandRuleToBreaks("user-1", both);
    expect(planned).toEqual([
      { userId: "user-1", ruleId: "rule-adult", kind: "rest", minutes: 10 },
      { userId: "user-1", ruleId: "rule-adult", kind: "meal", minutes: 30 },
    ]);
  });

  it("produces no breaks for a rule with zero minutes on both fields", () => {
    const zero: BreakRule = { ...ADULT_RULE, meal_minutes_unpaid: 0 };
    expect(expandRuleToBreaks("user-1", zero)).toEqual([]);
  });
});

describe("buildBreakPlan", () => {
  it("sequences by arrival time, earliest first", () => {
    const plan = buildBreakPlan(
      [
        { userId: "late", arrivalTime: new Date("2026-07-07T09:00:00-04:00"), birthdate: null, shiftMinutes: 480 },
        { userId: "early", arrivalTime: new Date("2026-07-07T06:00:00-04:00"), birthdate: null, shiftMinutes: 480 },
      ],
      RULES,
      NOW,
    );
    expect(plan.map((p) => p.userId)).toEqual(["early", "late"]);
    expect(plan.map((p) => p.sequence)).toEqual([1, 2]);
  });

  it("puts assignments without an arrival time last", () => {
    const plan = buildBreakPlan(
      [
        { userId: "no-arrival", arrivalTime: null, birthdate: null, shiftMinutes: 480 },
        { userId: "has-arrival", arrivalTime: new Date("2026-07-07T06:00:00-04:00"), birthdate: null, shiftMinutes: 480 },
      ],
      RULES,
      NOW,
    );
    expect(plan.map((p) => p.userId)).toEqual(["has-arrival", "no-arrival"]);
  });

  it("skips an assignment whose shift is too short for any rule", () => {
    const plan = buildBreakPlan(
      [{ userId: "short-shift", arrivalTime: new Date(), birthdate: null, shiftMinutes: 60 }],
      RULES,
      NOW,
    );
    expect(plan).toEqual([]);
  });
});

describe("isOverdue", () => {
  it("is false unless status is authorized", () => {
    expect(isOverdue({ status: "pending", authorized_at: null }, NOW)).toBe(false);
  });

  it("is false within the grace window", () => {
    const authorizedAt = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(isOverdue({ status: "authorized", authorized_at: authorizedAt }, NOW)).toBe(false);
  });

  it("is true past the grace window", () => {
    const authorizedAt = new Date(NOW.getTime() - 15 * 60_000).toISOString();
    expect(isOverdue({ status: "authorized", authorized_at: authorizedAt }, NOW)).toBe(true);
  });
});

describe("isMissed", () => {
  it("is true when the shift ended and the break never started", () => {
    const shiftEnd = new Date(NOW.getTime() - 60_000);
    expect(isMissed({ status: "pending", authorized_at: null }, shiftEnd, NOW)).toBe(true);
  });

  it("is false once the break is active or completed", () => {
    const shiftEnd = new Date(NOW.getTime() - 60_000);
    expect(isMissed({ status: "active", authorized_at: null }, shiftEnd, NOW)).toBe(false);
    expect(isMissed({ status: "completed", authorized_at: null }, shiftEnd, NOW)).toBe(false);
  });

  it("is false before the shift ends", () => {
    const shiftEnd = new Date(NOW.getTime() + 60_000);
    expect(isMissed({ status: "pending", authorized_at: null }, shiftEnd, NOW)).toBe(false);
  });
});

describe("computeBreakDueAt", () => {
  it("is arrival time plus the rule's min_shift_minutes", () => {
    const arrival = new Date("2026-07-07T06:00:00-04:00");
    const dueAt = computeBreakDueAt(arrival, ADULT_RULE);
    expect(dueAt?.toISOString()).toBe(new Date(arrival.getTime() + 360 * 60_000).toISOString());
  });

  it("is null with no arrival time", () => {
    expect(computeBreakDueAt(null, ADULT_RULE)).toBeNull();
  });

  it("is null with no matched rule", () => {
    expect(computeBreakDueAt(new Date(), null)).toBeNull();
  });
});

describe("entitledMinutesForKind", () => {
  it("returns meal_minutes_unpaid for a meal break", () => {
    expect(entitledMinutesForKind(ADULT_RULE, "meal")).toBe(30);
  });

  it("returns rest_minutes_paid for a rest break", () => {
    const both: BreakRule = { ...ADULT_RULE, rest_minutes_paid: 10 };
    expect(entitledMinutesForKind(both, "rest")).toBe(10);
  });

  it("is null with no rule", () => {
    expect(entitledMinutesForKind(null, "meal")).toBeNull();
  });
});

describe("authorizationToStartLagMinutes", () => {
  it("computes the minutes between authorized_at and started_at", () => {
    const authorizedAt = "2026-07-07T12:00:00-04:00";
    const startedAt = "2026-07-07T12:07:00-04:00";
    expect(authorizationToStartLagMinutes(authorizedAt, startedAt)).toBe(7);
  });

  it("is null until both timestamps exist", () => {
    expect(authorizationToStartLagMinutes(null, null)).toBeNull();
    expect(authorizationToStartLagMinutes("2026-07-07T12:00:00-04:00", null)).toBeNull();
  });
});

describe("canTransition (idempotency guard)", () => {
  it("allows pending -> authorized", () => {
    expect(canTransition("pending", "authorized")).toBe(true);
  });

  it("allows authorized -> active", () => {
    expect(canTransition("authorized", "active")).toBe(true);
  });

  it("allows active -> completed", () => {
    expect(canTransition("active", "completed")).toBe(true);
  });

  it("rejects re-authorizing an already-authorized break (double submit)", () => {
    expect(canTransition("authorized", "authorized")).toBe(false);
  });

  it("rejects completing a break that was never started", () => {
    expect(canTransition("pending", "completed")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(canTransition("completed", "active")).toBe(false);
    expect(canTransition("missed", "authorized")).toBe(false);
  });
});
