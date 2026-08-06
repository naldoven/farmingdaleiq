import "@testing-library/jest-dom/vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mockRefresh = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const mockCompleteWorkOrder = vi.hoisted(() => vi.fn(async () => ({ ok: true, data: undefined })));
const mockUpdateWorkOrderStatus = vi.hoisted(() => vi.fn(async () => ({ ok: true, data: undefined })));
const dragHarness = vi.hoisted(() => ({
  onDrop: null as null | ((cardId: string, column: string) => void),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/app/(app)/maintenance/actions", () => ({
  completeWorkOrder: mockCompleteWorkOrder,
  updateWorkOrderStatus: mockUpdateWorkOrderStatus,
}));

vi.mock("@/components/mobile", () => ({
  KanbanGhostCard: () => null,
  StatusBadge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useKanbanDrag: (options: { onDrop: (cardId: string, column: string) => void }) => {
    dragHarness.onDrop = options.onDrop;
    return {
      columnProps: (column: string) => ({ "data-kanban-column": column }),
      cardHandlers: () => ({}),
      overColumn: null,
      draggingId: null,
      armedGhostContent: null,
    };
  },
}));

import { WorkOrderBoard, type WorkOrderRow } from "./work-order-board";

const workOrder: WorkOrderRow = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Fix the fryer",
  status: "open",
  priority: "medium",
  equipment_name: "Fryer",
  assigned_user_name: null,
  vendor_name: null,
  photo_urls: [],
};

describe("WorkOrderBoard", () => {
  it("completes a work order directly when dropped on the Complete column", async () => {
    render(<WorkOrderBoard workOrders={[workOrder]} />);

    act(() => {
      dragHarness.onDrop?.(workOrder.id, "complete");
    });

    await waitFor(() => {
      expect(mockCompleteWorkOrder).toHaveBeenCalledWith({ workOrderId: workOrder.id });
    });
    expect(mockUpdateWorkOrderStatus).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
