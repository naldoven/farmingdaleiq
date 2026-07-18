import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// jsdom lacks these APIs that Radix primitives touch; stub them so the editable
// Select renders without throwing.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { RoleAssignForm } from "./role-assign-form";

const roles = [
  { id: "lm", name: "Location Manager" },
  { id: "ad", name: "Assistant Director" },
  { id: "tm", name: "Team Member" },
];

afterEach(() => cleanup());

describe("RoleAssignForm (PPL1)", () => {
  it("renders read-only (no role selector) when canEdit is false — e.g. viewing your own profile", () => {
    render(
      <RoleAssignForm
        profileId="p-1"
        initialRoleId="lm"
        roles={roles}
        assignableRoles={roles}
        canEdit={false}
      />,
    );

    // The current role name shows, but there is NO way to change it.
    expect(screen.getByText("Location Manager")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change role/i })).not.toBeInTheDocument();
  });

  it("renders the editable selector when canEdit is true", () => {
    render(
      <RoleAssignForm
        profileId="p-2"
        initialRoleId="tm"
        roles={roles}
        // Only roles at or below the actor's rank are offered (page-filtered).
        assignableRoles={[{ id: "tm", name: "Team Member" }]}
        canEdit={true}
      />,
    );

    expect(screen.getByRole("button", { name: /change role/i })).toBeInTheDocument();
  });
});
