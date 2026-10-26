import { CheckCircle2 } from "lucide-react";

import { progressText, type CardTag, type TodayCard } from "@/app/(app)/cleaning/today-view";
import { CompleteCleanButton } from "@/components/cleaning/complete-clean-button";
import { RejectCleanButton } from "@/components/cleaning/today-reject-button";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";

/**
 * Server-rendered pieces of the Today screen. The only client code inside is
 * the two buttons; everything else is plain markup, so the list paints
 * without waiting on JavaScript on store wifi.
 */

const TAG_TONE: Record<CardTag["kind"], "warning" | "danger" | "neutral"> = {
  carry: "warning",
  redo: "danger",
  if_needed: "neutral",
};

const STATUS_CLASS: Record<TodayCard["statusTone"], string> = {
  success: "text-success",
  warning: "text-ink",
  danger: "text-danger",
  neutral: "text-muted-ink",
};

function ZoneDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
      style={{ backgroundColor: color }}
    />
  );
}

function Thumb({ card }: { card: TodayCard }) {
  if (card.photoUrl) {
    return (
      <a
        href={card.photoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open the photo of ${card.itemName}`}
        className="shrink-0"
      >
        {/* The signed URL is short-lived, so next/image's cache would only hold a dead link. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-16 w-16 rounded-lg border border-line object-cover"
        />
      </a>
    );
  }
  if (card.photoMissing) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line px-1 text-center text-[11px] leading-tight text-muted-ink">
        Photo unavailable
      </span>
    );
  }
  return null;
}

/**
 * One clean. `interactive` is false on a Sunday preview, where nothing can be
 * completed. `showHalf` labels AM or PM in the "later this week" lists, where
 * the section no longer says it.
 */
export function TodayCardRow({
  card,
  interactive,
  showHalf = false,
}: {
  card: TodayCard;
  interactive: boolean;
  showHalf?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-start gap-3">
        <Thumb card={card} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-ink">
            <ZoneDot color={card.zoneColor} />
            {card.zoneName}
            {showHalf ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] font-bold text-ink">
                {card.half === "am" ? "AM" : "PM"}
              </span>
            ) : null}
          </span>
          <span className="break-words text-[17px] font-semibold leading-snug text-ink">{card.itemName}</span>
          {card.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <StatusBadge
                  key={tag.kind}
                  tone={TAG_TONE[tag.kind]}
                  // Long redo notes wrap inside a rounded box instead of a stretched pill.
                  className={cn("max-w-full items-start whitespace-normal break-words rounded-lg text-left", tag.kind === "carry" && "text-ink")}
                >
                  {tag.text}
                </StatusBadge>
              ))}
            </span>
          ) : null}
          {card.statusText ? (
            <p className={cn("flex items-center gap-1.5 text-[14px] font-semibold", STATUS_CLASS[card.statusTone])}>
              {card.statusTone === "success" ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : null}
              {card.statusText}
            </p>
          ) : null}
          {card.detailText ? <p className="text-[13px] text-muted-ink">{card.detailText}</p> : null}
          {card.rejectedText ? <p className="break-words text-[14px] font-semibold text-danger">{card.rejectedText}</p> : null}
        </div>
      </div>
      {interactive && card.status === "planned" ? (
        <CompleteCleanButton assignmentId={card.id} itemName={card.itemName} ifNeeded={card.ifNeeded} />
      ) : null}
      {card.canReject ? <RejectCleanButton id={card.id} itemName={card.itemName} /> : null}
    </li>
  );
}

/** The AM or PM list. */
export function TodaySection({
  title,
  cards,
  interactive,
}: {
  title: string;
  cards: TodayCard[];
  interactive: boolean;
}) {
  const progress = progressText(cards);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold leading-tight text-ink">{title}</h2>
        {progress ? <span className="text-[14px] font-medium text-muted-ink">{progress}</span> : null}
      </div>
      {cards.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-4 text-center text-[15px] text-muted-ink shadow-card">
          Nothing planned.
        </p>
      ) : (
        <SectionCard flush>
          <ul className="divide-y divide-line">
            {cards.map((card) => (
              <TodayCardRow key={card.id} card={card} interactive={interactive} />
            ))}
          </ul>
        </SectionCard>
      )}
    </section>
  );
}
