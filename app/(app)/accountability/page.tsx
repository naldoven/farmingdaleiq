import {
  AvatarInitials,
  ListRow,
  SectionCard,
  StatTile,
  StatusBadge,
} from "@/components/mobile";
import { AccountabilitySettingsForm } from "@/components/accountability/settings-form";
import { AcknowledgeButton } from "@/components/accountability/acknowledge-button";
import {
  DeleteDisciplinaryActionTypeButton,
  DeleteInfractionTypeButton,
} from "@/components/accountability/delete-row-button";
import { DisciplinaryTypeCreateForm } from "@/components/accountability/disciplinary-type-form";
import { InfractionTypeCreateForm } from "@/components/accountability/infraction-type-form";
import { IssueInfractionForm } from "@/components/accountability/issue-infraction-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeActivePoints } from "@/app/(app)/accountability/logic";
import { fetchMyInfractions } from "@/app/(app)/accountability/queries";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * /accountability — ARCHITECTURE.md page map: "Issue infractions; my record;
 * admin: types, ladder, period settings." Every section below is gated by
 * the same permission its writes require (accountability.view_own/
 * .issue/.manage), matching what RLS independently enforces.
 *
 * KitchenIQ mobile redesign (docs/DESIGN-SYSTEM.md): each section is a white
 * rounded SectionCard, lists use ListRow/StatusBadge instead of shadcn
 * Table, and the active-points count is a StatTile. Visual/layout only —
 * queries, server actions, and permission gates are unchanged.
 */
export default async function AccountabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [canViewOwn, canIssue, canManage] = await Promise.all([
    hasPermission("accountability.view_own"),
    hasPermission("accountability.issue"),
    hasPermission("accountability.manage"),
  ]);

  const now = new Date();

  // My record -----------------------------------------------------------
  let myPoints = 0;
  let myInfractions: Awaited<ReturnType<typeof fetchMyInfractions>>["data"] = [];
  let myActions: { id: string; type_id: string; status: string; triggered_at: string; acknowledged_at: string | null }[] = [];
  let disciplinaryTypeNameById = new Map<string, string>();

  if (canViewOwn && user) {
    const [{ data: infractions }, { data: actions }, { data: types }] = await Promise.all([
      fetchMyInfractions(supabase),
      supabase
        .from("disciplinary_actions")
        .select("id, type_id, status, triggered_at, acknowledged_at")
        .eq("user_id", user.id)
        .order("triggered_at", { ascending: false }),
      supabase.from("disciplinary_action_types").select("id, name"),
    ]);
    myInfractions = infractions;
    myPoints = computeActivePoints(infractions, now);
    myActions = actions ?? [];
    disciplinaryTypeNameById = new Map((types ?? []).map((t) => [t.id, t.name]));
  }

  // Issue infraction ------------------------------------------------------
  let people: { id: string; name: string }[] = [];
  let infractionTypeOptions: { id: string; name: string; points: number }[] = [];
  if (canIssue) {
    const [{ data: profiles }, { data: types }] = await Promise.all([
      supabase.from("profiles").select("id, name").eq("active", true).order("name"),
      supabase
        .from("infraction_types")
        .select("id, name, points")
        .eq("active", true)
        .order("name"),
    ]);
    people = (profiles ?? []).filter((p) => p.id !== user?.id);
    infractionTypeOptions = types ?? [];
  }

  // Admin -------------------------------------------------------------------
  let allInfractionTypes: { id: string; name: string; points: number; active: boolean }[] = [];
  let allDisciplinaryTypes: { id: string; name: string; threshold_points: number; sort: number }[] = [];
  let settings: { id: string; period_kind: string; period_days: number } | null = null;
  let storeLog: {
    id: string;
    user_id: string;
    type_id: string;
    points: number;
    issued_at: string;
    issued_by: string | null;
  }[] = [];
  let profileNameById = new Map<string, string>();

  if (canManage) {
    const [
      { data: types },
      { data: ladder },
      { data: settingsRow },
      { data: log },
      { data: allProfiles },
    ] = await Promise.all([
      supabase.from("infraction_types").select("id, name, points, active").order("name"),
      supabase
        .from("disciplinary_action_types")
        .select("id, name, threshold_points, sort")
        .order("sort"),
      supabase.from("accountability_settings").select("id, period_kind, period_days").maybeSingle(),
      supabase
        .from("infractions")
        .select("id, user_id, type_id, points, issued_at, issued_by")
        .order("issued_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("id, name"),
    ]);
    allInfractionTypes = types ?? [];
    allDisciplinaryTypes = ladder ?? [];
    settings = settingsRow ?? null;
    storeLog = log ?? [];
    profileNameById = new Map((allProfiles ?? []).map((p) => [p.id, p.name]));
  }

  // Only rendered inside the canManage block below, which is the only place
  // allInfractionTypes is ever populated (and it always includes every type,
  // active or not).
  const infractionTypeNameById = new Map(allInfractionTypes.map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4">
      {canViewOwn && (
        <>
          <SectionCard title="My record">
            <div className="flex flex-col gap-3">
              <StatTile
                value={myPoints}
                label="Active points"
                tone={myPoints > 0 ? "danger" : "success"}
                className="w-full"
              />
              <p className="text-[13px] text-muted-ink">
                You never see who issued an infraction, only its points and note.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Infraction history" flush>
            {myInfractions.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-muted-ink">
                No infractions on record.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {myInfractions.map((i) => (
                  <ListRow
                    key={i.id}
                    title={i.type_name}
                    description={
                      `Issued ${formatDate(i.issued_at)} · Expires ${formatDate(i.expires_at)}` +
                      (i.note ? ` · ${i.note}` : "")
                    }
                    trailing={
                      <span className="shrink-0 text-[15px] font-bold text-danger">
                        {i.points} pts
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {myActions.length > 0 && (
            <SectionCard title="Disciplinary actions" flush>
              <div className="divide-y divide-line">
                {myActions.map((a) => (
                  <ListRow
                    key={a.id}
                    title={disciplinaryTypeNameById.get(a.type_id) ?? "Disciplinary action"}
                    description={`Triggered ${formatDate(a.triggered_at)}`}
                    trailing={
                      <div className="flex flex-col items-end gap-1.5">
                        <StatusBadge tone={a.status === "pending" ? "warning" : "neutral"}>
                          {a.status}
                        </StatusBadge>
                        {a.status === "pending" && <AcknowledgeButton id={a.id} />}
                      </div>
                    }
                  />
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {canIssue && (
        <SectionCard title="Issue an infraction">
          <p className="-mt-2 mb-3 text-[13px] text-muted-ink">
            The recipient will see the points, not you.
          </p>
          {people.length === 0 || infractionTypeOptions.length === 0 ? (
            <p className="text-[13px] text-muted-ink">
              No people or infraction types available yet.
            </p>
          ) : (
            <IssueInfractionForm people={people} types={infractionTypeOptions} />
          )}
        </SectionCard>
      )}

      {canManage && (
        <>
          <SectionCard title="Accountability period">
            <p className="-mt-2 mb-3 text-[13px] text-muted-ink">
              Rolling: points expire N days after issuance. Fixed: everyone&apos;s points
              reset together on a shared window.
            </p>
            {settings ? (
              <AccountabilitySettingsForm
                id={settings.id}
                periodKind={settings.period_kind}
                periodDays={settings.period_days}
              />
            ) : (
              <p className="text-[13px] text-muted-ink">No settings row found.</p>
            )}
          </SectionCard>

          <SectionCard title="Infraction types">
            <div className="flex flex-col gap-3">
              <InfractionTypeCreateForm />
              {allInfractionTypes.length === 0 ? (
                <p className="text-[13px] text-muted-ink">No infraction types yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {allInfractionTypes.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ink">{t.name}</p>
                        <p className="text-[13px] text-muted-ink">{t.points} pts</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone={t.active ? "success" : "neutral"}>
                          {t.active ? "Active" : "Inactive"}
                        </StatusBadge>
                        <DeleteInfractionTypeButton id={t.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Disciplinary ladder">
            <div className="flex flex-col gap-3">
              <DisciplinaryTypeCreateForm nextSort={allDisciplinaryTypes.length + 1} />
              {allDisciplinaryTypes.length === 0 ? (
                <p className="text-[13px] text-muted-ink">No ladder rungs yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {allDisciplinaryTypes.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <p className="truncate text-[15px] font-semibold text-ink">{t.name}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-semibold text-muted-ink">
                          {t.threshold_points} pts
                        </span>
                        <DeleteDisciplinaryActionTypeButton id={t.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Recent infractions"
            action={<span className="text-[13px] text-muted-ink">Store-wide</span>}
            flush
          >
            {storeLog.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-muted-ink">
                No infractions issued yet.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {storeLog.map((i) => {
                  const personName = profileNameById.get(i.user_id) ?? "—";
                  const issuedByName = i.issued_by
                    ? (profileNameById.get(i.issued_by) ?? "—")
                    : "—";
                  return (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                      <AvatarInitials name={personName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink">
                          {personName}
                        </p>
                        <p className="truncate text-[13px] text-muted-ink">
                          {infractionTypeNameById.get(i.type_id) ?? "—"} · Issued by{" "}
                          {issuedByName} · {formatDate(i.issued_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[15px] font-bold text-danger">
                        {i.points} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
