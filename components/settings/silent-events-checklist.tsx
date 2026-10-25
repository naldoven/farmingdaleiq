import { Badge } from "@/components/ui/badge";
import { EVENT_LABELS } from "@/components/settings/event-labels";
import { SILENT_REASON_LABELS, type SilentEvent } from "@/app/(app)/settings/discord/logic";

/**
 * Server-rendered checklist of events that will not reach Discord yet, with
 * the reason beside each one. Read-only on purpose: the fix is always made in
 * the route table on the same page, so this list is a to-do, not a second
 * place to edit routes.
 */
export function SilentEventsChecklist({
  silent,
  totalCount,
}: {
  silent: SilentEvent[];
  totalCount: number;
}) {
  if (silent.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every event has a channel. Nothing is silent.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {silent.length} of {totalCount} events still post nowhere. Pick a channel for each in
        the Event routing table below and tick Enabled.
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {silent.map((item) => (
          <li
            key={item.eventKey}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="font-medium">{EVENT_LABELS[item.eventKey] ?? item.eventKey}</span>
            <Badge variant="warning">{SILENT_REASON_LABELS[item.reason]}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
