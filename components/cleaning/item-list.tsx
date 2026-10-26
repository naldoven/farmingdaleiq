"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { groupByZone, type MarkupData } from "@/app/(app)/cleaning/logic";
import type { DueState } from "@/app/(app)/cleaning/week-logic";
import { ItemActions } from "@/components/cleaning/item-actions";
import { PhotoWithMarkup } from "@/components/cleaning/photo-with-markup";
import { ChipRow, FilterChip, SectionCard, StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";

export interface ItemListZone {
  id: string;
  name: string;
  color: string;
  side: string;
  sort: number;
}

/** Everything a row needs, already resolved on the server (names, signed URL). */
export interface ItemListRow {
  id: string;
  /** snake_case on purpose: groupByZone (logic.ts) keys rows by zone_id. */
  zone_id: string;
  name: string;
  status: "draft" | "active";
  cadence: string;
  ifNeeded: boolean;
  photoUrl: string | null;
  /** A photo row exists but its signed URL did not come back. */
  photoMissing: boolean;
  markup: MarkupData | null;
  /**
   * Master-list audit view (plan "How a week runs" step 6). The dot is for
   * active variables only; dueLabel is "Next due <date>" or "Due now".
   */
  dueState: DueState | null;
  /** The dot in words ("Overdue"), so its meaning is not carried by color alone. */
  dueStateText: string | null;
  dueLabel: string | null;
  /** "Last cleaned <date>" or "Never cleaned yet"; null for a draft. */
  lastCleanedLabel: string | null;
}

const DUE_DOT: Record<DueState, string> = {
  not_due: "bg-success",
  due_this_week: "bg-warning",
  overdue: "bg-danger",
};

function ZoneDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
      style={{ backgroundColor: color }}
    />
  );
}

function Row({ row, canPlan }: { row: ItemListRow; canPlan: boolean }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <Link href={`/cleaning/items/${row.id}`} className="flex items-start gap-3">
        <PhotoWithMarkup
          className="w-[72px] shrink-0"
          src={row.photoUrl}
          markup={row.markup}
          alt={`Photo of ${row.name}`}
          emptyLabel={row.photoMissing ? "Photo unavailable" : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="break-words text-[15px] font-semibold text-ink">{row.name}</span>
          <span className="text-[13px] text-muted-ink">{row.cadence}</span>
          {row.dueState && row.dueLabel ? (
            <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <span
                role="img"
                aria-label={row.dueStateText ?? row.dueState}
                title={row.dueStateText ?? undefined}
                data-due-state={row.dueState}
                className={cn("h-3 w-3 shrink-0 rounded-full", DUE_DOT[row.dueState])}
              />
              {row.dueLabel}
            </span>
          ) : null}
          {row.lastCleanedLabel ? <span className="text-[13px] text-muted-ink">{row.lastCleanedLabel}</span> : null}
          <span className="flex flex-wrap gap-1.5">
            <StatusBadge tone={row.status === "draft" ? "warning" : "success"} dot>
              {row.status === "draft" ? "Draft" : "Active"}
            </StatusBadge>
            {row.ifNeeded ? <StatusBadge tone="neutral">If needed</StatusBadge> : null}
          </span>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-ink" aria-hidden="true" />
      </Link>
      {canPlan && row.status === "draft" ? <ItemActions id={row.id} status="draft" /> : null}
    </li>
  );
}

function Section({
  title,
  count,
  zones,
  rows,
  canPlan,
}: {
  title: string;
  count: number;
  zones: ItemListZone[];
  rows: ItemListRow[];
  canPlan: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-[22px] font-bold leading-tight text-ink">
        {title} <span className="text-muted-ink">{count}</span>
      </h2>
      {groupByZone(zones, rows).map(({ zone, rows: zoneRows }) => (
        <div key={zone.id} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ZoneDot color={zone.color} />
            {zone.name}
            <span className="font-normal text-muted-ink">{zoneRows.length}</span>
          </h3>
          <SectionCard flush>
            <ul className="divide-y divide-line">
              {zoneRows.map((row) => (
                <Row key={row.id} row={row} canPlan={canPlan} />
              ))}
            </ul>
          </SectionCard>
        </div>
      ))}
    </section>
  );
}

/**
 * The master list: zone filter chips, then drafts to review, then active
 * items, each grouped by zone. Filtering is client-side because the whole
 * list is already loaded (a few hundred rows at most) and a tap should not
 * cost a round trip on store wifi.
 */
export function ItemList({
  zones,
  rows,
  canPlan,
}: {
  zones: ItemListZone[];
  rows: ItemListRow[];
  canPlan: boolean;
}) {
  const [zoneId, setZoneId] = useState<string | null>(null);

  // A chip for a zone with nothing in it would only lead to an empty screen.
  const zoneCounts = new Map<string, number>();
  for (const row of rows) zoneCounts.set(row.zone_id, (zoneCounts.get(row.zone_id) ?? 0) + 1);
  const chipZones = zones.filter((zone) => zoneCounts.has(zone.id));

  const visible = zoneId ? rows.filter((row) => row.zone_id === zoneId) : rows;
  const drafts = visible.filter((row) => row.status === "draft");
  const active = visible.filter((row) => row.status === "active");

  return (
    <div className="flex flex-col gap-5">
      {chipZones.length > 1 ? (
        <ChipRow role="group" aria-label="Filter by zone">
          <FilterChip className="min-h-11 px-4 text-[14px]" active={zoneId === null} onClick={() => setZoneId(null)}>
            All {rows.length}
          </FilterChip>
          {chipZones.map((zone) => (
            <FilterChip
              key={zone.id}
              className="min-h-11 gap-2 px-4 text-[14px]"
              active={zoneId === zone.id}
              onClick={() => setZoneId(zone.id)}
            >
              <ZoneDot color={zone.color} />
              {zone.name} {zoneCounts.get(zone.id)}
            </FilterChip>
          ))}
        </ChipRow>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-[15px] text-muted-ink shadow-card">
          {rows.length === 0 ? "No items yet." : "Nothing in this zone."}
        </p>
      ) : null}

      <Section title="Drafts to review" count={drafts.length} zones={zones} rows={drafts} canPlan={canPlan} />
      <Section title="Active" count={active.length} zones={zones} rows={active} canPlan={canPlan} />
    </div>
  );
}
