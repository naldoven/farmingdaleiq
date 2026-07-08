import { ChevronRight } from "lucide-react";

import { StatusBadge } from "@/components/mobile";
import type { Badge as HighlightBadge } from "@/lib/setups/badges";

import { PersonRow } from "@/components/people/person-row";

export interface RosterRowProps {
  href: string;
  name: string;
  roleName: string | null;
  active: boolean;
  badges: HighlightBadge[];
}

/**
 * One roster row: AvatarInitials + name + role, a soft-green/neutral
 * StatusBadge for active/inactive, the highlight badges (New, Minor, Trainee,
 * Leader, Birthday -- lib/setups/badges.ts computeBadges), and a trailing
 * chevron. Matches the KitchenIQ LIST screen row (docs/DESIGN-SYSTEM.md).
 */
export function RosterRow({ href, name, roleName, active, badges }: RosterRowProps) {
  return (
    <PersonRow
      href={href}
      name={name}
      description={roleName ?? "No role"}
      meta={
        badges.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge.kind}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-ink"
              >
                {badge.label}
              </span>
            ))}
          </span>
        ) : undefined
      }
      trailing={
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={active ? "success" : "neutral"} dot>
            {active ? "Active" : "Inactive"}
          </StatusBadge>
          <ChevronRight className="h-5 w-5 text-muted-ink" aria-hidden="true" />
        </span>
      }
    />
  );
}
