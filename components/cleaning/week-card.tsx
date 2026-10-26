import { ChevronRight } from "lucide-react";

import { statusInfo, type BoardCard } from "@/app/(app)/cleaning/board-view";
import { StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";

export function ZoneDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * One clean on the board: zone dot and name, the item, its origin tags
 * (Carried over, Redo, Added, Skipped: reason) and status. With `onOpen` the
 * whole card is a button, the 44px+ target a gloved or rushed thumb needs; a
 * read-only card is plain text.
 */
export function WeekCard({ card, onOpen }: { card: BoardCard; onOpen?: () => void }) {
  const status = statusInfo(card.status);
  const dimmed = card.status === "skipped";

  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] text-muted-ink">
          <ZoneDot color={card.zoneColor} />
          {card.zoneName}
        </span>
        <span className={cn("break-words text-[16px] font-semibold leading-snug text-ink", dimmed && "text-muted-ink")}>
          {card.name}
        </span>
        {card.tags.length > 0 || status ? (
          <span className="flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <StatusBadge key={tag.label} tone={tag.tone} className="max-w-full whitespace-normal break-words text-left">
                {tag.label}
              </StatusBadge>
            ))}
            {status ? (
              <StatusBadge tone={status.tone} dot>
                {status.label}
              </StatusBadge>
            ) : null}
          </span>
        ) : null}
      </span>
      {onOpen ? <ChevronRight className="h-5 w-5 shrink-0 text-muted-ink" aria-hidden="true" /> : null}
    </>
  );

  if (!onOpen) return <div className="flex items-center gap-3 px-4 py-3">{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${card.name}, ${card.zoneName} zone. Open options`}
      className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
    >
      {body}
    </button>
  );
}
