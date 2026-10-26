"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import {
  addLabel,
  isMovable,
  isPastDay,
  isRestorable,
  type DayView,
  type PullItem,
  type SlotView,
  type TrayRow,
} from "@/app/(app)/cleaning/board-view";
import { addClean } from "@/app/(app)/cleaning/week-actions";
import { WeekCard, ZoneDot } from "@/components/cleaning/week-card";
import { WeekCardSheet } from "@/components/cleaning/week-card-sheet";
import { WeekPullPicker } from "@/components/cleaning/week-pull-picker";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LOAD_TONE = { open: "neutral", full: "warning", over: "danger" } as const;

export interface WeekBoardProps {
  weekStart: string;
  /** Store-local today, for disabling days that already ended. */
  today: string;
  /** The day to open on, 1 = Monday .. 6 = Saturday. */
  initialWeekday: number;
  /** Planners edit; leaders see the same board read only. */
  canPlan: boolean;
  days: DayView[];
  tray: TrayRow[];
  pullItems: PullItem[];
  onBoardItemIds: string[];
}

function SlotSection({
  slot,
  canPlan,
  onOpen,
}: {
  slot: SlotView;
  canPlan: boolean;
  onOpen: (id: string) => void;
}) {
  const name = slot.half === "am" ? "AM" : "PM";
  return (
    <section aria-label={`${name} cleans`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[19px] font-semibold text-ink">{name}</h3>
        <StatusBadge tone={LOAD_TONE[slot.variables.state]}>{slot.variables.label}</StatusBadge>
      </div>
      {slot.cards.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-4 text-[15px] text-muted-ink shadow-card">
          Nothing planned.
        </p>
      ) : (
        <SectionCard flush>
          <ul className="divide-y divide-line">
            {slot.cards.map((card) => (
              <li key={card.id}>
                <WeekCard
                  card={card}
                  onOpen={canPlan && (isMovable(card) || isRestorable(card)) ? () => onOpen(card.id) : undefined}
                />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </section>
  );
}

/**
 * The week board: day chips Mon to Sat with a count each, then the selected
 * day's AM and PM sections (constants first), the pull-in button, and the
 * "due, not placed" tray. The whole week is already loaded, so switching days
 * is instant and keeps the day in the URL (history.replaceState) for a shared
 * or reloaded link without a round trip on store wifi.
 *
 * Every change goes through a planner server action and then router.refresh();
 * leaders get the same view with no way in.
 */
export function WeekBoard({
  weekStart,
  today,
  initialWeekday,
  canPlan,
  days,
  tray,
  pullItems,
  onBoardItemIds,
}: WeekBoardProps) {
  const router = useRouter();
  const [weekday, setWeekday] = useState(initialWeekday);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const day = days.find((d) => d.weekday === weekday) ?? days[0]!;
  const past = isPastDay(day.date, today);

  const openCard = useMemo(() => {
    if (!openId) return null;
    for (const d of days) {
      const found = [...d.am.cards, ...d.pm.cards].find((c) => c.id === openId);
      if (found) return found;
    }
    return null;
  }, [days, openId]);

  function selectDay(next: number) {
    setWeekday(next);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("day", String(next));
    window.history.replaceState(null, "", url);
  }

  async function addFromTray(row: TrayRow, half: "am" | "pm") {
    if (busy) return;
    setBusy(`${row.itemId}|${half}`);
    setError(null);
    try {
      const result = await addClean({ itemId: row.itemId, date: day.date, half });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Day of the week" className="grid grid-cols-6 gap-1.5">
        {days.map((d) => {
          const selected = d.weekday === day.weekday;
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={selected}
              aria-current={d.date === today ? "date" : undefined}
              aria-label={`${d.longLabel}, ${d.count} ${d.count === 1 ? "clean" : "cleans"}`}
              onClick={() => selectDay(d.weekday)}
              className={cn(
                "flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-colors",
                selected ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:bg-secondary",
              )}
            >
              <span className="text-[12px] font-semibold uppercase tracking-wide opacity-80">{d.short}</span>
              <span className="flex items-center gap-1 text-[18px] font-bold leading-none">
                {d.date === today ? (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                ) : null}
                {d.dayOfMonth}
              </span>
              <span
                className={cn(
                  "min-w-[22px] rounded-full px-1.5 text-[12px] font-semibold",
                  selected ? "bg-white/20" : "bg-secondary text-muted-ink",
                )}
              >
                {d.count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[14px] font-medium text-danger">
          {error}
        </p>
      ) : null}

      <section aria-label={day.longLabel} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[22px] font-bold leading-tight text-ink">{day.longLabel}</h2>
          {day.date === today ? <StatusBadge tone="accent">Today</StatusBadge> : null}
          {past ? <StatusBadge tone="neutral">Passed</StatusBadge> : null}
        </div>
        <SlotSection slot={day.am} canPlan={canPlan} onOpen={setOpenId} />
        <SlotSection slot={day.pm} canPlan={canPlan} onOpen={setOpenId} />
      </section>

      {canPlan ? (
        <Button
          variant="outline"
          className="h-12 w-full rounded-xl text-[16px]"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-5" aria-hidden="true" />
          Pull from master list
        </Button>
      ) : null}

      {tray.length > 0 ? (
        <section aria-label="Due, not placed" className="flex flex-col gap-2">
          <h2 className="text-[22px] font-bold leading-tight text-ink">
            Due, not placed <span className="text-muted-ink">{tray.length}</span>
          </h2>
          <p className="text-[14px] text-muted-ink">
            Due this week but they did not fit. Left here, they go first in next week&apos;s build.
            {canPlan ? " Adding past a slot's cap is allowed and shows as over." : ""}
          </p>
          <SectionCard flush>
            <ul className="divide-y divide-line">
              {tray.map((row) => (
                <li key={row.itemId} className="flex flex-col gap-3 px-4 py-3">
                  <span className="flex flex-col gap-1">
                    <span className="break-words text-[16px] font-semibold text-ink">{row.name}</span>
                    <span className="flex items-center gap-2 text-[13px] text-muted-ink">
                      <ZoneDot color={row.zoneColor} />
                      {row.zoneName} · {row.cadence}
                    </span>
                  </span>
                  {canPlan ? (
                    <span className="flex gap-2">
                      {(["am", "pm"] as const).map((half) => (
                        <Button
                          key={half}
                          variant="outline"
                          className="h-11 flex-1 rounded-lg text-[14px]"
                          aria-label={`${addLabel(day.date, half)}: ${row.name}`}
                          disabled={past || busy !== null}
                          onClick={() => addFromTray(row, half)}
                        >
                          {busy === `${row.itemId}|${half}` ? "Adding..." : addLabel(day.date, half)}
                        </Button>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>
      ) : null}

      {openCard && canPlan ? (
        <WeekCardSheet
          // A fresh sheet per card, so one card's half-typed reason never shows on the next.
          key={openCard.id}
          card={openCard}
          weekStart={weekStart}
          today={today}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      ) : null}

      {pickerOpen && canPlan ? (
        <WeekPullPicker
          items={pullItems}
          onBoardIds={onBoardItemIds}
          date={day.date}
          dayLabel={day.label}
          past={past}
          onClose={() => setPickerOpen(false)}
          onAdded={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
