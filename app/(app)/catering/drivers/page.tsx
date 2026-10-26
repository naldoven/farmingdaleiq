import type { SupabaseClient } from "@supabase/supabase-js";

import { DriverDayCard } from "@/components/catering/drivers/day-card";
import { DriverPickerProvider } from "@/components/catering/drivers/driver-picker";
import { EscalationContactForm } from "@/components/catering/drivers/escalation-contact-form";
import { AddDriverForm, RosterDriverRow } from "@/components/catering/drivers/roster-editor";
import { DriverViewTabs } from "@/components/catering/drivers/view-tabs";
import { SectionCard, SectionLabel } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { storeLocalDate } from "@/lib/time";
import { driverViewRange, groupBoardOrders } from "@/app/(app)/catering/drivers/logic";
import {
  loadActivePeople,
  loadDeliveryOrders,
  loadEscalationContact,
  loadOnSetupByDate,
  loadRoster,
} from "@/app/(app)/catering/drivers/queries";
import { parseDriverView } from "@/app/(app)/catering/drivers/validation";
import { emptyOrdersMessage, tomorrowTabLabel } from "@/app/(app)/catering/drivers/view-labels";

/**
 * /catering/drivers (ARCHITECTURE.md "Catering" > "Driver reservations" and
 * the page map): delivery orders by day with the ones still needing a driver
 * first, the driver picker, the roster, and the escalation contact.
 *
 * Reading needs catering.view. The three flags below only decide which
 * controls render; every write re-checks its own key in drivers/actions.ts and
 * again in RLS.
 */
export default async function CateringDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission("catering.view");
  const { view: viewParam } = await searchParams;
  const view = parseDriverView(viewParam);
  const today = storeLocalDate();

  const [canReserve, canSetPlatform, canSetContact] = await Promise.all([
    hasPermission("catering.drivers"),
    hasPermission("catering.manage"),
    hasPermission("settings.manage"),
  ]);
  const supabase = await createClient();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>Delivery drivers</SectionLabel>
      <DriverViewTabs view={view} tomorrowLabel={tomorrowTabLabel(today)} />
      {view === "roster" ? (
        <RosterView supabase={supabase} canReserve={canReserve} canSetContact={canSetContact} />
      ) : (
        <OrdersView
          supabase={supabase}
          view={view}
          today={today}
          canReserve={canReserve}
          canSetPlatform={canSetPlatform}
        />
      )}
    </div>
  );
}

async function OrdersView({
  supabase,
  view,
  today,
  canReserve,
  canSetPlatform,
}: {
  supabase: SupabaseClient<Database>;
  view: "today" | "tomorrow" | "week";
  today: string;
  canReserve: boolean;
  canSetPlatform: boolean;
}) {
  const orders = await loadDeliveryOrders(supabase, driverViewRange(view, today));
  const days = groupBoardOrders(orders);

  if (days.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-[15px] text-muted-ink">
        {emptyOrdersMessage(view, today)}
      </p>
    );
  }

  const cards = (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <DriverDayCard key={day.date} day={day} canReserve={canReserve} />
      ))}
    </div>
  );
  // The roster and setups only feed the picker, so people who cannot reserve
  // skip those two queries.
  if (!canReserve) return cards;

  const [roster, onSetupByDate] = await Promise.all([
    loadRoster(supabase),
    loadOnSetupByDate(
      supabase,
      days.map((day) => day.date),
    ),
  ]);
  return (
    <DriverPickerProvider
      orders={orders}
      roster={roster}
      onSetupByDate={onSetupByDate}
      canSetPlatform={canSetPlatform}
    >
      {cards}
    </DriverPickerProvider>
  );
}

async function RosterView({
  supabase,
  canReserve,
  canSetContact,
}: {
  supabase: SupabaseClient<Database>;
  canReserve: boolean;
  canSetContact: boolean;
}) {
  const [roster, contact, people] = await Promise.all([
    loadRoster(supabase),
    loadEscalationContact(supabase),
    canReserve || canSetContact ? loadActivePeople(supabase) : Promise.resolve([]),
  ]);
  // Someone off the list is still on the roster (their row has the switch to
  // bring them back), so they are not offered again here.
  const onRoster = new Set(roster.map((driver) => driver.profileId));
  const addable = people.filter((person) => !onRoster.has(person.id));
  const activeCount = roster.filter((driver) => driver.active).length;

  return (
    <>
      <SectionCard
        title="Driver roster"
        flush
        action={<span className="text-[13px] text-muted-ink">{activeCount} on the list</span>}
      >
        {roster.length === 0 ? (
          <p className="border-t border-line px-4 py-6 text-center text-[14px] text-muted-ink">
            No drivers on the list yet.
          </p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {roster.map((driver) => (
              <RosterDriverRow key={driver.profileId} driver={driver} canEdit={canReserve} />
            ))}
          </ul>
        )}
      </SectionCard>

      {canReserve && (
        <SectionCard title="Add a driver">
          <AddDriverForm people={addable} />
        </SectionCard>
      )}

      <SectionCard title="Escalation contact">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[15px] font-semibold text-ink">
              {contact ? contact.name : "Nobody set. Escalations only post to Discord."}
            </p>
            <p className="text-[13px] text-muted-ink">
              Gets a push when a delivery still has no driver at 6 AM, or 30 minutes before it leaves.
            </p>
          </div>
          {canSetContact && <EscalationContactForm current={contact} people={people} />}
        </div>
      </SectionCard>
    </>
  );
}
