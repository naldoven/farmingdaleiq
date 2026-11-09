import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { faultAsked, newLine, OrderLineCard, type OrderLine } from "@/components/guest-recovery/order-line";

const DELUXE: MenuItemView = {
  id: "d1",
  name: "Chick-fil-A Deluxe Sandwich",
  family: "Deluxe",
  category: "Sandwiches",
  sort: 1,
  active: true,
  modifiable: true,
  ingredients: ["Pickles", "Tomato"],
  addons: ["Extra sauce"],
};

function Harness({ reason = "missing_item", onLine }: { reason?: string; onLine?: (l: OrderLine | null) => void }) {
  const [line, setLine] = useState<OrderLine | null>(() => newLine(DELUXE.id));
  if (!line) return <p>removed</p>;
  return (
    <ul>
      <OrderLineCard
        line={line}
        item={DELUXE}
        reason={reason}
        onChange={(next) => {
          setLine(next);
          onLine?.(next);
        }}
      />
    </ul>
  );
}

describe("OrderLineCard", () => {
  afterEach(cleanup);

  it("taps an ingredient to take it off and shows it as a minus", () => {
    const seen = vi.fn();
    render(<Harness onLine={seen} />);
    fireEvent.click(screen.getByRole("button", { name: /Changes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pickles" }));
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ removed: ["Pickles"] }));
    expect(screen.getByRole("button", { name: "No pickles" }).getAttribute("aria-pressed")).toBe("true");
    // A second tap puts it back.
    fireEvent.click(screen.getByRole("button", { name: "No pickles" }));
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ removed: [] }));
  });

  it("asks the two receipt questions once there is a change, and names the likely cause", () => {
    render(<Harness />);
    expect(screen.queryByText(/receipt or sticker/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Changes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tomato" }));
    expect(screen.getByText(/receipt or sticker/)).toBeTruthy();

    const receipt = screen.getByRole("radiogroup", { name: /receipt or sticker/ });
    const box = screen.getByRole("radiogroup", { name: /in the box/ });
    fireEvent.click(receipt.querySelectorAll("button")[0]); // Yes
    fireEvent.click(box.querySelectorAll("button")[1]); // No
    expect(screen.getByText(/Likely cause: Made wrong/)).toBeTruthy();
  });

  it("asks the questions for a wrong item even with no changes, but not for a missing item", () => {
    const plain = newLine(DELUXE.id);
    expect(faultAsked(plain, "wrong_item")).toBe(true);
    expect(faultAsked(plain, "missing_item")).toBe(false);
    expect(faultAsked({ ...plain, removed: ["Pickles"] }, "missing_item")).toBe(true);
    expect(faultAsked({ ...plain, modNote: "  " }, "too_slow")).toBe(false);
  });

  it("takes the line off when the count goes to zero", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Fewer/ }));
    expect(screen.getByText("removed")).toBeTruthy();
  });
});
