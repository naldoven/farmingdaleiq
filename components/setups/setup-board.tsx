"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvatarInitials, ChipRow, FilterChip, SectionCard, StatusBadge, type StatusTone } from "@/components/mobile";
import {
  addShiftNote,
  assignPosition,
  createSetup,
  postSetup,
  removeAssignment,
  selectTopPerformer,
  suggestAssignees,
} from "@/app/(app)/setups/actions";
import { isoToLocalInput, localInputToIso } from "@/components/setups/arrival-time";
import { computeBadges, type BadgeKind } from "@/lib/setups/badges";
import { GRID_COLUMNS, GRID_ROWS } from "@/lib/setups/layout-grid";
import type { SuggestedCandidate } from "@/app/(app)/setups/action-types";
import type { PositionSuitability } from "@/lib/integration/position-ratings";

export interface ProfileRow {
  id: string;
  name: string;
  role_id: string | null;
  birthdate: string | null;
  hired_on: string | null;
  active: boolean;
}

export interface RoleRow {
  id: string;
  rank: number | null;
}

export interface PositionRow {
  id: string;
  name: string;
}

export interface TemplateRow {
  id: string;
  name: string;
}

export interface AssignmentRow {
  id: string;
  position_id: string | null;
  user_id: string | null;
  arrival_time: string | null;
}

export interface BreakStatusRow {
  user_id: string | null;
  status: string;
  authorized_at: string | null;
}

export interface ShiftNoteRow {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface LayoutRow {
  id: string;
  name: string;
  day_part_id: string | null;
}

export interface LayoutTileRow {
  id: string;
  position_id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  area_label: string | null;
}

const UNASSIGNED = "unassigned";

/** Highlight badge kind -> StatusBadge tone (docs/DESIGN-SYSTEM.md semantic tones). */
const BADGE_TONE: Record<BadgeKind, StatusTone> = {
  new: "info",
  minor: "warning",
  trainee: "info",
  leader: "accent",
  birthday: "warning",
  needs_break: "danger",
};

export function SetupBoard({
  date,
  dayPartId,
  dayPartName,
  setup,
  assignments,
  positions,
  profiles,
  roles,
  templates,
  breakStatuses,
  breakDueAtByUser,
  traineeUserIds,
  shiftNotes,
  canManage,
  canPost,
  topPerformerSelected,
  suitabilityByAssignment,
  layout,
  layoutTiles,
}: {
  date: string;
  dayPartId: string;
  dayPartName: string;
  setup: { id: string; posted_at: string | null; template_id: string | null } | null;
  assignments: AssignmentRow[];
  positions: PositionRow[];
  profiles: ProfileRow[];
  roles: RoleRow[];
  templates: TemplateRow[];
  breakStatuses: BreakStatusRow[];
  /** Real "Needs Break" due time per user (arrival + rule), keyed by user id. */
  breakDueAtByUser: [string, string | null][];
  traineeUserIds: string[];
  shiftNotes: ShiftNoteRow[];
  canManage: boolean;
  canPost: boolean;
  topPerformerSelected: boolean;
  /** Under-qualified suitability for already-assigned positions, computed server-side on render. */
  suitabilityByAssignment: [string, PositionSuitability][];
  layout: LayoutRow | null;
  layoutTiles: LayoutTileRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [topPerformerId, setTopPerformerId] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedCandidate[]>>({});
  const [view, setView] = useState<"list" | "canvas">("list");

  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const roleRankById = new Map(roles.map((r) => [r.id, r.rank]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const breakByUser = new Map(breakStatuses.filter((b) => b.user_id).map((b) => [b.user_id as string, b]));
  const breakDueAtMap = new Map(breakDueAtByUser);
  const suitabilityByAssignmentMap = new Map(suitabilityByAssignment);
  const traineeSet = new Set(traineeUserIds);
  const now = new Date();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  if (!setup) {
    return (
      <SectionCard title="Build the setup">
        {canManage ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                createSetup({
                  date,
                  dayPartId: dayPartId || null,
                  templateId: templateId || null,
                  shiftLeaderId: null,
                }),
              );
            }}
          >
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full" disabled={isPending || !templateId}>
              Build setup
            </Button>
          </form>
        ) : (
          <p className="text-[13px] text-muted-ink">No setup exists yet for this date and day-part.</p>
        )}
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[19px] font-semibold text-ink">
              {dayPartName} — {date}
            </p>
            <div className="mt-1">
              <StatusBadge tone={setup.posted_at ? "success" : "warning"} dot>
                {setup.posted_at ? "Posted" : "Draft"}
              </StatusBadge>
            </div>
          </div>
          {canPost && !setup.posted_at && (
            <Button disabled={isPending} onClick={() => run(() => postSetup({ id: setup.id }))}>
              Post setup
            </Button>
          )}
        </div>
      </SectionCard>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {layout && (
        <ChipRow aria-label="Board view">
          <FilterChip type="button" active={view === "list"} onClick={() => setView("list")}>
            List
          </FilterChip>
          <FilterChip type="button" active={view === "canvas"} onClick={() => setView("canvas")}>
            Canvas ({layout.name})
          </FilterChip>
        </ChipRow>
      )}

      {view === "canvas" && !layout && (
        <p className="text-[13px] text-muted-ink">
          No active layout for this day-part yet — showing the list view. Build one under Setup
          templates &gt; Store layout.
        </p>
      )}

      {view === "list" || !layout ? (
        <div className="flex flex-col gap-3">
          {assignments.map((assignment) => {
            const assignedProfile = assignment.user_id ? profileById.get(assignment.user_id) : undefined;
            const badges = assignedProfile
              ? computeBadges(
                  {
                    hiredOn: assignedProfile.hired_on,
                    birthdate: assignedProfile.birthdate,
                    roleRank: assignedProfile.role_id ? roleRankById.get(assignedProfile.role_id) ?? null : null,
                    isTrainee: traineeSet.has(assignedProfile.id), // P2 wiring: real S4 trainee status
                    breakStatus: breakByUser.get(assignedProfile.id)?.status ?? null,
                    // HIGH/MED parity-audit fix: real due time instead of null.
                    breakDueAt: (() => {
                      const dueAt = breakDueAtMap.get(assignedProfile.id);
                      return dueAt ? new Date(dueAt) : null;
                    })(),
                  },
                  now,
                )
              : [];

            const positionKey = assignment.position_id ?? "";
            const positionSuggestions = suggestions[positionKey];
            const candidateIds = positionSuggestions
              ? positionSuggestions.map((c) => c.userId)
              : profiles.map((p) => p.id);
            const orderedProfiles = candidateIds
              .map((id) => profileById.get(id))
              .filter((p): p is ProfileRow => Boolean(p));

            // LOW parity-audit fix: warn when the assigned person is
            // under-qualified for this position (under 3 stars or missing the
            // position passport stamp). Server-computed suitability (present
            // for every assigned position on every render) takes priority; the
            // last auto-place Suggest result is only a fallback for the
            // instant after a Suggest click, before the page re-fetches.
            const serverSuitability = suitabilityByAssignmentMap.get(assignment.id);
            const assignedFlag = assignment.user_id
              ? positionSuggestions?.find((c) => c.userId === assignment.user_id)
              : undefined;
            const underQualified = serverSuitability
              ? serverSuitability.underThreeStars || serverSuitability.unstampedPassport
              : Boolean(assignedFlag && (assignedFlag.underThreeStars || assignedFlag.unstampedPassport));

            return (
              <div key={assignment.id} className="rounded-2xl border border-line bg-card p-3 shadow-card">
                <div className="flex items-center gap-3">
                  {assignedProfile ? (
                    <AvatarInitials name={assignedProfile.name} size="md" />
                  ) : (
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-ink">
                      <UserRound className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {assignment.position_id ? positionName.get(assignment.position_id) ?? "Position" : "Position"}
                    </p>
                    <p className="truncate text-[13px] text-muted-ink">
                      {assignedProfile ? assignedProfile.name : "Unassigned"}
                    </p>
                  </div>
                </div>

                {(underQualified || badges.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {underQualified && (
                      <StatusBadge tone="danger" title="Under 3 stars or missing the position passport stamp">
                        Under-qualified
                      </StatusBadge>
                    )}
                    {badges.map((badge) => (
                      <StatusBadge key={badge.kind} tone={BADGE_TONE[badge.kind]}>
                        {badge.label}
                      </StatusBadge>
                    ))}
                  </div>
                )}

                {canManage && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Select
                      value={assignment.user_id ?? UNASSIGNED}
                      onValueChange={(value) =>
                        run(() =>
                          assignPosition({
                            setupId: setup.id,
                            positionId: assignment.position_id ?? "",
                            userId: value === UNASSIGNED ? null : value,
                            arrivalTime: assignment.arrival_time ?? "",
                          }),
                        )
                      }
                    >
                      <SelectTrigger className="w-48 rounded-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {orderedProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {assignment.user_id && (
                      <Input
                        aria-label="Arrival time"
                        type="datetime-local"
                        // SETB1: show the stored UTC time back in the leader's
                        // local wall clock (exact inverse of the save below),
                        // so the field no longer drifts by the UTC offset each
                        // save + reload.
                        defaultValue={isoToLocalInput(assignment.arrival_time)}
                        className="w-48 rounded-full"
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (!value) return;
                          run(() =>
                            assignPosition({
                              setupId: setup.id,
                              positionId: assignment.position_id ?? "",
                              userId: assignment.user_id,
                              arrivalTime: localInputToIso(value),
                            }),
                          );
                        }}
                      />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await suggestAssignees({
                            positionId: assignment.position_id ?? "",
                            candidateUserIds: profiles.map((p) => p.id),
                          });
                          if (result.ok && "data" in result) {
                            setSuggestions((prev) => ({
                              ...prev,
                              [assignment.position_id ?? ""]: result.data.candidates,
                            }));
                          }
                        });
                      }}
                    >
                      Suggest
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => removeAssignment({ id: assignment.id }))}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {assignments.length === 0 && (
            <p className="text-[13px] text-muted-ink">
              This template has no positions yet — add some under Setup templates.
            </p>
          )}
        </div>
      ) : (
        // MED parity-audit fix: the layout canvas used to exist only under
        // /setups/templates and only ever showed bare position tiles — never
        // the live posted board (assigned people, badges, break state).
        <div
          className="grid gap-1 rounded-2xl border border-line bg-canvas p-2"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 4.5rem)`,
          }}
        >
          {layoutTiles.map((tile) => {
            const assignment = assignments.find((a) => a.position_id === tile.position_id);
            const assignedProfile =
              assignment?.user_id ? profileById.get(assignment.user_id) : undefined;
            const badges = assignedProfile
              ? computeBadges(
                  {
                    hiredOn: assignedProfile.hired_on,
                    birthdate: assignedProfile.birthdate,
                    roleRank: assignedProfile.role_id ? roleRankById.get(assignedProfile.role_id) ?? null : null,
                    isTrainee: traineeSet.has(assignedProfile.id),
                    breakStatus: breakByUser.get(assignedProfile.id)?.status ?? null,
                    breakDueAt: (() => {
                      const dueAt = breakDueAtMap.get(assignedProfile.id);
                      return dueAt ? new Date(dueAt) : null;
                    })(),
                  },
                  now,
                )
              : [];
            const serverSuitability = assignment ? suitabilityByAssignmentMap.get(assignment.id) : undefined;
            const underQualified = Boolean(
              serverSuitability && (serverSuitability.underThreeStars || serverSuitability.unstampedPassport),
            );

            return (
              <div
                key={tile.id}
                className="flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-accent/40 bg-accent-soft p-1 text-center shadow-card"
                style={{
                  gridColumn: `${tile.x + 1} / span ${tile.w}`,
                  gridRow: `${tile.y + 1} / span ${tile.h}`,
                }}
              >
                <span className="truncate text-[13px] font-semibold leading-tight text-ink">
                  {tile.area_label || (tile.position_id ? positionName.get(tile.position_id) : "Tile")}
                </span>
                <span className="truncate text-[11px] text-muted-ink">
                  {assignedProfile ? assignedProfile.name : "Unassigned"}
                </span>
                {(underQualified || badges.length > 0) && (
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {underQualified && (
                      <StatusBadge tone="danger" className="px-1.5 py-0 text-[10px]">
                        !
                      </StatusBadge>
                    )}
                    {badges.map((badge) => (
                      <StatusBadge key={badge.kind} tone={BADGE_TONE[badge.kind]} className="px-1.5 py-0 text-[10px]">
                        {badge.label}
                      </StatusBadge>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
          {layoutTiles.length === 0 && (
            <p className="col-span-full text-[13px] text-muted-ink">This layout has no tiles placed yet.</p>
          )}
        </div>
      )}

      {canPost && assignments.some((a) => a.user_id) && (
        <SectionCard title="Top performer">
          {topPerformerSelected ? (
            <p className="text-[13px] text-muted-ink">Top Performer already selected for this shift.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <Select value={topPerformerId} onValueChange={setTopPerformerId}>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Pick Top Performer" />
                </SelectTrigger>
                <SelectContent>
                  {assignments
                    .filter((a) => a.user_id)
                    .map((a) => {
                      const p = profileById.get(a.user_id as string);
                      return p ? (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ) : null;
                    })}
                </SelectContent>
              </Select>
              <Button
                disabled={isPending || !topPerformerId}
                onClick={() => run(() => selectTopPerformer({ setupId: setup.id, userId: topPerformerId }))}
              >
                Select Top Performer
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {canPost && (
        <SectionCard title="Shift notes">
          <div className="flex flex-col gap-3">
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const result = await addShiftNote({ setupId: setup.id, body: noteBody });
                  if (result.ok) setNoteBody("");
                  return result;
                });
              }}
            >
              <Textarea
                aria-label="New shift note"
                placeholder="Note to the team..."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                className="rounded-xl"
                required
              />
              <Button type="submit" disabled={isPending} className="self-end">
                Post note
              </Button>
            </form>
            <ul className="flex flex-col gap-2">
              {shiftNotes.map((note) => (
                <li key={note.id} className="text-[13px] text-muted-ink">
                  {note.body}
                </li>
              ))}
              {shiftNotes.length === 0 && <li className="text-[13px] text-muted-ink">No shift notes yet.</li>}
            </ul>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
