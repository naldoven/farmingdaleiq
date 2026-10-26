"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { formatDigestClock } from "@/app/(app)/catering/logic";
import { setOrderDrivers } from "@/app/(app)/catering/drivers/actions";
import {
  CAR_SIZE_LABELS,
  DELIVERY_PLATFORM_LABELS,
  MAX_DRIVERS_PER_ORDER,
  RESERVE_APPS,
  joinApps,
  dayLabel,
  largeOrderWarning,
  sortDriversForPicker,
  type BoardOrder,
  type CarSize,
} from "@/app/(app)/catering/drivers/logic";
import type { RosterDriver } from "@/app/(app)/catering/drivers/queries";
import { DeliveryPlatformToggle } from "@/components/catering/drivers/platform-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The driver picker (ARCHITECTURE.md "Catering" > "Driver reservations").
 * One picker serves the whole board: the rows are server markup, and each
 * row's button asks this provider to open the sheet for its order. That keeps
 * the roster in the page payload once, not once per row.
 *
 * Layout: a bottom sheet under 768px, a centered panel above. It is portaled to
 * <body> at z-[60] so it sits over the mobile tab bar (z-40) and header (z-30);
 * a sheet under the tab bar would leave its own buttons untappable.
 *
 * Nothing here is a permission check. setOrderDrivers re-checks
 * catering.drivers on the server and RLS re-checks the write; the page only
 * mounts this for people who hold the key.
 */

const PickerContext = createContext<{ open: (orderId: string) => void } | null>(null);

export function DriverPickerProvider({
  orders,
  roster,
  onSetupByDate,
  canSetPlatform,
  children,
}: {
  orders: BoardOrder[];
  roster: RosterDriver[];
  onSetupByDate: Record<string, string[]>;
  canSetPlatform: boolean;
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const value = useMemo(() => ({ open: setOpenId }), []);
  // Read from the live props, so a platform flip or reservation that refreshes
  // the page shows up in the open sheet. An order that left the list (cancelled
  // elsewhere) simply closes it.
  const order = openId ? orders.find((candidate) => candidate.id === openId) : undefined;

  return (
    <PickerContext value={value}>
      {children}
      {order && (
        <DriverPicker
          key={order.id}
          order={order}
          roster={roster}
          onSetupIds={onSetupByDate[order.eventDate] ?? []}
          canSetPlatform={canSetPlatform}
          onClose={close}
        />
      )}
    </PickerContext>
  );
}

/** The row button. 44px tall; "Mark reserved" while open, "Change" once drivers are set. */
export function ReserveDriverButton({
  orderId,
  guestName,
  hasDrivers,
}: {
  orderId: string;
  guestName: string;
  hasDrivers: boolean;
}) {
  const picker = useContext(PickerContext);
  if (!picker) throw new Error("ReserveDriverButton must be rendered inside DriverPickerProvider.");

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${hasDrivers ? "Change drivers" : "Mark reserved"} for ${guestName}`}
      onClick={() => picker.open(orderId)}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 text-[14px] font-semibold transition-colors",
        hasDrivers
          ? "border border-line bg-card text-ink hover:bg-secondary"
          : "bg-accent text-accent-foreground hover:bg-accent/90",
      )}
    >
      {hasDrivers ? "Change" : "Mark reserved"}
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function appsLabel(driver: Pick<RosterDriver, "hasRoadwayApp" | "hasEzcaterApp">): string {
  const apps = [
    driver.hasRoadwayApp ? DELIVERY_PLATFORM_LABELS.roadway : null,
    driver.hasEzcaterApp ? DELIVERY_PLATFORM_LABELS.ezcater : null,
  ].filter(Boolean);
  return apps.length > 0 ? apps.join(", ") : "No driver apps yet";
}

function DriverOption({
  name,
  detail,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 transition-colors",
        checked ? "border-accent bg-accent-soft" : "border-line bg-card",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-6 shrink-0 accent-accent"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold text-ink">{name}</span>
        <span className="text-[13px] text-muted-ink">{detail}</span>
      </span>
    </label>
  );
}

function OptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-muted-ink">{title}</h3>
      {children}
    </section>
  );
}

function DriverPicker({
  order,
  roster,
  onSetupIds,
  canSetPlatform,
  onClose,
}: {
  order: BoardOrder;
  roster: RosterDriver[];
  onSetupIds: string[];
  canSetPlatform: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(() => order.drivers.map((driver) => driver.profileId));
  const [error, setError] = useState<string | null>(null);

  // Focus moves into the sheet and comes back to the row button on close; the
  // page behind stops scrolling while it is open.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Escape closes, and Tab stays inside the sheet. Both wait while a save is in
  // flight so a half-finished write is never mistaken for a cancel.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!isPending) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (!panel.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (current === first || current === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPending, onClose]);

  const rosterById = new Map(roster.map((driver) => [driver.profileId, driver]));
  const activeDrivers = roster.filter((driver) => driver.active);
  const sorted = sortDriversForPicker(activeDrivers, new Set(onSetupIds));
  const setupGroup = sorted.filter((driver) => driver.onSetup);
  const otherGroup = sorted.filter((driver) => !driver.onSetup);
  // Someone reserved earlier who has since come off the list. Dropping them
  // from the sheet would silently unreserve them on the next save, so they stay
  // visible and checked until a leader unchecks them.
  const activeIds = new Set(activeDrivers.map((driver) => driver.profileId));
  const offList = order.drivers.filter((driver) => !activeIds.has(driver.profileId));

  const selectedSizes = selected.flatMap((id): CarSize[] => {
    const size = rosterById.get(id)?.carSize;
    return size ? [size] : [];
  });
  const warning = largeOrderWarning(order.headcount, selectedSizes);
  const atCap = selected.length >= MAX_DRIVERS_PER_ORDER;
  const hadDrivers = order.drivers.length > 0;
  const clearing = selected.length === 0 && hadDrivers;
  // ezCater orders are reserved in ezCater and in Roadway (RESERVE_APPS).
  const reserveApps = RESERVE_APPS[order.platform];
  const appNames = joinApps(reserveApps);

  function toggle(profileId: string) {
    setError(null);
    setSelected((previous) => {
      if (previous.includes(profileId)) return previous.filter((id) => id !== profileId);
      return previous.length >= MAX_DRIVERS_PER_ORDER ? previous : [...previous, profileId];
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setOrderDrivers({ orderId: order.id, profileIds: selected });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const clock = formatDigestClock(order.eventTime) ?? "Time TBD";
  const guests =
    order.headcount === null ? null : `${order.headcount} ${order.headcount === 1 ? "guest" : "guests"}`;
  const subline = [dayLabel(order.eventDate), guests].filter(Boolean).join(" · ");

  let primaryLabel = "Pick a driver";
  if (clearing) primaryLabel = "Clear drivers";
  else if (selected.length > 0) primaryLabel = `Mark reserved (${selected.length} ${selected.length === 1 ? "driver" : "drivers"})`;

  const option = (driver: RosterDriver) => {
    const checked = selected.includes(driver.profileId);
    return (
      <DriverOption
        key={driver.profileId}
        name={driver.name}
        detail={`${CAR_SIZE_LABELS[driver.carSize]} · ${appsLabel(driver)}`}
        checked={checked}
        disabled={isPending || (!checked && atCap)}
        onChange={() => toggle(driver.profileId)}
      />
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-4">
      <div
        aria-hidden="true"
        onClick={() => {
          if (!isPending) onClose();
        }}
        className="absolute inset-0 bg-ink/50 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-lg outline-none animate-in slide-in-from-bottom-8 fade-in-0 duration-200 motion-reduce:animate-none md:max-h-[85dvh] md:max-w-md md:rounded-2xl md:slide-in-from-bottom-0 md:zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-[19px] font-semibold text-ink">
              {order.guestName} · {clock}
            </h2>
            <p className="text-[13px] text-muted-ink">{subline}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={isPending}
            onClick={onClose}
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-ink hover:bg-secondary disabled:opacity-50"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-muted-ink">Driver app</h3>
            <DeliveryPlatformToggle orderId={order.id} platform={order.platform} canEdit={canSetPlatform} />
          </section>

          {warning && (
            <p
              role="status"
              className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-[13px] font-semibold text-ink"
            >
              {warning}
            </p>
          )}

          {offList.length > 0 && (
            <OptionGroup title="Reserved, no longer on the list">
              {offList.map((driver) => {
                const entry = rosterById.get(driver.profileId);
                return (
                  <DriverOption
                    key={driver.profileId}
                    name={driver.name}
                    detail={entry ? `Off the list · ${CAR_SIZE_LABELS[entry.carSize]}` : "Off the list"}
                    checked={selected.includes(driver.profileId)}
                    disabled={isPending || (!selected.includes(driver.profileId) && atCap)}
                    onChange={() => toggle(driver.profileId)}
                  />
                );
              })}
            </OptionGroup>
          )}

          {setupGroup.length > 0 && (
            <OptionGroup title="On that day's Setup">{setupGroup.map(option)}</OptionGroup>
          )}
          {otherGroup.length > 0 && (
            <OptionGroup title={setupGroup.length > 0 ? "Other drivers" : "Drivers"}>
              {otherGroup.map(option)}
            </OptionGroup>
          )}

          {activeDrivers.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[14px] text-muted-ink">
              No drivers on the list yet. Add them under{" "}
              <Link
                href="/catering/drivers?view=roster"
                onClick={onClose}
                className="font-semibold text-accent underline"
              >
                Roster
              </Link>
              .
            </p>
          )}

          {atCap && (
            <p className="text-[13px] text-muted-ink">Up to {MAX_DRIVERS_PER_ORDER} drivers per order.</p>
          )}
        </div>

        <div className="border-t border-line px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
          {error && (
            <p role="alert" className="mb-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant={clearing ? "destructive" : "default"}
            disabled={isPending || (selected.length === 0 && !hadDrivers)}
            onClick={save}
            className="h-12 w-full text-[15px] font-semibold"
          >
            {isPending ? "Saving..." : primaryLabel}
          </Button>
          <p className="mt-2 text-center text-[13px] text-muted-ink">
            {clearing
              ? `This clears it here only. ${appNames} ${reserveApps.length === 1 ? "is" : "are"} not updated.`
              : `Reserve in ${appNames} first, then tap here.`}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
