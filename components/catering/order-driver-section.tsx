import Link from "next/link";

import { DeliveryPlatformToggle } from "@/components/catering/drivers/platform-toggle";
import type { DriverRef } from "@/components/catering/driver-status";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { nextOpenDay, type DeliveryPlatform } from "@/app/(app)/catering/drivers/logic";
import { addStoreCalendarDays } from "@/lib/time";

/**
 * Which Drivers tab lists an order: today's, the next open day's (Saturday
 * gives Monday, matching the night pass), or this week's (today through six
 * days out). Null for an order outside all three, which no tab shows yet.
 */
export function driversPageHref(eventDate: string, today: string): string | null {
  if (eventDate === today) return "/catering/drivers?view=today";
  if (eventDate === nextOpenDay(today)) return "/catering/drivers?view=tomorrow";
  if (eventDate > today && eventDate <= addStoreCalendarDays(today, 6)) return "/catering/drivers?view=week";
  return null;
}

/**
 * The "Driver" card on a delivery order's detail page: which app the order
 * runs through, who is reserved, and a way over to the Drivers page where the
 * reserving happens (this app only records what was booked in Roadway or
 * ezCater). `drivers` is null when the read failed, so a hiccup says so
 * instead of claiming "Needs driver". `open` is false once the order is
 * closed or cancelled and its drivers can no longer change.
 */
export function OrderDriverSection({
  orderId,
  eventDate,
  today,
  platform,
  drivers,
  open,
  canEditPlatform,
  canReserve,
}: {
  orderId: string;
  eventDate: string;
  today: string;
  platform: DeliveryPlatform;
  drivers: DriverRef[] | null;
  open: boolean;
  canEditPlatform: boolean;
  canReserve: boolean;
}) {
  const driversHref = driversPageHref(eventDate, today);
  return (
    <SectionCard title="Driver">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-muted-ink">App</p>
          <DeliveryPlatformToggle orderId={orderId} platform={platform} canEdit={canEditPlatform} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-muted-ink">
            {drivers !== null && drivers.length > 1 ? "Drivers" : "Driver"}
          </p>
          {drivers === null ? (
            <p className="text-[15px] text-muted-ink">Could not load the drivers. Try refreshing.</p>
          ) : drivers.length > 0 ? (
            <p className="text-[15px] font-semibold text-ink">{drivers.map((driver) => driver.name).join(", ")}</p>
          ) : open ? (
            <div>
              <StatusBadge tone="danger">Needs driver</StatusBadge>
            </div>
          ) : (
            <p className="text-[15px] text-muted-ink">No driver was reserved.</p>
          )}
        </div>
        {open && canReserve && (driversHref ? (
          <Link
            href={driversHref}
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline"
          >
            Reserve on the Drivers page
          </Link>
        ) : (
          <p className="text-[13px] text-muted-ink">
            {eventDate < today
              ? "This delivery date has passed."
              : "It shows on the Drivers page the week before it goes out."}
          </p>
        ))}
      </div>
    </SectionCard>
  );
}
