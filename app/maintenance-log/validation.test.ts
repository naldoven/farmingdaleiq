import { describe, expect, it } from "vitest";

import { publicMaintenanceRequestSchema } from "./validation";

describe("publicMaintenanceRequestSchema", () => {
  const valid = {
    submissionId: "00000000-0000-4000-8000-000000000001",
    title: "Ice machine is leaking",
  };

  it("accepts an anonymous request with a stable submission id", () => {
    const result = publicMaintenanceRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.photoUrls).toEqual([]);
  });

  it("rejects a request without a title or valid submission id", () => {
    expect(publicMaintenanceRequestSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
    expect(publicMaintenanceRequestSchema.safeParse({ ...valid, submissionId: "not-a-uuid" }).success).toBe(false);
  });

  it("limits the public request to six photos", () => {
    expect(
      publicMaintenanceRequestSchema.safeParse({
        ...valid,
        photoUrls: Array.from({ length: 7 }, (_, index) => `https://example.com/${index}.jpg`),
      }).success,
    ).toBe(false);
  });
});
