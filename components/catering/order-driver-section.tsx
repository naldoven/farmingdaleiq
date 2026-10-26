import Link from "next/link";

import { DeliveryPlatformToggle } from "@/components/catering/drivers/platform-toggle";
import type { DriverRef } from "@/components/catering/driver-status";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { nextOpenDay, type DeliveryPlatform } from "@/app/(app)/catering/drivers/logic";

/**
 * Which Drivers tab lists an order: today's, the next open day's (Saturday
 * gives Monday, matching the night pass), or the week for anything else.
 */
export function driversPageHref(eventDate: string, today: string): string {
  if (eventDate === today) return "/catering/drivers?view=today";
  if (eventDate === nextOpenDay(today)) return "/catering/drivers?view=tomorrow";
  return "/catering/drivers?view=week";
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
        {open && canReserve && (
          <Link
            href={driversPageHref(eventDate, today)}
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline"
          >
            Reserve on the Drivers page
          </Link>
        )}
      </div>
    </SectionCard>
  );
}
