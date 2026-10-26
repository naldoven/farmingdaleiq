import Link from "next/link";

import { dayLabel, type DriverPass } from "@/app/(app)/catering/drivers/logic";
import type { ScorecardView } from "@/app/(app)/catering/drivers/queries";
import { formatDigestClock } from "@/app/(app)/catering/logic";
import { ListRow, ProgressBar, SectionCard, StatTile, StatusBadge } from "@/components/mobile";

export const PASS_LABELS: Record<DriverPass, string> = {
  night: "Night pass",
  morning: "Morning pass",
  sameDay: "Same day",
};

const PASS_ORDER: DriverPass[] = ["night", "morning", "sameDay"];

const WEEK_LINK = "inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline";

/**
 * Weekly driver scorecard for /catering/analytics (ARCHITECTURE.md "Driver
 * scorecard"). Built for a review with leaders, so the copy says up front that
 * nothing here is scored against anyone. `card` is null when the read failed;
 * the rest of Analytics must keep working, so that case says so in place.
 */
export function DriverScorecardSection({
  title,
  card,
  prevHref,
  nextHref,
}: {
  title: string;
  card: ScorecardView | null;
  prevHref: string;
  /** Null on the current week: there is nothing newer to show. */
  nextHref: string | null;
}) {
  return (
    <SectionCard title="Driver reservations">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          <div className="flex items-center justify-between">
            <Link href={prevHref} className={WEEK_LINK}>
              Previous week
            </Link>
            {nextHref && (
              <Link href={nextHref} className={WEEK_LINK}>
                Next week
              </Link>
            )}
          </div>
        </div>

        {card === null ? (
          <p className="text-[15px] text-muted-ink">Could not load the driver scorecard. Try refreshing.</p>
        ) : (
          <ScorecardBody card={card} />
        )}

        <p className="text-[13px] text-muted-ink">
          On time means marked reserved with no escalation. This is for review with leaders. Nothing is penalized
          automatically.
        </p>
      </div>
    </SectionCard>
  );
}

function ScorecardBody({ card }: { card: ScorecardView }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={card.deliveries} label="Deliveries" />
        <StatTile
          value={
            card.onTimePct === null ? (
              <span className="text-[17px] leading-tight">No deliveries</span>
            ) : (
              `${card.onTimePct}%`
            )
          }
          label="On time"
        />
        <StatTile value={card.escalated} label="Escalations" tone={card.escalated > 0 ? "warning" : "neutral"} />
      </div>

      <div className="flex flex-col gap-3">
        {PASS_ORDER.map((pass) => {
          const { total, onTime } = card.byPass[pass];
          return (
            <div key={pass} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{PASS_LABELS[pass]}</span>
                <span className="text-[13px] text-muted-ink">
                  {total === 0 ? "No deliveries" : `${onTime} of ${total} on time`}
                </span>
              </div>
              <ProgressBar
                value={total === 0 ? 0 : (onTime / total) * 100}
                showLabel={false}
                tone={onTime === total ? "success" : "warning"}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-[15px] font-semibold text-ink">Escalations by leader</h4>
        <p className="text-[13px] text-muted-ink">The leader who got the last reminder before each escalation.</p>
        {card.byLeader.length === 0 ? (
          <p className="text-[15px] text-muted-ink">None this week.</p>
        ) : (
          <div className="-mx-4 divide-y divide-line">
            {card.byLeader.map((leader) => (
              <ListRow
                key={leader.leaderId}
                title={card.names[leader.leaderId] ?? "Unknown"}
                trailing={<span className="text-[15px] font-semibold text-ink">{leader.escalations}</span>}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-[15px] font-semibold text-ink">Escalated orders</h4>
        {card.escalations.length === 0 ? (
          <p className="text-[15px] text-muted-ink">None this week.</p>
        ) : (
          <div className="-mx-4 divide-y divide-line">
            {card.escalations.map((escalation) => (
              <ListRow
                key={escalation.orderId}
                href={`/catering/orders/${escalation.orderId}`}
                title={escalation.guestName}
                description={[dayLabel(escalation.eventDate), formatDigestClock(escalation.eventTime)]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={<StatusBadge tone="neutral">{PASS_LABELS[escalation.pass]}</StatusBadge>}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
