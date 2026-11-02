"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { RecoveryView } from "@/app/(app)/guest-recovery/types";
import { matchesSearch } from "@/app/(app)/guest-recovery/view";
import { RecoveryCard } from "@/components/guest-recovery/recovery-card";
import { ChipRow, FilterChip, SearchBar } from "@/components/mobile";

/**
 * The Guest Recovery list: still owed first (the longest wait on top), then
 * recently closed ones. Search filters what is already loaded by guest name or
 * order number, so typing never sends a guest's details anywhere.
 */
export function RecoveryList({
  owed,
  recent,
  nowIso,
  viewerId,
}: {
  owed: RecoveryView[];
  recent: RecoveryView[];
  nowIso: string;
  viewerId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "spotlight" | "mine">("all");
  const now = new Date(nowIso);
  const spotlightOwed = owed.filter((r) => r.path === "spotlight");
  const mine = spotlightOwed.filter((r) => viewerId !== null && r.assignedTo === viewerId);
  const pool = filter === "spotlight" ? spotlightOwed : filter === "mine" ? mine : owed;
  const owedShown = pool.filter((r) => matchesSearch(r, query));
  const recentShown = recent.filter((r) => matchesSearch(r, query));

  return (
    <div className="space-y-4">
      <Link
        href="/guest-recovery/new"
        className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-base font-semibold text-white"
      >
        <Plus className="size-5" aria-hidden />
        Log a missing order
      </Link>

      <SearchBar
        label="Search by guest or order number"
        placeholder="Search by guest or order number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ChipRow>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({owed.length})
        </FilterChip>
        <FilterChip active={filter === "spotlight"} onClick={() => setFilter("spotlight")}>
          Spotlight to send ({spotlightOwed.length})
        </FilterChip>
        <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>
          Mine to send ({mine.length})
        </FilterChip>
      </ChipRow>

      <section aria-labelledby="owed-heading" className="space-y-3">
        <h2 id="owed-heading" className="text-[13px] font-bold uppercase tracking-wide text-muted-ink">
          Still owed ({owedShown.length})
        </h2>
        {owedShown.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-[15px] text-muted-ink shadow-card">
            {query ? "No match." : filter === "all" ? "Nobody is waiting on a recovery." : "Nothing here right now."}
          </p>
        ) : (
          owedShown.map((recovery) => <RecoveryCard key={recovery.id} recovery={recovery} now={now} />)
        )}
      </section>

      {recentShown.length > 0 && (
        <section aria-labelledby="recent-heading" className="space-y-3">
          <h2 id="recent-heading" className="text-[13px] font-bold uppercase tracking-wide text-muted-ink">
            Last 30 days, closed
          </h2>
          {recentShown.map((recovery) => (
            <RecoveryCard key={recovery.id} recovery={recovery} now={now} />
          ))}
        </section>
      )}
    </div>
  );
}
