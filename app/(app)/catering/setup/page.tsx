import { StageQueue } from "@/components/catering/stage-queue";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/setup — ARCHITECTURE.md page map: "FOH setup queue: auto-scaled
 * setup checklists per order."
 */
export default async function CateringSetupPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">FOH setup</h1>
      <StageQueue orderStage="setup" checklistStage="setup" />
    </div>
  );
}
