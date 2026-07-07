import { Badge } from "@/components/ui/badge";
import type { Badge as HighlightBadge } from "@/lib/setups/badges";

/**
 * Renders the computed highlight badges (New, Minor, Trainee, Leader,
 * Birthday, Needs Break — ARCHITECTURE.md "Highlight badges & store layout")
 * for one person. P2 wiring surfaces these on the roster and profile; the
 * badge math itself lives in lib/setups/badges.ts (computeBadges) and is
 * computed by the server component that renders this.
 */
export function PersonBadges({ badges }: { badges: HighlightBadge[] }) {
  if (badges.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge.kind} variant="secondary">
          {badge.label}
        </Badge>
      ))}
    </span>
  );
}
