import { describe, expect, it } from "vitest";
import {
  addEquipmentFileSchema,
  equipmentSchema,
  pmScheduleSchema,
  setEquipmentStatusSchema,
  setPmScheduleActiveSchema,
  updateEquipmentSchema,
  updatePmScheduleSchema,
} from "./validation";

describe("equipmentSchema", () => {
  it("requires a name", () => {
    const result = equipmentSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal equipment record with everything else optional", () => {
    const result = equipmentSchema.safeParse({ name: "Walk-in freezer" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
      expect(result.data.serviceVendorId).toBeUndefined();
    }
  });

  it("rejects an invalid serviceVendorId", () => {
    const result = equipmentSchema.safeParse({ name: "Fryer", serviceVendorId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("treats blank optional strings as omitted rather than empty", () => {
    const result = equipmentSchema.safeParse({ name: "Fryer", category: "", notes: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });
});

describe("updateEquipmentSchema", () => {
  it("requires a valid id in addition to the base fields", () => {
    const result = updateEquipmentSchema.safeParse({ id: "not-a-uuid", name: "Fryer" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid update", () => {
    const result = updateEquipmentSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000000",
      name: "Fryer",
    });
    expect(result.success).toBe(true);
  });
});

describe("setEquipmentStatusSchema", () => {
  it("rejects a status outside operational/down", () => {
    const result = setEquipmentStatusSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      status: "broken",
    });
    expect(result.success).toBe(false);
  });

  it("accepts marking equipment down with an optional work order link", () => {
    const result = setEquipmentStatusSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      status: "down",
      workOrderId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
  });
});

describe("addEquipmentFileSchema", () => {
  it("requires a non-empty fileUrl", () => {
    const result = addEquipmentFileSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      fileUrl: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a file with an optional label", () => {
    const result = addEquipmentFileSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      fileUrl: "https://example.com/manual.pdf",
      label: "Owner's manual",
    });
    expect(result.success).toBe(true);
  });
});

describe("pmScheduleSchema", () => {
  it("requires a positive intervalDays", () => {
    const result = pmScheduleSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it("coerces string interval/lead days from a plain form input", () => {
    const result = pmScheduleSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: "90",
      leadDays: "7",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intervalDays).toBe(90);
      expect(result.data.leadDays).toBe(7);
    }
  });

  it("defaults leadDays to 0 and active to true when omitted", () => {
    const result = pmScheduleSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: 90,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.leadDays).toBe(0);
      expect(result.data.active).toBe(true);
    }
  });

  it("rejects a negative leadDays", () => {
    const result = pmScheduleSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: 90,
      leadDays: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional checklist template attachment", () => {
    const result = pmScheduleSchema.safeParse({
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: 90,
      checklistTemplateId: "00000000-0000-4000-8000-000000000002",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checklistTemplateId).toBe("00000000-0000-4000-8000-000000000002");
    }
  });
});

describe("updatePmScheduleSchema", () => {
  it("requires a valid id alongside the base schedule fields", () => {
    const result = updatePmScheduleSchema.safeParse({
      id: "not-a-uuid",
      equipmentId: "00000000-0000-0000-0000-000000000000",
      title: "Hood cleaning",
      intervalDays: 90,
    });
    expect(result.success).toBe(false);
  });
});

describe("setPmScheduleActiveSchema", () => {
  it("requires a boolean active flag", () => {
    const result = setPmScheduleActiveSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000000",
      active: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("accepts toggling a schedule inactive", () => {
    const result = setPmScheduleActiveSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000000",
      active: false,
    });
    expect(result.success).toBe(true);
  });
});
