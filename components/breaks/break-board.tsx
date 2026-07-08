"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const STATUS_VARIANT: Record<string, "outline" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "outline",
  authorized: "secondary",
  active: "secondary",
  completed: "success",
  overdue: "destructive",
  missed: "destructive",
};

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
      <p className="text-sm text-muted-foreground">
        No setup exists for this date and day-part yet. Create and post one from
        the setup board first.
      </p>
    );
  }

  const sorted = [...breaks].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Person</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Entitled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Auth → Start lag</TableHead>
            <TableHead>Badges</TableHead>
            {canManage && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((b) => {
            // MED parity-audit fix: real breakDueAt (arrival + rule) instead
            // of null/authorized_at, so the pending-but-due branch of
            // needsBreakBadge can actually fire.
            const dueAt = b.breakDueAt ? new Date(b.breakDueAt) : null;
            const needsBreak = needsBreakBadge(b.status, dueAt, now);
            const lagMinutes = authorizationToStartLagMinutes(b.authorized_at, b.started_at);
            return (
              <TableRow key={b.id}>
                <TableCell>{b.sequence ?? "—"}</TableCell>
                <TableCell>{b.user_id ? profileName.get(b.user_id) ?? "Unknown" : "Unassigned"}</TableCell>
                <TableCell className="capitalize">{b.kind}</TableCell>
                <TableCell>
                  {b.entitledMinutes != null ? `${b.entitledMinutes} min` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[b.status] ?? "outline"} className="capitalize">
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell>{lagMinutes != null ? `${lagMinutes} min` : "—"}</TableCell>
                <TableCell>
                  {needsBreak && <Badge variant="warning">Needs Break</Badge>}
                </TableCell>
                {canManage && (
                  <TableCell className="flex flex-wrap gap-1">
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
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 8 : 7} className="text-center text-muted-foreground">
                No breaks generated yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
