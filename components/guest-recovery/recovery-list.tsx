"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { RecoveryView } from "@/app/(app)/guest-recovery/types";
import { matchesSearch } from "@/app/(app)/guest-recovery/view";
import { RecoveryCard } from "@/components/guest-recovery/recovery-card";
import { SearchBar } from "@/components/mobile";

/**
 * The Guest Recovery list: still owed first (the longest wait on top), then
 * recently closed ones. Search filters what is already loaded by guest name or
 * order number, so typing never sends a guest's details anywhere.
 */
export function RecoveryList({
  owed,
  recent,
  nowIso,
}: {
  owed: RecoveryView[];
  recent: RecoveryView[];
  nowIso: string;
}) {
  const [query, setQuery] = useState("");
  const now = new Date(nowIso);
  const owedShown = owed.filter((r) => matchesSearch(r, query));
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

      <section aria-labelledby="owed-heading" className="space-y-3">
        <h2 id="owed-heading" className="text-[13px] font-bold uppercase tracking-wide text-muted-ink">
          Still owed ({owedShown.length})
        </h2>
        {owedShown.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-[15px] text-muted-ink shadow-card">
            {query ? "No match." : "Nobody is waiting on a recovery."}
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
