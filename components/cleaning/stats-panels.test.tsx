import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatsAreas } from "@/components/cleaning/stats-areas";
import { StatsLeaders } from "@/components/cleaning/stats-leaders";
import { StatsMonthNav } from "@/components/cleaning/stats-month-nav";
import { StatsOverdue } from "@/components/cleaning/stats-overdue";
import { StatsTrend } from "@/components/cleaning/stats-trend";
import type { LeaderRowView, OverdueRowView, TrendBar } from "@/app/(app)/cleaning/stats-view";
import { monthChips } from "@/app/(app)/cleaning/stats-view";

afterEach(cleanup);

function bar(over: Partial<TrendBar> = {}): TrendBar {
  return {
    weekStart: "2026-10-19",
    label: "Oct 19",
    pctText: "92%",
    heightPct: 92,
    tone: "success",
    summary: "Week of Oct 19: 92% on time, 2 missed",
    ...over,
  };
}

describe("StatsTrend", () => {
  it("prints each week's percent above its bar and the week below, sized by percent", () => {
    render(
      <StatsTrend
        bars={[
          bar(),
          bar({ weekStart: "2026-10-26", label: "Oct 26", pctText: "-", heightPct: 0, tone: "neutral", summary: "Week of Oct 26: nothing closed yet" }),
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: /by week/i })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAccessibleName("Week of Oct 19: 92% on time, 2 missed");
    expect(within(items[0]!).getByText("92%")).toBeInTheDocument();
    expect(within(items[0]!).getByText("Oct")).toBeInTheDocument();
    expect(within(items[0]!).getByText("19")).toBeInTheDocument();
    // The fill is the last span with an inline height.
    const fill = items[0]!.querySelector<HTMLElement>("[style]");
    expect(fill?.style.height).toBe("92%");
    expect(within(items[1]!).getByText("-")).toBeInTheDocument();
    expect(items[1]!.querySelector<HTMLElement>("[style]")?.style.height).toBe("0%");
  });

  it("says so when there is no history yet, and when the trend failed to load", () => {
    const { rerender } = render(<StatsTrend bars={[]} />);
    expect(screen.getByText(/No cleans have been scored yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    rerender(<StatsTrend bars={[]} failed />);
    expect(screen.getByText(/could not load/)).toBeInTheDocument();
  });
});

describe("StatsMonthNav", () => {
  it("links every month and marks only the chosen one as current", () => {
    render(<StatsMonthNav chips={monthChips("2026-10-29", "2026-09")} />);
    const links = within(screen.getByRole("navigation", { name: "Month" })).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/cleaning/stats?month=2026-10");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Sep 2026" })).toHaveAttribute("aria-current", "page");
  });
});

function leader(over: Partial<LeaderRowView> = {}): LeaderRowView {
  return { userId: "u1", name: "Amy Cruz", pctText: "88%", tone: "warning", owned: 24, missed: 3, carriedOver: 2, ...over };
}

describe("StatsLeaders", () => {
  it("shows a row per leader with cleans, on-time, missed and carried over, and no rank", () => {
    render(
      <StatsLeaders
        leaders={[leader(), leader({ userId: "u2", name: "Ben Ortiz", pctText: "-", tone: "neutral", owned: 4, missed: 0, carriedOver: 0 })]}
        unowned={null}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByText(/Cruz|Ortiz/).textContent)).toEqual(["Amy Cruz", "Ben Ortiz"]);
    const amy = within(rows[0]!);
    expect(amy.getByText("24")).toBeInTheDocument();
    expect(amy.getByText("88%")).toBeInTheDocument();
    expect(amy.getByText("3")).toBeInTheDocument();
    expect(amy.getByText("2")).toBeInTheDocument();
    for (const label of ["Cleans", "On time", "Missed", "Carried over"]) {
      expect(amy.getByText(label)).toBeInTheDocument();
    }
    // A dash, not 0%, for a leader whose cleans have not closed.
    expect(within(rows[1]!).getByText("-")).toBeInTheDocument();
    expect(screen.queryByText(/rank|#1|best/i)).toBeNull();
  });

  it("shows the No Setup posted bucket with its one-line reason only when there is one", () => {
    const { rerender } = render(<StatsLeaders leaders={[leader()]} unowned={null} />);
    expect(screen.queryByText("No Setup posted")).toBeNull();

    rerender(
      <StatsLeaders leaders={[leader()]} unowned={{ owed: 5, missed: 1, pctText: "80%", tone: "warning" }} />,
    );
    expect(screen.getByText("No Setup posted")).toBeInTheDocument();
    expect(screen.getByText(/cannot be credited to a leader/)).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("says so when no clean was credited to a leader but some had no Setup", () => {
    render(<StatsLeaders leaders={[]} unowned={{ owed: 2, missed: 0, pctText: "100%", tone: "success" }} />);
    expect(screen.getByText(/No cleans were credited to a leader/)).toBeInTheDocument();
    expect(screen.getByText("No Setup posted")).toBeInTheDocument();
  });
});

describe("StatsAreas", () => {
  it("shows each area with its color dot, cleans, on-time and missed", () => {
    render(
      <StatsAreas
        areas={[
          { zoneId: "z1", name: "Boards", color: "#16A34A", pctText: "90%", tone: "success", owed: 10, missed: 1 },
          { zoneId: "z2", name: "Dumpster", color: "#1D4ED8", pctText: "-", tone: "neutral", owed: 3, missed: 0 },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Boards")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("90%")).toBeInTheDocument();
    expect(rows[0]!.querySelector<HTMLElement>("[aria-hidden='true']")?.style.backgroundColor).not.toBe("");
    expect(within(rows[1]!).getByText("-")).toBeInTheDocument();
  });

  it("has an empty state", () => {
    render(<StatsAreas areas={[]} />);
    expect(screen.getByText(/No areas were scored/)).toBeInTheDocument();
  });
});

describe("StatsOverdue", () => {
  const rows: OverdueRowView[] = [
    {
      id: "i1",
      name: "Vent above boards",
      zoneName: "Boards",
      href: "/cleaning/items/i1",
      badge: "12 days overdue",
      lastText: "Last cleaned Sat Oct 3",
    },
    { id: "i2", name: "Fry vents", zoneName: "Machines", href: "/cleaning/items/i2", badge: "Never cleaned", lastText: null },
  ];

  it("links each item to its page with days overdue, area and last cleaned date", () => {
    render(<StatsOverdue rows={rows} />);
    const link = screen.getByRole("link", { name: /Vent above boards/ });
    expect(link).toHaveAttribute("href", "/cleaning/items/i1");
    expect(within(link).getByText("12 days overdue")).toBeInTheDocument();
    expect(within(link).getByText("Boards")).toBeInTheDocument();
    expect(within(link).getByText("Last cleaned Sat Oct 3")).toBeInTheDocument();
  });

  it("says never cleaned once, and has an all-clear state", () => {
    const { rerender } = render(<StatsOverdue rows={rows} />);
    const never = screen.getByRole("link", { name: /Fry vents/ });
    expect(within(never).getAllByText("Never cleaned")).toHaveLength(1);
    rerender(<StatsOverdue rows={[]} />);
    expect(screen.getByText(/Nothing is overdue/)).toBeInTheDocument();
  });
});
