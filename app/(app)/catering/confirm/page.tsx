import { StageQueue } from "@/components/catering/stage-queue";
import { SectionLabel } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/confirm — ARCHITECTURE.md page map: "Confirmation-call queue
 * with per-order call checklist."
 */
export default async function CateringConfirmPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>Confirmation calls</SectionLabel>
      <StageQueue orderStage="confirm" checklistStage="confirm" />
    </div>
  );
}
