import { describe, expect, it } from "vitest";

import {
  buildTodayView,
  cardTags,
  firstName,
  focusDate,
  longDateLabel,
  missingSourceIds,
  progressText,
  shortDateLabel,
  visibleAssignments,
  weekdayShort,
  type AssignmentLike,
  type ItemLike,
  type SourceInfo,
  type TodayViewInput,
  type ZoneLike,
} from "./today-view";

// 2026-10-28 is a Wednesday; 2026-10-25 a Sunday.
const WED = "2026-10-28";
const THU = "2026-10-29";
const SUN = "2026-10-25";
const MON = "2026-10-26";

const ZONE_GREEN: ZoneLike = { id: "z-green", name: "Green", color: "#16A34A", sort: 1 };
const ZONE_BLUE: ZoneLike = { id: "z-blue", name: "Blue", color: "#1D4ED8", sort: 3 };

function item(id: string, over: Partial<ItemLike> = {}): ItemLike {
  return { id, name: id, kind: "constant", if_needed: false, zone_id: ZONE_GREEN.id, sort: 0, ...over };
}

function row(id: string, over: Partial<AssignmentLike> = {}): AssignmentLike {
  return {
    id,
    item_id: id,
    date: WED,
    half: "am",
    origin: "constant",
    carried_from_id: null,
    status: "planned",
    skip_reason: null,
    completed_by: null,
    completed_at: null,
    photo_path: null,
    rejected_at: null,
    reject_note: null,
    ...over,
  };
}

function input(rows: AssignmentLike[], items: ItemLike[], over: Partial<TodayViewInput> = {}): TodayViewInput {
  return {
    today: WED,
    assignments: rows,
    items: new Map(items.map((i) => [i.id, i])),
    zones: new Map([ZONE_GREEN, ZONE_BLUE].map((z) => [z.id, z])),
    people: new Map(),
    photoUrls: new Map(),
    sources: new Map(),
    canPlan: false,
    ...over,
  };
}

describe("date labels", () => {
  it("names weekdays from a store-local date string", () => {
    expect(weekdayShort("2026-10-26")).toBe("Mon");
    expect(weekdayShort(WED)).toBe("Wed");
    expect(weekdayShort("2026-10-31")).toBe("Sat");
    expect(weekdayShort(SUN)).toBe("Sun");
  });

  it("builds the header and day labels without touching the server clock", () => {
    expect(longDateLabel(MON)).toBe("Monday, Oct 26");
    expect(longDateLabel("2026-11-01")).toBe("Sunday, Nov 1");
    expect(shortDateLabel(THU)).toBe("Thu Oct 29");
  });

  it("keeps labels right across the daylight-saving change (Nov 1, 2026)", () => {
    expect(weekdayShort("2026-11-01")).toBe("Sun");
    expect(weekdayShort("2026-11-02")).toBe("Mon");
    expect(longDateLabel("2026-11-02")).toBe("Monday, Nov 2");
  });

  it("looks ahead to Monday on a Sunday and stays put otherwise", () => {
    expect(focusDate(SUN)).toBe(MON);
    expect(focusDate(WED)).toBe(WED);
    expect(focusDate("2026-10-31")).toBe("2026-10-31");
  });
});

describe("firstName", () => {
  it("takes the first word and tolerates blanks", () => {
    expect(firstName("Maria Lopez")).toBe("Maria");
    expect(firstName("  Eric  ")).toBe("Eric");
    expect(firstName("")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});

describe("which section a clean lands in", () => {
  it("puts today's AM and PM cleans in their own sections", () => {
    const rows = [row("a", { half: "am" }), row("b", { half: "pm" }), row("c", { half: "am" })];
    const view = buildTodayView(input(rows, [item("a"), item("b"), item("c")]));
    expect(view.am.map((c) => c.id)).toEqual(["a", "c"]);
    expect(view.pm.map((c) => c.id)).toEqual(["b"]);
    expect(view.closed).toBe(false);
    expect(view.dateLabel).toBe("Wednesday, Oct 28");
  });

  it("ignores other days' finished and missed rows, and keeps planned ones for later", () => {
    const rows = [
      row("yesterday-missed", { date: "2026-10-27", status: "missed" }),
      row("yesterday-done", { date: "2026-10-27", status: "done" }),
      row("tomorrow", { date: THU }),
      row("tomorrow-skipped", { date: THU, status: "skipped", skip_reason: "Truck day" }),
      row("today"),
    ];
    const view = buildTodayView(input(rows, rows.map((r) => item(r.item_id))));
    expect(view.am.map((c) => c.id)).toEqual(["today"]);
    expect(view.later.map((g) => g.date)).toEqual([THU]);
    expect(view.later[0]!.cards.map((c) => c.id)).toEqual(["tomorrow"]);
    expect(view.laterCount).toBe(1);
  });

  it("groups later cleans by day, earliest day first, AM before PM", () => {
    const rows = [
      row("fri-pm", { date: "2026-10-30", half: "pm" }),
      row("thu-pm", { date: THU, half: "pm" }),
      row("thu-am", { date: THU, half: "am" }),
    ];
    const view = buildTodayView(input(rows, rows.map((r) => item(r.item_id))));
    expect(view.later.map((g) => [g.label, g.cards.map((c) => c.id)])).toEqual([
      ["Thu Oct 29", ["thu-am", "thu-pm"]],
      ["Fri Oct 30", ["fri-pm"]],
    ]);
    expect(view.laterCount).toBe(3);
  });

  it("counts a clean that is already done today in its section, not under later", () => {
    const rows = [row("done-now", { status: "done", completed_at: "2026-10-28T14:05:00Z" })];
    const view = buildTodayView(input(rows, [item("done-now")]));
    expect(view.am).toHaveLength(1);
    expect(view.later).toEqual([]);
  });
});

describe("sorting", () => {
  it("lists constants first, then the rest, each by zone then master-list order", () => {
    const items = [
      item("var-green", { kind: "variable", sort: 1 }),
      item("const-blue", { kind: "constant", zone_id: ZONE_BLUE.id, sort: 1 }),
      item("const-green-b", { kind: "constant", sort: 5, name: "Boards deep clean" }),
      item("const-green-a", { kind: "constant", sort: 2, name: "Prep shelving" }),
      item("var-blue", { kind: "variable", zone_id: ZONE_BLUE.id, sort: 0 }),
    ];
    const rows = items.map((i) => row(i.id));
    const view = buildTodayView(input(rows, items));
    expect(view.am.map((c) => c.id)).toEqual([
      "const-green-a",
      "const-green-b",
      "const-blue",
      "var-green",
      "var-blue",
    ]);
  });

  it("breaks a sort tie by name so the order never flips between refreshes", () => {
    const items = [item("zeta", { name: "Zeta vent" }), item("alpha", { name: "Alpha vent" })];
    const view = buildTodayView(input(items.map((i) => row(i.id)), items));
    expect(view.am.map((c) => c.itemName)).toEqual(["Alpha vent", "Zeta vent"]);
  });

  it("does not move a card when it is completed", () => {
    const items = [item("a", { sort: 1 }), item("b", { sort: 2 })];
    const before = buildTodayView(input([row("a"), row("b")], items));
    const after = buildTodayView(input([row("a", { status: "done", completed_at: "2026-10-28T13:00:00Z" }), row("b")], items));
    expect(after.am.map((c) => c.id)).toEqual(before.am.map((c) => c.id));
  });

  it("keeps a row whose item or zone went missing instead of dropping the clean", () => {
    const view = buildTodayView(input([row("ghost")], []));
    expect(view.am).toHaveLength(1);
    expect(view.am[0]).toMatchObject({ itemName: "Cleaning item", zoneName: "No zone" });
  });
});

describe("tags", () => {
  const sources = new Map<string, SourceInfo>([
    ["miss-1", { date: WED, reject_note: null }],
    ["rej-1", { date: "2026-10-27", reject_note: "  Still greasy behind the fryer  " }],
  ]);

  it("tags a carry-over with the weekday it was missed", () => {
    const tags = cardTags(row("x", { origin: "carry_over", carried_from_id: "miss-1" }), false, sources);
    expect(tags).toEqual([{ kind: "carry", text: "Carried over from Wed" }]);
  });

  it("tags a redo with the planner's note", () => {
    const tags = cardTags(row("x", { origin: "redo", carried_from_id: "rej-1" }), false, sources);
    expect(tags).toEqual([{ kind: "redo", text: "Redo: Still greasy behind the fryer" }]);
  });

  it("still tags a carry-over or redo whose source row could not be found", () => {
    expect(cardTags(row("x", { origin: "carry_over", carried_from_id: "gone" }), false, sources)).toEqual([
      { kind: "carry", text: "Carried over" },
    ]);
    expect(cardTags(row("x", { origin: "redo", carried_from_id: "gone" }), false, sources)).toEqual([
      { kind: "redo", text: "Redo" },
    ]);
  });

  it("adds If needed last, and tags nothing on a plain constant", () => {
    expect(cardTags(row("x"), false, sources)).toEqual([]);
    expect(cardTags(row("x", { origin: "redo", carried_from_id: "rej-1" }), true, sources).map((t) => t.kind)).toEqual([
      "redo",
      "if_needed",
    ]);
  });

  it("flows through to the card", () => {
    const view = buildTodayView(
      input(
        [row("x", { origin: "carry_over", carried_from_id: "miss-1" })],
        [item("x", { if_needed: true })],
        { sources },
      ),
    );
    expect(view.am[0]!.tags.map((t) => t.text)).toEqual(["Carried over from Wed", "If needed"]);
    expect(view.am[0]!.ifNeeded).toBe(true);
  });
});

describe("status wording", () => {
  const people = new Map([["u1", "Maria Lopez"]]);

  it("shows a planned clean with no status line, so its buttons show", () => {
    const card = buildTodayView(input([row("a")], [item("a")])).am[0]!;
    expect(card.statusText).toBeNull();
    expect(card.status).toBe("planned");
  });

  it("shows who finished it and when, in store time", () => {
    // 19:42Z on Oct 28 is 3:42 PM Eastern (daylight time).
    const done = row("a", { status: "done", completed_by: "u1", completed_at: "2026-10-28T19:42:00Z", photo_path: "done/a.jpg" });
    const card = buildTodayView(input([done], [item("a")], { people })).am[0]!;
    expect(card.statusText).toBe("Done by Maria, 3:42 PM");
    expect(card.statusTone).toBe("success");
  });

  it("still reads cleanly when the person's name could not be loaded", () => {
    const done = row("a", { status: "done", completed_by: "ghost", completed_at: "2026-10-28T19:42:00Z" });
    expect(buildTodayView(input([done], [item("a")], { people })).am[0]!.statusText).toBe("Done, 3:42 PM");
  });

  it("says a not-needed check was checked, with who and when underneath", () => {
    const checked = row("a", { status: "not_needed", completed_by: "u1", completed_at: "2026-10-28T19:42:00Z" });
    const card = buildTodayView(input([checked], [item("a", { if_needed: true })], { people })).am[0]!;
    expect(card.statusText).toBe("Checked, not needed");
    expect(card.detailText).toBe("Maria, 3:42 PM");
  });

  it("shows a skip with its reason and a miss as Missed", () => {
    const skipped = row("s", { status: "skipped", skip_reason: "Truck day" });
    const missed = row("m", { status: "missed" });
    const view = buildTodayView(input([skipped, missed], [item("s"), item("m")]));
    expect(view.am.find((c) => c.id === "s")).toMatchObject({ statusText: "Skipped: Truck day", statusTone: "warning" });
    expect(view.am.find((c) => c.id === "m")).toMatchObject({ statusText: "Missed", statusTone: "danger" });
  });

  it("shows the rejection note on a rejected card", () => {
    const rejected = row("a", {
      status: "done",
      completed_by: "u1",
      completed_at: "2026-10-28T19:42:00Z",
      rejected_at: "2026-10-28T20:00:00Z",
      reject_note: "Vent still dusty",
    });
    const card = buildTodayView(input([rejected], [item("a")], { people, canPlan: true })).am[0]!;
    expect(card.rejectedText).toBe("Rejected: Vent still dusty");
    expect(card.canReject).toBe(false);
  });

  it("resolves the photo URL and flags a photo whose URL did not come back", () => {
    const signed = row("a", { status: "done", photo_path: "done/a.jpg", completed_at: "2026-10-28T19:42:00Z" });
    const lost = row("b", { status: "done", photo_path: "done/b.jpg", completed_at: "2026-10-28T19:42:00Z" });
    const view = buildTodayView(
      input([signed, lost], [item("a", { sort: 1 }), item("b", { sort: 2 })], {
        photoUrls: new Map([["done/a.jpg", "https://signed/a"]]),
      }),
    );
    expect(view.am[0]).toMatchObject({ photoUrl: "https://signed/a", photoMissing: false });
    expect(view.am[1]).toMatchObject({ photoUrl: null, photoMissing: true });
  });
});

describe("who can reject", () => {
  const done = row("a", { status: "done", completed_at: "2026-10-28T19:42:00Z" });
  const notNeeded = row("b", { status: "not_needed", completed_at: "2026-10-28T19:42:00Z" });
  const planned = row("c");
  const items = [item("a", { sort: 1 }), item("b", { sort: 2 }), item("c", { sort: 3 })];

  it("offers Reject to planners on finished, not-yet-rejected cleans only", () => {
    const view = buildTodayView(input([done, notNeeded, planned], items, { canPlan: true }));
    expect(view.am.map((c) => [c.id, c.canReject])).toEqual([
      ["a", true],
      ["b", true],
      ["c", false],
    ]);
  });

  it("never offers it to a leader without planning rights", () => {
    const view = buildTodayView(input([done, notNeeded], items, { canPlan: false }));
    expect(view.am.every((c) => !c.canReject)).toBe(true);
  });
});

describe("Sunday", () => {
  it("is closed and previews Monday read only, with nothing later", () => {
    const rows = [
      row("mon-am", { date: MON, half: "am" }),
      row("mon-pm", { date: MON, half: "pm" }),
      row("tue", { date: "2026-10-27" }),
    ];
    const view = buildTodayView(input(rows, rows.map((r) => item(r.item_id)), { today: SUN, canPlan: true }));
    expect(view.closed).toBe(true);
    expect(view.dateLabel).toBe("Sunday, Oct 25");
    expect(view.focusDate).toBe(MON);
    expect(view.focusLabel).toBe("Monday, Oct 26");
    expect(view.am.map((c) => c.id)).toEqual(["mon-am"]);
    expect(view.pm.map((c) => c.id)).toEqual(["mon-pm"]);
    expect(view.later).toEqual([]);
  });

  it("never offers Reject in the preview", () => {
    const rows = [row("a", { date: MON, status: "done", completed_at: "2026-10-26T13:00:00Z" })];
    const view = buildTodayView(input(rows, [item("a")], { today: SUN, canPlan: true }));
    expect(view.am[0]!.canReject).toBe(false);
  });
});

describe("visibleAssignments", () => {
  it("keeps today and planned later rows on a working day", () => {
    const rows = [
      row("past", { date: "2026-10-27", status: "planned" }),
      row("today", { status: "done" }),
      row("later-planned", { date: THU }),
      row("later-done", { date: THU, status: "done" }),
    ];
    expect(visibleAssignments(WED, rows).map((r) => r.id)).toEqual(["today", "later-planned"]);
  });
});

describe("missingSourceIds", () => {
  it("returns only carry-over and redo sources that are not already loaded, once each", () => {
    const rows = [
      row("a", { origin: "carry_over", carried_from_id: "last-week" }),
      row("b", { origin: "redo", carried_from_id: "last-week" }),
      row("c", { origin: "carry_over", carried_from_id: "this-week" }),
      row("d", { origin: "constant", carried_from_id: "ignored" }),
      row("e", { origin: "carry_over", carried_from_id: null }),
    ];
    expect(missingSourceIds(rows, [{ id: "this-week" }])).toEqual(["last-week"]);
  });

  it("asks for nothing when every source is on the same board", () => {
    const rows = [row("a", { origin: "carry_over", carried_from_id: "x" })];
    expect(missingSourceIds(rows, [{ id: "x" }])).toEqual([]);
  });
});

describe("progressText", () => {
  const cardsFor = (rows: AssignmentLike[]) => buildTodayView(input(rows, rows.map((r) => item(r.item_id)))).am;

  it("counts finished cleans against the ones owed", () => {
    const cards = cardsFor([
      row("a", { status: "done", completed_at: "2026-10-28T13:00:00Z" }),
      row("b", { status: "not_needed", completed_at: "2026-10-28T13:00:00Z" }),
      row("c"),
    ]);
    expect(progressText(cards)).toBe("2 of 3 done");
  });

  it("leaves skipped and rejected cleans out of the count", () => {
    const cards = cardsFor([
      row("a", { status: "done", completed_at: "2026-10-28T13:00:00Z" }),
      row("b", { status: "skipped", skip_reason: "Truck day" }),
      row("c", { status: "done", completed_at: "2026-10-28T13:00:00Z", rejected_at: "2026-10-28T14:00:00Z", reject_note: "Redo" }),
    ]);
    expect(progressText(cards)).toBe("1 of 1 done");
  });

  it("says nothing for an empty section", () => {
    expect(progressText([])).toBe("");
  });
});

describe("still open from last night", () => {
  it("lists last night's open cleans after midnight, even on a Sunday", () => {
    const sat = "2026-10-31";
    const view = buildTodayView(
      input([], [item("whale"), item("done-one")], {
        today: "2026-11-01",
        stillOpen: [
          row("whale", { date: sat, half: "pm" }),
          row("done-one", { date: sat, half: "pm", status: "done", photo_path: "done/x.jpg" }),
        ],
      }),
    );
    expect(view.closed).toBe(true);
    expect(view.stillOpen.map((c) => c.id)).toEqual(["whale"]);
    expect(view.stillOpen[0]!.status).toBe("planned");
  });

  it("is empty when the close has run", () => {
    expect(buildTodayView(input([row("a")], [item("a")])).stillOpen).toEqual([]);
  });
});
