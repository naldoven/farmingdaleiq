import { Badge } from "@/components/ui/badge";

/**
 * PLACEHOLDER slot for the roster's badge column (New, Minor, Trainee,
 * Leader, Birthday, Needs Break — ARCHITECTURE.md "Highlight badges & store
 * layout"). Real computation lives with S3 (docs/agent-map.md: badges are a
 * computed helper owned by the Setups/Shifts stream, wired across modules in
 * Phase 2). This component exists so the roster has a stable slot for S3 to
 * fill in without reshaping the roster table.
 */
export function BadgesPlaceholder() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      —
    </Badge>
  );
}
