import { StageQueue } from "@/components/catering/stage-queue";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/confirm — ARCHITECTURE.md page map: "Confirmation-call queue
 * with per-order call checklist."
 */
export default async function CateringConfirmPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Confirmation calls</h1>
      <StageQueue orderStage="confirm" checklistStage="confirm" />
    </div>
  );
}
