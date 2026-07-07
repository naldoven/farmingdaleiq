import { StageQueue } from "@/components/catering/stage-queue";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/dispatch — ARCHITECTURE.md page map: "Pickup/delivery queue
 * with handoff checklist."
 */
export default async function CateringDispatchPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pickup / delivery</h1>
      <StageQueue orderStage="out" checklistStage="out" />
    </div>
  );
}
