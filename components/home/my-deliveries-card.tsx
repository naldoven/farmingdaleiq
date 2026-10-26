import Link from "next/link";

import {
  DELIVERY_PLATFORMS,
  DELIVERY_PLATFORM_LABELS,
  type BoardOrder,
  type DeliveryPlatform,
} from "@/app/(app)/catering/drivers/logic";
import { formatDigestClock } from "@/app/(app)/catering/logic";
import { SectionCard } from "@/components/mobile";

/**
 * The reminder under the list. It names only the apps today's orders actually
 * use, so a driver with one ezCater run isn't told to check Roadway.
 */
export function signInHint(platforms: DeliveryPlatform[]): string {
  const used = DELIVERY_PLATFORMS.filter((platform) => platforms.includes(platform)).map(
    (platform) => DELIVERY_PLATFORM_LABELS[platform],
  );
  if (used.length === 0) return "Sign in to your delivery app before you leave.";
  if (used.length === 1) return `Sign in to the ${used[0]} app before you leave.`;
  return `Sign in to the ${used.join(" and ")} apps before you leave.`;
}

function headcountLabel(headcount: number | null): string | null {
  if (headcount === null) return null;
  return `${headcount} ${headcount === 1 ? "guest" : "guests"}`;
}

/**
 * Home card for a reserved driver on their delivery day (ARCHITECTURE.md
 * "Driver reservations"). Renders nothing when there is nothing to deliver, so
 * most people never see it. The accent border lifts it above the routine
 * cards without the alarm tint that "overdue" uses.
 */
export function MyDeliveriesCard({ orders }: { orders: BoardOrder[] }) {
  if (orders.length === 0) return null;

  return (
    <SectionCard title="Your deliveries today" className="border-accent">
      <ul className="flex flex-col divide-y divide-line">
        {orders.map((order) => {
          const detail = [DELIVERY_PLATFORM_LABELS[order.platform], headcountLabel(order.headcount)]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={order.id}>
              <Link
                href={`/catering/orders/${order.id}`}
                className="flex min-h-11 items-start gap-3 py-2.5 first:pt-0"
              >
                <span className="w-[78px] shrink-0 text-[15px] font-bold tabular-nums text-ink">
                  {formatDigestClock(order.eventTime) ?? "Time TBD"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{order.guestName}</span>
                  <span className="text-[13px] text-muted-ink">{detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[13px] text-muted-ink">{signInHint(orders.map((order) => order.platform))}</p>
    </SectionCard>
  );
}
