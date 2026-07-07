"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { cycleStationProgress } from "@/app/(app)/training/grid/actions";

const STATUS_LABEL: Record<string, string> = {
  not_started: "—",
  in_training: "Training",
};

export function StationCell({
  enrollmentId,
  roadmapStationId,
  status,
  score,
  canScore,
}: {
  enrollmentId: string;
  roadmapStationId: string;
  status: string;
  score: number | null;
  canScore: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const label = status === "scored" && score !== null ? String(score) : STATUS_LABEL[status] ?? "—";
  const bg =
    status === "scored"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : status === "in_training"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-muted text-muted-foreground";

  return (
    <button
      type="button"
      disabled={!canScore || isPending}
      onClick={() =>
        startTransition(async () => {
          await cycleStationProgress({ enrollmentId, roadmapStationId });
          router.refresh();
        })
      }
      className={`flex h-9 w-14 items-center justify-center rounded-md text-sm font-medium transition-colors ${bg} ${canScore ? "hover:opacity-80" : "cursor-default"}`}
    >
      {label}
    </button>
  );
}
