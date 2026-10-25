"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { bulkCloseStaleOrders } from "@/app/(app)/catering/actions";
import {
  ORDER_STAGE_LABELS,
  describeBulkCloseSummary,
  staleListNotice,
  type OrderStage,
} from "@/app/(app)/catering/logic";

export interface StaleOrderRow {
  id: string;
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  headcount: number | null;
  stage: OrderStage;
}

/**
 * /catering/stale: pick past-event orders, give one reason, close them all.
 * Built for a phone: one checkbox per row, "Select all" for a whole month of
 * neglect, and a two-tap confirm so a stray tap cannot close 150 orders. The
 * server action re-checks catering.override and catering.manage, and the
 * database function closes nothing that is not past, so this screen is a
 * convenience on top of those controls, never the control itself.
 *
 * `orders` is the slice the page loaded (the oldest ones, at most one bulk
 * close worth) and `totalCount` is how many are open in all. "Select all"
 * picks only the loaded rows, so it never exceeds what the action accepts.
 */
export function StaleOrdersCloser({
  orders,
  totalCount,
  canClose,
}: {
  orders: StaleOrderRow[];
  totalCount: number;
  canClose: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Rows that closed vanish from the next server render. Drop any id that is
  // no longer listed so "Close 3 orders" never counts an order already gone.
  const listedIds = new Set(orders.map((order) => order.id));
  const selectedIds = Array.from(selected).filter((id) => listedIds.has(id));
  const allSelected = orders.length > 0 && selectedIds.length === orders.length;
  const reasonReady = reason.trim().length >= 3;
  const listNotice = staleListNotice(orders.length, totalCount);

  const toggle = (id: string, checked: boolean) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await bulkCloseStaleOrders({ orderIds: selectedIds, reason });
      setConfirming(false);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(describeBulkCloseSummary(response.data));
      setSelected(new Set());
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canClose && orders.length > 0 && (
        <SectionCard title="Close selected">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted-ink">
                {selectedIds.length} of {orders.length} selected
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={isPending}
                onClick={() => {
                  setConfirming(false);
                  setSelected(allSelected ? new Set() : new Set(orders.map((order) => order.id)));
                }}
              >
                {allSelected ? "Clear all" : "Select all"}
              </Button>
            </div>
            <Input
              placeholder="Reason, for example: event passed, never worked"
              aria-label="Reason"
              value={reason}
              maxLength={300}
              disabled={isPending}
              onChange={(e) => {
                setConfirming(false);
                setReason(e.target.value);
              }}
              className="h-10 text-sm"
            />
            {!confirming ? (
              <Button
                type="button"
                disabled={isPending || selectedIds.length === 0 || !reasonReady}
                onClick={() => {
                  setError(null);
                  setResult(null);
                  setConfirming(true);
                }}
              >
                Close {selectedIds.length} {selectedIds.length === 1 ? "order" : "orders"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <p className="text-[13px] text-ink">
                  Close {selectedIds.length} {selectedIds.length === 1 ? "order" : "orders"} with this reason? No
                  Discord post, no re-book calls. A manager can still move an order back one step afterwards.
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" className="h-8 text-xs" disabled={isPending} onClick={submit}>
                    {isPending ? "Closing..." : "Yes, close them"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    disabled={isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Keep open
                  </Button>
                </div>
              </div>
            )}
            {error && (
              <p className="text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {result && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success" role="status">
          {result}
        </p>
      )}

      <SectionCard title={`Past-event orders still open (${totalCount})`} flush>
        {listNotice && (
          <p className="border-b border-line px-4 py-3 text-[13px] text-muted-ink" role="status">
            {listNotice}
          </p>
        )}
        <div className="divide-y divide-line">
          {orders.map((order) => {
            const checked = selected.has(order.id);
            return (
              <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                {canClose && (
                  <Checkbox
                    checked={checked}
                    disabled={isPending}
                    aria-label={`Select ${order.guestName}`}
                    onCheckedChange={(value) => toggle(order.id, value === true)}
                  />
                )}
                <Link href={`/catering/orders/${order.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{order.guestName}</span>
                  <span className="block truncate text-[13px] text-muted-ink">
                    {order.eventDate}
                    {order.eventTime ? ` · ${order.eventTime.slice(0, 5)}` : ""}
                    {order.headcount != null ? ` · ${order.headcount} guests` : ""}
                  </span>
                </Link>
                <StatusBadge tone="neutral">{ORDER_STAGE_LABELS[order.stage]}</StatusBadge>
              </div>
            );
          })}
          {orders.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No past-event orders are open. The pipeline is clean.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
