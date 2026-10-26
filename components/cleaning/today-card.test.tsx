import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/cleaning/today-actions", () => ({ rejectClean: vi.fn() }));

import type { TodayCard } from "@/app/(app)/cleaning/today-view";
import { TodayCardRow, TodaySection } from "@/components/cleaning/today-card";
import { TodayLater } from "@/components/cleaning/today-later";

afterEach(cleanup);

function card(over: Partial<TodayCard> = {}): TodayCard {
  return {
    id: "a1111111-1111-4111-8111-111111111111",
    itemName: "Mop sink",
    zoneName: "Blue",
    zoneColor: "#1D4ED8",
    date: "2026-10-28",
    half: "pm",
    ifNeeded: false,
    tags: [],
    status: "planned",
    statusText: null,
    statusTone: "neutral",
    detailText: null,
    photoUrl: null,
    photoMissing: false,
    rejectedText: null,
    canReject: false,
    ...over,
  };
}

const inList = (ui: React.ReactElement) => render(<ul>{ui}</ul>);

describe("TodayCardRow", () => {
  it("shows the zone, the item and Done for a planned clean", () => {
    inList(<TodayCardRow card={card()} interactive />);
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("Mop sink")).toBeInTheDocument();
    // Every Done button on the page names its clean for screen readers.
    expect(screen.getByRole("button", { name: "Done: Mop sink" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Checked, not needed/ })).toBeNull();
  });

  it("adds 'Checked, not needed' for an if-needed clean, with its tag", () => {
    inList(<TodayCardRow card={card({ ifNeeded: true, tags: [{ kind: "if_needed", text: "If needed" }] })} interactive />);
    expect(screen.getByText("If needed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Checked, not needed/ })).toBeInTheDocument();
  });

  it("shows carry-over and redo tags in full", () => {
    inList(
      <TodayCardRow
        card={card({
          tags: [
            { kind: "carry", text: "Carried over from Wed" },
            { kind: "redo", text: "Redo: Still grease behind the fryer" },
          ],
        })}
        interactive
      />,
    );
    expect(screen.getByText("Carried over from Wed")).toBeInTheDocument();
    expect(screen.getByText("Redo: Still grease behind the fryer")).toBeInTheDocument();
  });

  it("shows a done clean with its thumbnail and no Done button", () => {
    inList(
      <TodayCardRow
        card={card({
          status: "done",
          statusText: "Done by Maria, 3:42 PM",
          statusTone: "success",
          photoUrl: "https://signed.example/a.jpg",
        })}
        interactive
      />,
    );
    expect(screen.getByText("Done by Maria, 3:42 PM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the photo of Mop sink" })).toHaveAttribute("href", "https://signed.example/a.jpg");
    expect(screen.queryByRole("button", { name: /^Done/ })).toBeNull();
  });

  it("says so when a photo's link did not come back", () => {
    inList(<TodayCardRow card={card({ status: "done", statusText: "Done, 3:42 PM", photoMissing: true })} interactive />);
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
  });

  it("shows skipped, missed and not-needed wording without buttons", () => {
    inList(
      <>
        <TodayCardRow card={card({ id: "1", itemName: "A", status: "skipped", statusText: "Skipped: Truck day", statusTone: "warning" })} interactive />
        <TodayCardRow card={card({ id: "2", itemName: "B", status: "missed", statusText: "Missed", statusTone: "danger" })} interactive />
        <TodayCardRow
          card={card({ id: "3", itemName: "C", status: "not_needed", statusText: "Checked, not needed", statusTone: "success", detailText: "Maria, 3:42 PM" })}
          interactive
        />
      </>,
    );
    expect(screen.getByText("Skipped: Truck day")).toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByText("Checked, not needed")).toBeInTheDocument();
    expect(screen.getByText("Maria, 3:42 PM")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows Reject only when the card allows it, and the note once rejected", () => {
    inList(<TodayCardRow card={card({ status: "done", statusText: "Done, 3:42 PM", canReject: true })} interactive />);
    expect(screen.getByRole("button", { name: /^Reject/ })).toBeInTheDocument();
    cleanup();

    inList(
      <TodayCardRow
        card={card({ status: "done", statusText: "Done, 3:42 PM", rejectedText: "Rejected: Vent still dusty", canReject: false })}
        interactive
      />,
    );
    expect(screen.getByText("Rejected: Vent still dusty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject/ })).toBeNull();
  });

  it("is read only in a Sunday preview: no Done even on a planned clean", () => {
    inList(<TodayCardRow card={card()} interactive={false} />);
    expect(screen.getByText("Mop sink")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("TodaySection", () => {
  it("titles the section, shows progress and lists its cards", () => {
    render(
      <TodaySection
        title="AM"
        interactive
        cards={[
          card({ id: "1", itemName: "Vent", status: "done", statusText: "Done, 9:00 AM", statusTone: "success" }),
          card({ id: "2", itemName: "Gaskets" }),
        ]}
      />,
    );
    const section = screen.getByRole("region", { name: "AM" });
    expect(within(section).getByRole("heading", { name: "AM" })).toBeInTheDocument();
    expect(within(section).getByText("1 of 2 done")).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("says plainly when nothing is planned", () => {
    render(<TodaySection title="PM" interactive cards={[]} />);
    expect(screen.getByText("Nothing planned.")).toBeInTheDocument();
  });
});

describe("TodayLater", () => {
  it("renders nothing when there is nothing later", () => {
    const { container } = render(<TodayLater groups={[]} count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists later cleans by day, collapsed, each with its half and a Done button", () => {
    const { container } = render(
      <TodayLater
        count={2}
        groups={[
          { date: "2026-10-29", label: "Thu Oct 29", cards: [card({ id: "1", itemName: "Boards deep clean", date: "2026-10-29", half: "am" })] },
          { date: "2026-10-30", label: "Fri Oct 30", cards: [card({ id: "2", itemName: "Mop sink", date: "2026-10-30", half: "pm" })] },
        ]}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Later this week")).toBeInTheDocument();
    expect(screen.getByText("Thu Oct 29")).toBeInTheDocument();
    expect(screen.getByText("Fri Oct 30")).toBeInTheDocument();
    expect(screen.getByText("AM")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Done/ })).toHaveLength(2);
  });
});
