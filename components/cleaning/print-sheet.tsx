import { shortDate, type BoardCard, type DayView } from "@/app/(app)/cleaning/board-view";

/**
 * The paper "Weekly Cleaning Schedule" (docs/CLEANING-PLAN.md "Print"): one
 * table, Mon to Sat across, AM and PM down. Each clean is an empty checkbox,
 * the item in its zone's color, and a short initials line. Constants come
 * first in every cell, then variables, which is the order the days already
 * arrive in from buildWeekView.
 *
 * Plain markup with no client code, so it prints the same on any phone or
 * desktop. The text colors print without "background graphics"; only the
 * legend dots need print-color-adjust, set on .print-exact by the page.
 */

function Entry({ card }: { card: BoardCard }) {
  return (
    <li className="flex items-start gap-1.5 py-[3px]" style={{ color: card.zoneColor }}>
      <span aria-hidden="true" className="mt-[2px] inline-block h-3 w-3 shrink-0 border border-black bg-white" />
      <span className="min-w-0 flex-1 break-words font-semibold leading-tight">{card.name}</span>
      <span aria-hidden="true" className="mt-3 inline-block w-8 shrink-0 border-b border-black" />
    </li>
  );
}

export function PrintSheet({
  rangeLabel,
  sideLabel,
  days,
  legend,
}: {
  /** "Oct 26 to Oct 31, 2026". */
  rangeLabel: string;
  /** "Back of house". */
  sideLabel: string;
  days: DayView[];
  legend: { id: string; name: string; color: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 text-black">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h1 className="text-[22px] font-bold leading-tight print:text-[20px]">Weekly Cleaning Schedule</h1>
        <p className="text-[15px] font-semibold print:text-[13px]">
          {sideLabel} · {rangeLabel}
        </p>
      </div>

      {legend.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] print:text-[11px]" aria-label="Zone colors">
          {legend.map((zone) => (
            <li key={zone.id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="print-exact inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              {zone.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[760px] table-fixed border-collapse border border-black text-[12px] print:min-w-0 print:text-[10px]">
          <thead>
            <tr>
              <th scope="col" className="w-9 border border-black bg-white p-1" />
              {days.map((day) => (
                <th key={day.date} scope="col" className="border border-black bg-white p-1 text-center font-bold">
                  {day.short}
                  <span className="block text-[11px] font-normal print:text-[9px]">{shortDate(day.date)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["am", "pm"] as const).map((half) => (
              <tr key={half} className="break-inside-avoid">
                <th scope="row" className="border border-black bg-white p-1 text-center font-bold">
                  {half.toUpperCase()}
                </th>
                {days.map((day) => (
                  <td key={day.date} className="border border-black p-1.5 align-top">
                    <ul>
                      {day[half].cards.map((card) => (
                        <Entry key={card.id} card={card} />
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
