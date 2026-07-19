import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * TR6: slider and photo passport items must actually be completable. The card
 * used to render every non-signature item as a bare checkbox that sent only
 * { checked }, so a slider (needs sliderValue >= 100) or a photo (needs a
 * non-blank photoUrl) could never reach completion. These tests drive the real
 * component and assert the value is threaded into upsertItemProgress.
 */

// jsdom lacks APIs Radix primitives touch; stub them so the checkbox renders.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
});

const { upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(() => Promise.resolve({ ok: true as const, data: undefined })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/training/actions", () => ({
  upsertItemProgress: upsertMock,
  createPassportItem: vi.fn(),
  deletePassportItem: vi.fn(),
  enrollPassport: vi.fn(),
  signItem: vi.fn(),
  stampPassport: vi.fn(),
}));

import { PassportCard, type PassportItem, type PassportEnrollment } from "./passport-card";

const ENROLLMENT_ID = "enr-1";
const USER_ID = "user-1";
const SLIDER_ID = "slider-1";
const PHOTO_ID = "photo-1";

const items: PassportItem[] = [
  { id: SLIDER_ID, type: "slider", label: "Fry station", sort: 1, course_id: null },
  { id: PHOTO_ID, type: "photo", label: "Grill plating", sort: 2, course_id: null },
];

const enrollments: PassportEnrollment[] = [
  { id: ENROLLMENT_ID, userId: USER_ID, userName: "Sam", track: null, stampedAt: null },
];

function renderCard() {
  render(
    <PassportCard
      passportId="p-1"
      passportName="Fry Position"
      kind="position"
      items={items}
      enrollments={enrollments}
      progress={{}}
      people={[]}
      canManage={false}
      canStamp={false}
      // isSelf -> canEditProgress, so the inputs are enabled without needing a
      // manager/stamper permission (which would also pull in Radix Select).
      currentUserId={USER_ID}
      currentStarsByUser={{}}
    />,
  );
}

afterEach(() => {
  cleanup();
  upsertMock.mockClear();
});

describe("PassportCard slider/photo completion (TR6)", () => {
  it("sends the numeric sliderValue so a slider item can complete", () => {
    renderCard();

    const input = screen.getByLabelText("Fry station progress (0-100)");
    fireEvent.change(input, { target: { value: "100" } });
    // Two Save buttons render (slider first by sort, then photo).
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    expect(upsertMock).toHaveBeenCalledWith({
      enrollmentId: ENROLLMENT_ID,
      itemId: SLIDER_ID,
      sliderValue: 100,
    });
  });

  it("sends the photoUrl so a photo item can complete", () => {
    renderCard();

    const input = screen.getByLabelText("Grill plating photo URL");
    fireEvent.change(input, { target: { value: "https://cdn.example.com/plate.jpg" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1]);

    expect(upsertMock).toHaveBeenCalledWith({
      enrollmentId: ENROLLMENT_ID,
      itemId: PHOTO_ID,
      photoUrl: "https://cdn.example.com/plate.jpg",
    });
  });
});
