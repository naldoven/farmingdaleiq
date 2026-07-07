"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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
import {
  addShiftNote,
  assignPosition,
  createSetup,
  postSetup,
  removeAssignment,
  selectTopPerformer,
  suggestAssignees,
} from "@/app/(app)/setups/actions";
import { computeBadges } from "@/lib/setups/badges";
import type { SuggestedCandidate } from "@/app/(app)/setups/action-types";

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

const UNASSIGNED = "unassigned";

export function SetupBoard({
  date,
  dayPartId,
  setup,
  assignments,
  positions,
  profiles,
  roles,
  templates,
  breakStatuses,
  traineeUserIds,
  shiftNotes,
  canManage,
  canPost,
  topPerformerSelected,
}: {
  date: string;
  dayPartId: string;
  setup: { id: string; posted_at: string | null; template_id: string | null } | null;
  assignments: AssignmentRow[];
  positions: PositionRow[];
  profiles: ProfileRow[];
  roles: RoleRow[];
  templates: TemplateRow[];
  breakStatuses: BreakStatusRow[];
  traineeUserIds: string[];
  shiftNotes: ShiftNoteRow[];
  canManage: boolean;
  canPost: boolean;
  topPerformerSelected: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [topPerformerId, setTopPerformerId] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedCandidate[]>>({});

  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const roleRankById = new Map(roles.map((r) => [r.id, r.rank]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const breakByUser = new Map(breakStatuses.filter((b) => b.user_id).map((b) => [b.user_id as string, b]));
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
      <div className="flex flex-col gap-3">
        {canManage ? (
          <form
            className="flex flex-wrap items-end gap-2"
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
              <SelectTrigger className="w-64">
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
            <Button type="submit" disabled={isPending || !templateId}>
              Create setup from template
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            No setup exists yet for this date and day-part.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {setup.posted_at ? (
            <Badge variant="success">Posted</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
        </div>
        {canPost && !setup.posted_at && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => postSetup({ id: setup.id }))}>
            Post setup
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex flex-col gap-2">
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
                  breakDueAt: null,
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

          // P2 wiring: warn when the assigned person is under-qualified for
          // this position (under 3 stars or missing the position passport
          // stamp), surfaced from the last auto-place suggestion.
          const assignedFlag = assignment.user_id
            ? positionSuggestions?.find((c) => c.userId === assignment.user_id)
            : undefined;
          const underQualified = Boolean(
            assignedFlag && (assignedFlag.underThreeStars || assignedFlag.unstampedPassport),
          );

          return (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
            >
              <span className="w-40 font-medium">
                {assignment.position_id ? positionName.get(assignment.position_id) ?? "Position" : "Position"}
              </span>

              {canManage ? (
                <>
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
                    <SelectTrigger className="w-48">
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
                      defaultValue={assignment.arrival_time ? assignment.arrival_time.slice(0, 16) : ""}
                      className="w-48"
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        run(() =>
                          assignPosition({
                            setupId: setup.id,
                            positionId: assignment.position_id ?? "",
                            userId: assignment.user_id,
                            arrivalTime: new Date(value).toISOString(),
                          }),
                        );
                      }}
                    />
                  )}
                  <Button
                    variant="ghost"
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
                </>
              ) : (
                <span className="w-48 text-sm">
                  {assignedProfile ? assignedProfile.name : "Unassigned"}
                </span>
              )}

              <span className="flex flex-wrap gap-1">
                {underQualified && (
                  <Badge variant="destructive" title="Under 3 stars or missing the position passport stamp">
                    Under-qualified
                  </Badge>
                )}
                {badges.map((badge) => (
                  <Badge key={badge.kind} variant="secondary">
                    {badge.label}
                  </Badge>
                ))}
              </span>
            </li>
          );
        })}
        {assignments.length === 0 && (
          <li className="text-sm text-muted-foreground">
            This template has no positions yet — add some under Setup templates.
          </li>
        )}
      </ul>

      {canPost && assignments.some((a) => a.user_id) && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          {topPerformerSelected ? (
            <p className="text-sm text-muted-foreground">Top Performer already selected for this shift.</p>
          ) : (
            <>
              <Select value={topPerformerId} onValueChange={setTopPerformerId}>
                <SelectTrigger className="w-56">
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
                size="sm"
                disabled={isPending || !topPerformerId}
                onClick={() => run(() => selectTopPerformer({ setupId: setup.id, userId: topPerformerId }))}
              >
                Select Top Performer
              </Button>
            </>
          )}
        </div>
      )}

      {canPost && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="font-medium">Shift notes</h3>
          <form
            className="flex flex-wrap items-end gap-2"
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
              className="min-w-[16rem]"
              required
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Post note
            </Button>
          </form>
          <ul className="flex flex-col gap-1">
            {shiftNotes.map((note) => (
              <li key={note.id} className="text-sm text-muted-foreground">
                {note.body}
              </li>
            ))}
            {shiftNotes.length === 0 && (
              <li className="text-sm text-muted-foreground">No shift notes yet.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
