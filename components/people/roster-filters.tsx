"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ChipRow, FilterChip, SearchBar } from "@/components/mobile";

export type RosterStatusFilter = "" | "active" | "inactive";

export interface RosterFiltersProps {
  initialQuery: string;
  initialStatus: RosterStatusFilter;
}

/**
 * The roster's search + status ChipRow, matching the KitchenIQ LIST screen
 * (docs/DESIGN-SYSTEM.md: SearchBar + FilterChip row). Drives the same `q`
 * and `active` searchParams the roster page (app/(app)/people/page.tsx)
 * already reads server-side -- visual only, no new filtering logic.
 */
export function RosterFilters({ initialQuery, initialStatus }: RosterFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", query);
        }}
      >
        <SearchBar
          label="Search roster"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <ChipRow aria-label="Roster status filter">
        <FilterChip active={initialStatus === ""} onClick={() => setParam("active", "")}>
          All
        </FilterChip>
        <FilterChip
          active={initialStatus === "active"}
          onClick={() => setParam("active", "active")}
        >
          Active
        </FilterChip>
        <FilterChip
          active={initialStatus === "inactive"}
          onClick={() => setParam("active", "inactive")}
        >
          Inactive
        </FilterChip>
      </ChipRow>
    </div>
  );
}
