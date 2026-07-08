"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListRow, StatusBadge, type ListRowTone, type StatusTone } from "@/components/mobile";
import {
  authorizeBreak,
  completeBreak,
  generateBreaksForSetup,
  startBreak,
} from "@/app/(app)/breaks/actions";
import { authorizationToStartLagMinutes } from "@/lib/breaks/entitlement";
import { needsBreakBadge } from "@/lib/setups/badges";

export interface BreakRow {
  id: string;
  user_id: string | null;
  kind: string;
  status: string;
  sequence: number | null;
  authorized_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Real due time (arrival + rule.min_shift_minutes), or null if not computable. */
  breakDueAt?: string | null;
  /** Entitled minutes for this break's kind, joined from break_rules. */
  entitledMinutes?: number | null;
}

export interface ProfileOption {
  id: string;
  name: string;
}

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "neutral",
  authorized: "info",
  active: "warning",
  completed: "success",
  overdue: "danger",
  missed: "danger",
};

const ICON_TONE: Record<string, ListRowTone> = {
  pending: "neutral",
  authorized: "info",
  active: "warning",
  completed: "success",
  overdue: "danger",
  missed: "danger",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function BreakBoard({
  setupId,
  canManage,
  breaks,
  profiles,
}: {
  setupId: string | null;
  canManage: boolean;
  breaks: BreakRow[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  const profileName = new Map(profiles.map((p) => [p.id, p.name]));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  if (!setupId) {
    return (
      <p className="px-4 py-3 text-[13px] text-muted-ink">
        No setup exists for this date and day-part yet. Create and post one from
        the setup board first.
      </p>
    );
  }

  const sorted = [...breaks].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return (
    <div className="flex flex-col">
      {canManage && (
        <div className="border-b border-line px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => generateBreaksForSetup(setupId))}
          >
            Generate / refresh break plan
          </Button>
        </div>
      )}

      {error && <p className="px-4 pt-3 text-[13px] text-danger">{error}</p>}

      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-ink">
          No breaks generated yet.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {sorted.map((b) => {
            // MED parity-audit fix: real breakDueAt (arrival + rule) instead
            // of null/authorized_at, so the pending-but-due branch of
            // needsBreakBadge can actually fire.
            const dueAt = b.breakDueAt ? new Date(b.breakDueAt) : null;
            const needsBreak = needsBreakBadge(b.status, dueAt, now);
            const lagMinutes = authorizationToStartLagMinutes(b.authorized_at, b.started_at);
            const personName = b.user_id ? (profileName.get(b.user_id) ?? "Unknown") : "Unassigned";

            const descriptionParts = [
              `${kindLabel(b.kind)} · ${b.entitledMinutes != null ? `${b.entitledMinutes} min` : "— min"}`,
            ];
            if (lagMinutes != null) descriptionParts.push(`Lag ${lagMinutes}m`);

            return (
              <ListRow
                key={b.id}
                icon={User}
                iconTone={ICON_TONE[b.status] ?? "neutral"}
                title={
                  <>
                    {b.sequence != null && (
                      <span className="mr-1.5 text-muted-ink">#{b.sequence}</span>
                    )}
                    {personName}
                  </>
                }
                description={descriptionParts.join(" · ")}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {needsBreak && (
                        <StatusBadge tone="danger" dot>
                          Needs Break
                        </StatusBadge>
                      )}
                      <StatusBadge tone={STATUS_TONE[b.status] ?? "neutral"}>
                        {statusLabel(b.status)}
                      </StatusBadge>
                    </div>
                    {canManage && (
                      <div className="flex gap-1.5">
                        {b.status === "pending" && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => run(() => authorizeBreak({ id: b.id }))}
                          >
                            Authorize
                          </Button>
                        )}
                        {(b.status === "authorized" || b.status === "overdue") && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => run(() => startBreak({ id: b.id }))}
                          >
                            Start
                          </Button>
                        )}
                        {b.status === "active" && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => run(() => completeBreak({ id: b.id }))}
                          >
                            Complete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
