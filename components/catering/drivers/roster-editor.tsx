"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveDriver } from "@/app/(app)/catering/drivers/actions";
import { CAR_SIZES, CAR_SIZE_LABELS, DELIVERY_PLATFORM_LABELS, type CarSize } from "@/app/(app)/catering/drivers/logic";
import type { PersonOption, RosterDriver } from "@/app/(app)/catering/drivers/queries";
import { StatusBadge } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The driver roster controls (ARCHITECTURE.md "Catering" > "Driver
 * reservations": car size, which apps they have, on or off the list). Hiding
 * these from people without catering.drivers is a convenience; saveDriver
 * checks the key on the server and RLS re-checks the write.
 */

/** Small car / Large car. Same look as the Roadway / ezCater switch so the two read as one family. */
function CarSizeControl({
  value,
  onChange,
  label,
  disabled,
}: {
  value: CarSize;
  onChange: (size: CarSize) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {CAR_SIZES.map((size) => {
        const selected = value === size;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(size)}
            className={cn(
              "min-h-11 flex-1 rounded-lg border-2 px-3 text-[14px] font-semibold transition-colors disabled:opacity-50",
              selected
                ? "border-accent bg-accent-soft text-accent-ink"
                : "border-line bg-card text-muted-ink hover:text-ink",
            )}
          >
            {CAR_SIZE_LABELS[size]}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  disabled,
  role,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  role?: "switch";
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-card px-3 text-[14px] font-medium text-ink",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        role={role}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-accent"
      />
      {label}
    </label>
  );
}

function appsSummary(driver: Pick<RosterDriver, "hasRoadwayApp" | "hasEzcaterApp">): string {
  const apps = [
    driver.hasRoadwayApp ? DELIVERY_PLATFORM_LABELS.roadway : null,
    driver.hasEzcaterApp ? DELIVERY_PLATFORM_LABELS.ezcater : null,
  ].filter(Boolean);
  return apps.length > 0 ? apps.join(", ") : "No driver apps yet";
}

/** One roster entry. Read-only text for viewers; inline controls plus Save for catering.drivers. */
export function RosterDriverRow({ driver, canEdit }: { driver: RosterDriver; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [carSize, setCarSize] = useState<CarSize>(driver.carSize);
  const [roadway, setRoadway] = useState(driver.hasRoadwayApp);
  const [ezcater, setEzcater] = useState(driver.hasEzcaterApp);
  const [active, setActive] = useState(driver.active);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // What is stored, as far as this row knows. Compared against instead of the
  // props so Save goes quiet the moment a save lands, not when the refresh does.
  const [stored, setStored] = useState({
    carSize: driver.carSize,
    roadway: driver.hasRoadwayApp,
    ezcater: driver.hasEzcaterApp,
    active: driver.active,
  });

  const dirty =
    carSize !== stored.carSize ||
    roadway !== stored.roadway ||
    ezcater !== stored.ezcater ||
    active !== stored.active;

  const edited = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setSaved(false);
    setError(null);
  };

  const header = (
    <div className="flex items-center justify-between gap-2">
      <p className={cn("text-[15px] font-semibold", driver.active ? "text-ink" : "text-muted-ink")}>{driver.name}</p>
      {!driver.active && <StatusBadge tone="neutral">Off the list</StatusBadge>}
    </div>
  );

  if (!canEdit) {
    return (
      <li className="flex flex-col gap-0.5 px-4 py-3">
        {header}
        <p className={cn("text-[13px]", driver.active ? "text-muted-ink" : "text-muted-ink/70")}>
          {CAR_SIZE_LABELS[driver.carSize]} · {appsSummary(driver)}
        </p>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {header}
      <CarSizeControl
        value={carSize}
        onChange={edited(setCarSize)}
        label={`Car size for ${driver.name}`}
        disabled={isPending}
      />
      <div className="grid grid-cols-2 gap-2">
        <CheckRow
          label={`${DELIVERY_PLATFORM_LABELS.roadway} app`}
          checked={roadway}
          onChange={edited(setRoadway)}
          disabled={isPending}
        />
        <CheckRow
          label={`${DELIVERY_PLATFORM_LABELS.ezcater} app`}
          checked={ezcater}
          onChange={edited(setEzcater)}
          disabled={isPending}
        />
      </div>
      <CheckRow label="On the driver list" role="switch" checked={active} onChange={edited(setActive)} disabled={isPending} />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={!dirty || isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await saveDriver({
                profileId: driver.profileId,
                carSize,
                hasRoadwayApp: roadway,
                hasEzcaterApp: ezcater,
                active,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStored({ carSize, roadway, ezcater, active });
              setSaved(true);
              router.refresh();
            });
          }}
          className="h-11 min-w-24 text-[14px] font-semibold"
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
        {saved && !dirty && (
          <p role="status" className="text-[13px] font-semibold text-success">
            Saved
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

/** Adds a team member to the roster. People already on it (even off the list) are filtered out by the page. */
export function AddDriverForm({ people }: { people: PersonOption[] }) {
  const router = useRouter();
  const selectId = useId();
  const [isPending, startTransition] = useTransition();
  const [profileId, setProfileId] = useState("");
  const [carSize, setCarSize] = useState<CarSize>("small");
  const [roadway, setRoadway] = useState(false);
  const [ezcater, setEzcater] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (people.length === 0) {
    return <p className="text-[14px] text-muted-ink">Everyone on the team is already on the list.</p>;
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!profileId) {
          setError("Pick a team member first.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await saveDriver({
            profileId,
            carSize,
            hasRoadwayApp: roadway,
            hasEzcaterApp: ezcater,
            active: true,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setProfileId("");
          setCarSize("small");
          setRoadway(false);
          setEzcater(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-[13px] font-semibold text-ink">
          Team member
        </label>
        <select
          id={selectId}
          value={profileId}
          disabled={isPending}
          onChange={(event) => {
            setProfileId(event.target.value);
            setError(null);
          }}
          className="h-11 w-full rounded-lg border border-line bg-card px-3 text-[16px] text-ink disabled:opacity-50"
        >
          <option value="">Choose a team member</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <CarSizeControl value={carSize} onChange={setCarSize} label="Car size" disabled={isPending} />
      <div className="grid grid-cols-2 gap-2">
        <CheckRow
          label={`${DELIVERY_PLATFORM_LABELS.roadway} app`}
          checked={roadway}
          onChange={setRoadway}
          disabled={isPending}
        />
        <CheckRow
          label={`${DELIVERY_PLATFORM_LABELS.ezcater} app`}
          checked={ezcater}
          onChange={setEzcater}
          disabled={isPending}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="h-11 min-w-28 text-[14px] font-semibold">
          {isPending ? "Adding..." : "Add driver"}
        </Button>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
