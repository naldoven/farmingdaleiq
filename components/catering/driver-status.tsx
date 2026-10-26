import { StatusBadge } from "@/components/mobile";

export interface DriverRef {
  profileId: string;
  name: string;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Badge text for a delivery order: "Needs driver", "Driver: Messiah", or
 * "Drivers: Messiah, Jordan". First names keep a 248px board card compact; two
 * drivers who share a first name fall back to full names so the badge never
 * reads as one person listed twice.
 */
export function driverStatusLabel(drivers: DriverRef[]): string {
  if (drivers.length === 0) return "Needs driver";
  const firsts = drivers.map((driver) => firstName(driver.name));
  const names = new Set(firsts).size === firsts.length ? firsts : drivers.map((driver) => driver.name);
  return `${drivers.length === 1 ? "Driver" : "Drivers"}: ${names.join(", ")}`;
}

/** Danger when nobody is reserved, success once someone is. The words carry the meaning, not the tint. */
export function DriverStatusBadge({ drivers }: { drivers: DriverRef[] }) {
  return (
    <StatusBadge tone={drivers.length === 0 ? "danger" : "success"} className="max-w-full text-left">
      {driverStatusLabel(drivers)}
    </StatusBadge>
  );
}
