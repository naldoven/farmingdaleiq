"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ChipRow, FilterChip } from "@/components/mobile";

export type WasteTabKey = "log" | "reports" | "admin";

/**
 * The Log / Reports / Admin switch, restyled as a ChipRow (docs/DESIGN-SYSTEM.md)
 * instead of the shadcn Tabs it replaces. Active section lives in the `tab`
 * search param (same pattern as components/team/team-filters.tsx) so the
 * server page (app/(app)/waste/page.tsx) decides what to render -- and can
 * re-check permissions on the param instead of trusting client state.
 */
export function WasteViewTabs({
  activeTab,
  showReports,
  showAdmin,
}: {
  activeTab: WasteTabKey;
  showReports: boolean;
  showAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goTo(tab: WasteTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "log") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <ChipRow aria-label="Waste sections">
      <FilterChip
        type="button"
        active={activeTab === "log"}
        activeColor="accent"
        onClick={() => goTo("log")}
      >
        Log
      </FilterChip>
      {showReports && (
        <FilterChip
          type="button"
          active={activeTab === "reports"}
          activeColor="accent"
          onClick={() => goTo("reports")}
        >
          Reports
        </FilterChip>
      )}
      {showAdmin && (
        <FilterChip
          type="button"
          active={activeTab === "admin"}
          activeColor="accent"
          onClick={() => goTo("admin")}
        >
          Admin
        </FilterChip>
      )}
    </ChipRow>
  );
}
