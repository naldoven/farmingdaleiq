import Link from "next/link";

import { formatDigestClock } from "@/app/(app)/catering/logic";
import { RESERVE_LABELS, type BoardDay, type BoardOrder } from "@/app/(app)/catering/drivers/logic";
import { ReserveDriverButton } from "@/components/catering/drivers/driver-picker";
import { ProgressBar, SectionCard, StatusBadge } from "@/components/mobile";

/**
 * One delivery day on the Drivers board: the "4 of 6 reserved" count with a
 * bar, then its orders with open ones first (groupBoardOrders already sorted
 * them). `canReserve` only decides whether the row carries the picker button;
 * setOrderDrivers re-checks catering.drivers on the server.
 */
export function DriverDayCard({ day, canReserve }: { day: BoardDay; canReserve: boolean }) {
  const allReserved = day.reserved === day.total;
  return (
    <SectionCard title={day.label} flush>
      <div className="px-4 pb-3">
        <ProgressBar
          value={day.total === 0 ? 0 : (day.reserved / day.total) * 100}
          tone={allReserved ? "success" : "warning"}
          showLabel={false}
          label={`${day.reserved} of ${day.total} reserved`}
        />
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {day.orders.map((order) => (
          <DriverOrderRow key={order.id} order={order} canReserve={canReserve} />
        ))}
      </ul>
    </SectionCard>
  );
}

function DriverOrderRow({ order, canReserve }: { order: BoardOrder; canReserve: boolean }) {
  const clock = formatDigestClock(order.eventTime) ?? "Time TBD";
  const guests =
    order.headcount === null ? null : `${order.headcount} ${order.headcount === 1 ? "guest" : "guests"}`;
  const reserved = order.drivers.length > 0;

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tabular-nums text-muted-ink">{clock}</p>
          <Link
            href={`/catering/orders/${order.id}`}
            className="break-words text-[15px] font-semibold text-ink hover:underline"
          >
            {order.guestName}
          </Link>
          {guests && <p className="text-[13px] text-muted-ink">{guests}</p>}
        </div>
        <StatusBadge tone={order.platform === "ezcater" ? "warning" : "info"} className="shrink-0">
          {RESERVE_LABELS[order.platform]}
        </StatusBadge>
      </div>
      <div className="flex items-center justify-between gap-3">
        {reserved ? (
          <StatusBadge tone="success" className="min-w-0 rounded-xl whitespace-normal">
            {order.drivers.map((driver) => driver.name).join(", ")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="danger" dot>
            Needs driver
          </StatusBadge>
        )}
        {canReserve && <ReserveDriverButton orderId={order.id} guestName={order.guestName} hasDrivers={reserved} />}
      </div>
    </li>
  );
}
