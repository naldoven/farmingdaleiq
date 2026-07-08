import { StageQueue } from "@/components/catering/stage-queue";
import { SectionLabel } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/dispatch — ARCHITECTURE.md page map: "Pickup/delivery queue
 * with handoff checklist."
 */
export default async function CateringDispatchPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>Pickup / delivery</SectionLabel>
      <StageQueue orderStage="out" checklistStage="out" />
    </div>
  );
}
