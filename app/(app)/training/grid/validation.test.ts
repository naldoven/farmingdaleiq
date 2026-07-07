import { describe, expect, it } from "vitest";

import { cycleStationSchema, enrollTraineeSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("enrollTraineeSchema", () => {
  it("requires uuids", () => {
    expect(enrollTraineeSchema.safeParse({ userId: uuid, roadmapId: uuid }).success).toBe(true);
    expect(enrollTraineeSchema.safeParse({ userId: "x", roadmapId: uuid }).success).toBe(false);
  });
});

describe("cycleStationSchema", () => {
  it("requires uuids", () => {
    expect(cycleStationSchema.safeParse({ enrollmentId: uuid, roadmapStationId: uuid }).success).toBe(true);
  });
});
