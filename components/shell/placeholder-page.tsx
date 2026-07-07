import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavItem } from "@/lib/nav/page-map";

/**
 * Nav-skeleton placeholder for every route not yet built (PLAN.md P0 #1).
 * Real implementations land per the stream that owns them; see
 * docs/agent-map.md for the ownership matrix.
 */
export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{item.label}</h1>
        <Badge variant="outline">{item.owner}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>{item.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This route is part of the Phase 0 nav skeleton. Build details live in
          PLAN.md under stream <span className="font-medium">{item.owner}</span>.
        </CardContent>
      </Card>
    </div>
  );
}
