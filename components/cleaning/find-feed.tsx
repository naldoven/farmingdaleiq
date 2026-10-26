import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import type { FindCard } from "@/app/(app)/cleaning/finds-view";
import { FindPlannerActions } from "@/components/cleaning/find-planner-actions";
import type { ItemDetailsZone } from "@/components/cleaning/item-details-fields";
import { SectionCard } from "@/components/mobile";

/**
 * Server-rendered feed for the found-and-fixed screen. The only client code
 * inside is the planner buttons; everything else is plain markup, so the list
 * paints without waiting on JavaScript on store wifi.
 */

function ZoneDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
      style={{ backgroundColor: color }}
    />
  );
}

function Thumb({ card }: { card: FindCard }) {
  if (card.photoUrl) {
    return (
      <a
        href={card.photoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open the photo: ${card.note}`}
        className="shrink-0"
      >
        {/* The signed URL is short-lived, so next/image's cache would only hold a dead link. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-20 w-20 rounded-lg border border-line object-cover"
        />
      </a>
    );
  }
  return (
    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-line px-1 text-center text-[11px] leading-tight text-muted-ink">
      Photo unavailable
    </span>
  );
}

export function FindFeed({ cards, zones }: { cards: FindCard[]; zones: ItemDetailsZone[] }) {
  if (cards.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-card p-4 text-center text-[15px] text-muted-ink shadow-card">
        No finds yet. When you fix something that is on no list, post it here.
      </p>
    );
  }
  return (
    <SectionCard flush>
      <ul className="divide-y divide-line">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-start gap-3">
              <Thumb card={card} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-ink">
                  <ZoneDot color={card.zoneColor} />
                  {card.zoneName}
                </span>
                <span className="break-words text-[17px] font-semibold leading-snug text-ink">{card.note}</span>
                <p className="text-[13px] text-muted-ink">{card.postedText}</p>
                {card.itemHref ? (
                  <Link
                    href={card.itemHref}
                    className="flex items-center gap-1.5 text-[14px] font-semibold text-success underline-offset-2 hover:underline"
                  >
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    On the master list
                  </Link>
                ) : null}
              </div>
            </div>
            {card.canConvert || card.canDelete ? (
              <FindPlannerActions findId={card.id} zoneId={card.zoneId} note={card.note} zones={zones} />
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
