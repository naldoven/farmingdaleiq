"use client";

import { BookOpen } from "lucide-react";

import { ListRow, SectionCard } from "@/components/mobile";
import { dismissGuide, useGuideDismissed } from "@/lib/guide/guide-prefs";

/**
 * Home-screen pointer to the first-shift guide (/guide). Shows until the person
 * hides it, here or from the guide page itself. Dismissal is a per-browser
 * preference, not account data: see lib/guide/guide-prefs.ts.
 */
export function FirstRunGuideCard() {
  const dismissed = useGuideDismissed();
  if (dismissed) return null;

  return (
    <SectionCard flush>
      <ListRow
        icon={BookOpen}
        iconTone="accent"
        title="New here? Start with the guide"
        description="Five steps for your first shift."
        href="/guide"
      />
      <div className="flex justify-end px-4 pb-3">
        <button
          type="button"
          onClick={dismissGuide}
          className="min-h-11 px-2 text-[13px] text-muted-ink underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </SectionCard>
  );
}
