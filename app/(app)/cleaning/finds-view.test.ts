import { describe, expect, it } from "vitest";

import {
  buildFindsView,
  postableZones,
  postedLabel,
  type FindLike,
  type FindsViewInput,
  type ZoneLike,
} from "@/app/(app)/cleaning/finds-view";

const ZONES: ZoneLike[] = [
  { id: "z-front", name: "Front counter", color: "#2563EB", side: "foh", sort: 1, active: true },
  { id: "z-fryer", name: "Fryer line", color: "#E51636", side: "boh", sort: 3, active: true },
  { id: "z-walk", name: "Walk-in", color: "#16A34A", side: "boh", sort: 2, active: true },
  { id: "z-old", name: "Patio", color: "#F59E0B", side: "foh", sort: 4, active: false },
];

function find(overrides: Partial<FindLike> = {}): FindLike {
  return {
    id: "f1",
    zone_id: "z-fryer",
    note: "Grease behind the fryer",
    photo_path: "finds/f1.jpg",
    posted_by: "u-maria",
    // 19:42Z on Oct 26 is 3:42 PM Eastern (daylight time).
    posted_at: "2026-10-26T19:42:00Z",
    converted_item_id: null,
    ...overrides,
  };
}

function input(finds: FindLike[], overrides: Partial<FindsViewInput> = {}): FindsViewInput {
  return {
    finds,
    zones: new Map(ZONES.map((z) => [z.id, z])),
    people: new Map([["u-maria", "Maria Lopez"]]),
    photoUrls: new Map([["finds/f1.jpg", "https://signed/f1"]]),
    canPlan: false,
    ...overrides,
  };
}

describe("postedLabel", () => {
  it("reads the day and time in store time", () => {
    expect(postedLabel("2026-10-26T19:42:00Z")).toBe("Mon Oct 26, 3:42 PM");
  });

  it("uses the store's day, not the server's: 9pm Eastern is already tomorrow in UTC", () => {
    expect(postedLabel("2026-10-27T01:15:00Z")).toBe("Mon Oct 26, 9:15 PM");
  });

  it("follows winter time too", () => {
    expect(postedLabel("2026-12-14T15:05:00Z")).toBe("Mon Dec 14, 10:05 AM");
  });

  it("gives nothing for a time it cannot read", () => {
    expect(postedLabel("not a date")).toBe("");
  });
});

describe("postableZones", () => {
  it("keeps active areas only, back of house first, each side in the zones' own order", () => {
    expect(postableZones(ZONES).map((z) => z.name)).toEqual(["Walk-in", "Fryer line", "Front counter"]);
  });

  it("hands the client only what it draws", () => {
    expect(postableZones(ZONES)[0]).toEqual({ id: "z-walk", name: "Walk-in", color: "#16A34A", side: "boh" });
  });
});

describe("buildFindsView", () => {
  it("shapes a find with its area, note, first name, store time and photo", () => {
    const [card] = buildFindsView(input([find()]));
    expect(card).toMatchObject({
      id: "f1",
      zoneId: "z-fryer",
      zoneName: "Fryer line",
      zoneColor: "#E51636",
      note: "Grease behind the fryer",
      postedBy: "Maria",
      postedText: "Posted Mon Oct 26, 3:42 PM by Maria",
      photoUrl: "https://signed/f1",
      photoMissing: false,
      itemHref: null,
    });
  });

  it("lists the newest first, whatever order the rows arrive in", () => {
    const older = find({ id: "f-old", posted_at: "2026-10-25T15:00:00Z" });
    const newer = find({ id: "f-new", posted_at: "2026-10-26T15:00:00Z" });
    expect(buildFindsView(input([older, newer])).map((c) => c.id)).toEqual(["f-new", "f-old"]);
  });

  it("drops the name when the poster's profile did not load", () => {
    const [card] = buildFindsView(input([find({ posted_by: "u-gone" })]));
    expect(card!.postedBy).toBeNull();
    expect(card!.postedText).toBe("Posted Mon Oct 26, 3:42 PM");
  });

  it("flags a photo whose signed link did not come back", () => {
    const [card] = buildFindsView(input([find()], { photoUrls: new Map() }));
    expect(card).toMatchObject({ photoUrl: null, photoMissing: true });
  });

  it("still names an area that has since been switched off", () => {
    const [card] = buildFindsView(input([find({ zone_id: "z-old" })]));
    expect(card!.zoneName).toBe("Patio");
  });

  it("falls back for an area that no longer exists", () => {
    const [card] = buildFindsView(input([find({ zone_id: "z-gone" })]));
    expect(card).toMatchObject({ zoneName: "No area", zoneColor: "#9CA3AF" });
  });

  it("links a find that became an item to that item", () => {
    const [card] = buildFindsView(input([find({ converted_item_id: "item-9" })], { canPlan: true }));
    expect(card!.itemHref).toBe("/cleaning/items/item-9");
  });

  it("offers a planner Add and Delete on an unconverted find only", () => {
    const [open, done] = buildFindsView(
      input([find({ id: "f-open" }), find({ id: "f-done", converted_item_id: "item-9", posted_at: "2026-10-25T15:00:00Z" })], {
        canPlan: true,
      }),
    );
    expect(open).toMatchObject({ canConvert: true, canDelete: true });
    expect(done).toMatchObject({ canConvert: false, canDelete: false });
  });

  it("offers a leader who is not a planner nothing to change", () => {
    const [card] = buildFindsView(input([find()], { canPlan: false }));
    expect(card).toMatchObject({ canConvert: false, canDelete: false });
  });
});
