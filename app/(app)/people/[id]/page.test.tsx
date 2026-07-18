import { describe, expect, it } from "vitest";

import { assignableRolesForRank, canSeeProfilePII, profileSectionVariant } from "./page";

/**
 * PPL1 + PPL2 gating helpers used by the /people/[id] server component.
 * Following this repo's page-testing convention (see app/(app)/page.test.tsx):
 * the page's security-relevant decisions are pure exported helpers, unit-tested
 * here; the page renders straight from them.
 */

describe("canSeeProfilePII (PPL2)", () => {
  it("lets the person see their own PII", () => {
    expect(canSeeProfilePII(true, false)).toBe(true);
  });
  it("lets a people.manage holder see anyone's PII", () => {
    expect(canSeeProfilePII(false, true)).toBe(true);
  });
  it("hides PII from a non-self, non-manager coworker", () => {
    expect(canSeeProfilePII(false, false)).toBe(false);
  });
});

describe("profileSectionVariant (PPL2)", () => {
  it("renders the narrow self-service form for the person without people.manage", () => {
    expect(profileSectionVariant(true, false)).toBe("self-edit");
  });
  it("renders the full manager form for a people.manage holder", () => {
    expect(profileSectionVariant(false, true)).toBe("manager-edit");
    expect(profileSectionVariant(true, true)).toBe("manager-edit");
  });
  it("renders the restricted (no-PII) variant for any other viewer", () => {
    // This is the branch that closes the leak: no phone/email/birthdate/
    // hired_on/discord_user_id form is rendered for a non-self, non-manager.
    expect(profileSectionVariant(false, false)).toBe("restricted");
  });
});

describe("assignableRolesForRank (PPL1)", () => {
  const roles = [
    { id: "lm", rank: 1 }, // Location Manager (most senior)
    { id: "dir", rank: 2 },
    { id: "ad", rank: 3 }, // Assistant Director
    { id: "tm", rank: 8 }, // Team Member (junior)
    { id: "unranked", rank: null },
  ];

  it("lets a Location Manager (rank 1) assign every ranked role", () => {
    expect(assignableRolesForRank(roles, 1).map((r) => r.id)).toEqual(["lm", "dir", "ad", "tm"]);
  });

  it("stops an Assistant Director (rank 3) from assigning any role senior to their own", () => {
    // rank 1 (Location Manager) and rank 2 are excluded — no upward escalation.
    expect(assignableRolesForRank(roles, 3).map((r) => r.id)).toEqual(["ad", "tm"]);
  });

  it("offers nothing when the actor has no rank (fail closed)", () => {
    expect(assignableRolesForRank(roles, null)).toEqual([]);
  });

  it("never offers an unranked role", () => {
    expect(assignableRolesForRank(roles, 1).some((r) => r.id === "unranked")).toBe(false);
  });
});
