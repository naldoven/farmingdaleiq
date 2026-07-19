import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/accountability/actions", () => ({ issueInfraction: vi.fn() }));

import { IssueInfractionForm } from "./issue-infraction-form";

const people = [
  { id: "a1", name: "Aaron Adams" },
  { id: "b2", name: "Bea Brooks" },
];
const types = [{ id: "t1", name: "Late to Shift", points: 4 }];

afterEach(() => cleanup());

describe("IssueInfractionForm person picker default (S3)", () => {
  it("defaults the person picker to empty with a placeholder option", () => {
    render(<IssueInfractionForm people={people} types={types} />);

    const personSelect = screen.getByLabelText("Person") as HTMLSelectElement;
    // No real person is pre-selected.
    expect(personSelect.value).toBe("");
    expect(screen.getByRole("option", { name: "Pick a person" })).toBeInTheDocument();

    // Empty default is unsubmittable.
    expect(
      screen.getByRole("button", { name: /issue infraction/i }),
    ).toBeDisabled();
  });
});
