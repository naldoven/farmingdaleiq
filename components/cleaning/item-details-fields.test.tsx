import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { itemDetailsSchema } from "@/app/(app)/cleaning/validation";
import {
  emptyItemDetails,
  ItemDetailsFields,
  toItemDetailsInput,
  validateItemDetails,
  type ItemDetailsValue,
} from "@/components/cleaning/item-details-fields";

afterEach(cleanup);

const GREEN = "11111111-1111-4111-8111-111111111111";
const YELLOW = "22222222-2222-4222-8222-222222222222";
const RED = "33333333-3333-4333-8333-333333333333";

// Passed in sort order with a FOH zone in the middle, to prove BOH floats up.
const ZONES = [
  { id: GREEN, name: "Green", color: "#16A34A", side: "boh" },
  { id: RED, name: "Red", color: "#DC2626", side: "foh" },
  { id: YELLOW, name: "Yellow", color: "#E0A100", side: "boh" },
];

function Harness({
  initial,
  onValue,
  ...rest
}: {
  initial: ItemDetailsValue;
  onValue?: (value: ItemDetailsValue) => void;
  hideZone?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ItemDetailsFields
      value={value}
      zones={ZONES}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      {...rest}
    />
  );
}

function pressed(name: string | RegExp): boolean {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";
}

describe("ItemDetailsFields kind switch", () => {
  it("resets an invalid half to AM when a variable set to Either becomes a constant", () => {
    const seen: ItemDetailsValue[] = [];
    render(
      <Harness
        initial={{ ...emptyItemDetails(GREEN), kind: "variable", half: "either", intervalWeeks: 4 }}
        onValue={(v) => seen.push(v)}
      />,
    );
    expect(pressed("Either")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Constant" }));

    expect(seen.at(-1)).toMatchObject({ kind: "constant", half: "am" });
    // A constant has no "Either" choice at all.
    expect(screen.queryByRole("button", { name: "Either" })).toBeNull();
    expect(pressed("AM")).toBe(true);
  });

  it("keeps a valid half when the kind changes", () => {
    const seen: ItemDetailsValue[] = [];
    render(<Harness initial={{ ...emptyItemDetails(GREEN), half: "pm" }} onValue={(v) => seen.push(v)} />);

    fireEvent.click(screen.getByRole("button", { name: "Variable" }));

    expect(seen.at(-1)).toMatchObject({ kind: "variable", half: "pm" });
    expect(screen.getByRole("button", { name: "Either" })).toBeInTheDocument();
  });

  it("shows days for a constant and week choices for a variable, never both", () => {
    render(<Harness initial={emptyItemDetails(GREEN)} />);
    expect(screen.getByRole("button", { name: "Mon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Every week" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Variable" }));

    expect(screen.queryByRole("button", { name: "Mon" })).toBeNull();
    for (const label of [
      "Every week",
      "2 wks",
      "3 wks",
      "4 wks (monthly)",
      "6 wks",
      "8 wks",
      "13 wks (quarterly)",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});

describe("ItemDetailsFields day chips", () => {
  it("toggles days on and off and keeps them in weekday order", () => {
    const seen: ItemDetailsValue[] = [];
    render(<Harness initial={emptyItemDetails(GREEN)} onValue={(v) => seen.push(v)} />);

    fireEvent.click(screen.getByRole("button", { name: "Thu" }));
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(seen.at(-1)?.daysOfWeek).toEqual([1, 4]);
    expect(pressed("Mon")).toBe(true);
    expect(pressed("Tue")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(seen.at(-1)?.daysOfWeek).toEqual([4]);
    expect(pressed("Mon")).toBe(false);
  });

  it("offers Monday to Saturday only, because the store is closed Sunday", () => {
    render(<Harness initial={emptyItemDetails(GREEN)} />);
    const days = screen.getByRole("group", { name: "Days" });
    expect(within(days).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });
});

describe("ItemDetailsFields other fields", () => {
  it("lists BOH zones before FOH and picks one", () => {
    const seen: ItemDetailsValue[] = [];
    render(<Harness initial={emptyItemDetails(GREEN)} onValue={(v) => seen.push(v)} />);
    const zoneGroup = screen.getByRole("group", { name: "Zone" });
    expect(within(zoneGroup).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Green",
      "Yellow",
      "Red",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Yellow" }));
    expect(seen.at(-1)?.zoneId).toBe(YELLOW);
  });

  it("can hide the zone picker for the camera screen", () => {
    render(<Harness initial={emptyItemDetails(GREEN)} hideZone />);
    expect(screen.queryByRole("group", { name: "Zone" })).toBeNull();
  });

  it("flips the If needed switch and explains it", () => {
    const seen: ItemDetailsValue[] = [];
    render(<Harness initial={emptyItemDetails(GREEN)} onValue={(v) => seen.push(v)} />);
    const toggle = screen.getByRole("switch", { name: /if needed/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/checked, not needed/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(seen.at(-1)?.ifNeeded).toBe(true);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("uses 16px text on the name field so iOS does not zoom", () => {
    render(<Harness initial={emptyItemDetails(GREEN)} />);
    expect(screen.getByLabelText("Name")).toHaveClass("text-base");
  });

  it("disables every control when disabled", () => {
    render(<Harness initial={emptyItemDetails(GREEN)} disabled />);
    for (const control of [...screen.getAllByRole("button"), screen.getByRole("switch"), screen.getByLabelText("Name")]) {
      expect(control).toBeDisabled();
    }
  });

  it("shows the messages it is given", () => {
    render(
      <ItemDetailsFields
        value={emptyItemDetails("")}
        zones={ZONES}
        onChange={vi.fn()}
        errors={{ zoneId: "Pick a zone", name: "Name the item", daysOfWeek: "Pick at least one day" }}
      />,
    );
    expect(screen.getByText("Pick a zone")).toBeInTheDocument();
    expect(screen.getByText("Name the item")).toBeInTheDocument();
    expect(screen.getByText("Pick at least one day")).toBeInTheDocument();
  });
});

describe("toItemDetailsInput", () => {
  it("produces input that itemDetailsSchema accepts for a constant", () => {
    const value: ItemDetailsValue = {
      ...emptyItemDetails(GREEN),
      name: "Boards deep clean",
      daysOfWeek: [2, 5],
      half: "pm",
      note: "Use the green pad",
    };
    const parsed = itemDetailsSchema.safeParse(toItemDetailsInput(value));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      zone_id: GREEN,
      kind: "constant",
      days_of_week: [2, 5],
      interval_weeks: null,
      half: "pm",
      note: "Use the green pad",
    });
  });

  it("produces input that itemDetailsSchema accepts for a variable", () => {
    const value: ItemDetailsValue = {
      ...emptyItemDetails(YELLOW),
      name: "Vent above the boards",
      kind: "variable",
      half: "either",
      intervalWeeks: 13,
      ifNeeded: true,
    };
    const parsed = itemDetailsSchema.safeParse(toItemDetailsInput(value));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      kind: "variable",
      days_of_week: null,
      interval_weeks: 13,
      half: "either",
      if_needed: true,
      note: null,
    });
  });

  it("turns an unchosen cadence into undefined so the schema names what is missing", () => {
    const input = toItemDetailsInput({ ...emptyItemDetails(GREEN), name: "Hood" });
    expect(input.daysOfWeek).toBeUndefined();
    expect(input.intervalWeeks).toBeUndefined();
    const parsed = itemDetailsSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain("Pick at least one day");

    const variable = toItemDetailsInput({ ...emptyItemDetails(GREEN), name: "Hood", kind: "variable" });
    expect(variable.intervalWeeks).toBeUndefined();
    expect(itemDetailsSchema.safeParse(variable).error?.issues.map((i) => i.message)).toContain(
      "Pick how many weeks",
    );
  });

  it("drops the other kind's leftover pick instead of rejecting it", () => {
    const parsed = itemDetailsSchema.safeParse(
      toItemDetailsInput({
        ...emptyItemDetails(GREEN),
        name: "Mixer",
        kind: "variable",
        daysOfWeek: [1],
        half: "am",
        intervalWeeks: 2,
      }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ days_of_week: null, interval_weeks: 2 });
  });
});

describe("validateItemDetails", () => {
  const cases: { label: string; value: ItemDetailsValue }[] = [
    { label: "empty form", value: emptyItemDetails("") },
    { label: "no zone", value: { ...emptyItemDetails(""), name: "Hood", daysOfWeek: [1] } },
    { label: "blank name", value: { ...emptyItemDetails(GREEN), name: "   ", daysOfWeek: [1] } },
    { label: "constant without days", value: { ...emptyItemDetails(GREEN), name: "Hood" } },
    { label: "constant set to either", value: { ...emptyItemDetails(GREEN), name: "Hood", daysOfWeek: [1], half: "either" } },
    { label: "good constant", value: { ...emptyItemDetails(GREEN), name: "Hood", daysOfWeek: [1] } },
    { label: "variable without weeks", value: { ...emptyItemDetails(GREEN), name: "Hood", kind: "variable" } },
    { label: "good variable", value: { ...emptyItemDetails(GREEN), name: "Hood", kind: "variable", intervalWeeks: 6, half: "either" } },
  ];

  it.each(cases)("agrees with itemDetailsSchema on: $label", ({ value }) => {
    const clientOk = Object.keys(validateItemDetails(value)).length === 0;
    // The schema wants a real uuid for the zone; the client only needs one chosen.
    expect(itemDetailsSchema.safeParse(toItemDetailsInput(value)).success).toBe(clientOk);
  });
});
