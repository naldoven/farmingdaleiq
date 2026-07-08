import { StageQueue } from "@/components/catering/stage-queue";
import { SectionLabel } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /catering/setup — ARCHITECTURE.md page map: "FOH setup queue: auto-scaled
 * setup checklists per order."
 */
export default async function CateringSetupPage() {
  await requirePermission("catering.view");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>FOH setup</SectionLabel>
      <StageQueue orderStage="setup" checklistStage="setup" />
    </div>
  );
}
