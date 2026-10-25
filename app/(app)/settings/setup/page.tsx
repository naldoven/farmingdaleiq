import { SectionCard, StatusBadge } from "@/components/mobile";
import { SetupAreaRow } from "@/components/settings/setup-area-row";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { CODE_DEFAULTS, summarizeStoreSetup } from "@/lib/store-setup/areas";
import { getConfirmedAreas } from "@/lib/store-setup/status";

/**
 * /settings/setup (docs/STORE-SETUP.md). One row per area of store
 * configuration that shipped as a default, with its status, a link to the
 * editor that changes it, and a Mark confirmed toggle. The second card lists
 * the defaults that live in code so none of them is invisible from the app.
 *
 * settings.manage gates the page and the two actions. The editors it links
 * to each re-check their own permission on arrival, so a Director who can
 * confirm an area but lacks, say, catering.manage still cannot change the
 * menu from here.
 */
export const metadata = { title: "Store setup" };

function formatConfirmed(confirmedAt: string, name: string | null): string {
  const date = new Date(confirmedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return name ? `Confirmed ${date} by ${name}` : `Confirmed ${date}`;
}

export default async function StoreSetupPage() {
  await requirePermission("settings.manage");

  const supabase = await createClient();
  const [confirmed, { data: rows }] = await Promise.all([
    getConfirmedAreas(supabase),
    supabase.from("store_setup_areas").select("area_key, confirmed_at, confirmed_by"),
  ]);

  const confirmerIds = Array.from(
    new Set((rows ?? []).map((r) => r.confirmed_by).filter((id): id is string => Boolean(id))),
  );
  const { data: confirmers } = confirmerIds.length
    ? await supabase.from("profiles").select("id, name").in("id", confirmerIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((confirmers ?? []).map((p) => [p.id, p.name]));
  const rowByKey = new Map((rows ?? []).map((r) => [r.area_key, r]));

  const summary = summarizeStoreSetup(confirmed.keys);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <p className="text-[13px] text-muted-ink">
        The app shipped with Avondale guesses where Farmingdale&apos;s values were
        unknown. Open each editor, fix the values, then mark the area confirmed.
        Money areas (costs, prices, token amounts) need the module&apos;s manage
        permission to change.
      </p>

      {confirmed.error && (
        <p role="alert" className="text-[13px] text-danger">
          Couldn&apos;t read confirmations ({confirmed.error}). Every area shows as still
          default until that read works.
        </p>
      )}

      <SectionCard
        title="Areas"
        flush
        action={
          <StatusBadge tone={summary.defaultCount === 0 ? "success" : "warning"}>
            {summary.defaultCount === 0
              ? "All confirmed"
              : `${summary.defaultCount} still default`}
          </StatusBadge>
        }
      >
        <div className="divide-y divide-line">
          {summary.rows.map((row) => {
            const record = rowByKey.get(row.key);
            return (
              <SetupAreaRow
                key={row.key}
                areaKey={row.key}
                title={row.title}
                description={row.description}
                href={row.href}
                status={row.status}
                money={row.money}
                confirmedLabel={
                  row.status === "confirmed" && record
                    ? formatConfirmed(
                        record.confirmed_at,
                        record.confirmed_by ? (nameById.get(record.confirmed_by) ?? null) : null,
                      )
                    : null
                }
              />
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Defaults in code" flush>
        <p className="px-4 pb-2 text-[13px] text-muted-ink">
          These have no editor. Changing one is a code change; ask for it by name.
        </p>
        <div className="divide-y divide-line">
          {CODE_DEFAULTS.map((item) => (
            <div key={item.label} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-ink">{item.label}</p>
                {item.dormant && <StatusBadge tone="neutral">Module off</StatusBadge>}
              </div>
              <p className="text-[13px] text-ink">{item.value}</p>
              <p className="break-all text-[13px] text-muted-ink">{item.where}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
