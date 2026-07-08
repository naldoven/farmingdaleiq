import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Star } from "lucide-react";

import { StatTile } from "./stat-tile";
import { ProgressBar } from "./progress-bar";
import { ListRow } from "./list-row";
import { StatusBadge } from "./status-badge";
import { AvatarInitials } from "./avatar-initials";
import { avatarColor } from "@/lib/nav/page-map";

afterEach(cleanup);

describe("StatTile", () => {
  it("renders the value and label", () => {
    render(<StatTile value={42} label="Open tasks" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Open tasks")).toBeInTheDocument();
  });

  it("applies the danger tone color to the value", () => {
    render(<StatTile value={3} label="Overdue" tone="danger" />);
    expect(screen.getByText("3")).toHaveClass("text-danger");
  });
});

describe("ProgressBar", () => {
  it("clamps and rounds the value into a labeled percentage", () => {
    render(<ProgressBar value={132.6} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("exposes progressbar semantics with the clamped value", () => {
    render(<ProgressBar value={-10} showLabel={false} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });
});

describe("ListRow", () => {
  it("renders title and description text", () => {
    render(<ListRow title="Register 1" description="Breakfast" icon={Star} />);
    expect(screen.getByText("Register 1")).toBeInTheDocument();
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
  });

  it("renders as a link with an implicit chevron when href is set", () => {
    render(<ListRow title="Go deeper" href="/somewhere" />);
    const link = screen.getByRole("link", { name: /go deeper/i });
    expect(link).toHaveAttribute("href", "/somewhere");
  });
});

describe("StatusBadge", () => {
  it("renders its label with the success tint", () => {
    render(<StatusBadge tone="success">Active</StatusBadge>);
    const badge = screen.getByText("Active");
    expect(badge).toHaveClass("text-success");
  });
});

describe("AvatarInitials", () => {
  it("derives initials and exposes the name to assistive tech", () => {
    render(<AvatarInitials name="Dana Cruz" />);
    const el = screen.getByText("DC");
    expect(el).toHaveAttribute("aria-label", "Dana Cruz");
  });

  it("is deterministic: the same name always maps to the same color", () => {
    expect(avatarColor("Dana Cruz")).toEqual(avatarColor("Dana Cruz"));
  });
});
