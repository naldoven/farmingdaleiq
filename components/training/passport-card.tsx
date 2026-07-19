"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPassportItem,
  deletePassportItem,
  enrollPassport,
  signItem,
  stampPassport,
  upsertItemProgress,
} from "@/app/(app)/training/actions";

export interface PassportItem {
  id: string;
  type: "check" | "slider" | "photo" | "signature" | "course";
  label: string;
  sort: number;
  course_id: string | null;
}

export interface PassportEnrollment {
  id: string;
  userId: string;
  userName: string;
  track: string | null;
  stampedAt: string | null;
}

export interface NamedOption {
  id: string;
  name: string;
}

const UNSET = "unset";

export function PassportCard({
  passportId,
  passportName,
  kind,
  items,
  enrollments,
  progress,
  people,
  canManage,
  canStamp,
  currentUserId,
  currentStarsByUser,
}: {
  passportId: string;
  passportName: string;
  kind: "position" | "leadership";
  items: PassportItem[];
  enrollments: PassportEnrollment[];
  progress: Record<string, { itemId: string; completedAt: string | null }[]>;
  people: NamedOption[];
  canManage: boolean;
  canStamp: boolean;
  currentUserId: string | null;
  currentStarsByUser: Record<string, number | null>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemType, setNewItemType] = useState<PassportItem["type"]>("check");
  const [enrollTarget, setEnrollTarget] = useState(UNSET);
  const [enrollTrack, setEnrollTrack] = useState("");
  // TR6: slider/photo items need a value, not just a checkbox. Drafts are keyed
  // per (enrollment, item) so each row edits independently.
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, string>>({});
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string>>({});

  const saveProgress = (
    enrollmentId: string,
    itemId: string,
    payload: { checked?: boolean; sliderValue?: number; photoUrl?: string },
  ) =>
    startTransition(async () => {
      const result = await upsertItemProgress({ enrollmentId, itemId, ...payload });
      if (!result.ok) setError(result.error);
      router.refresh();
    });

  const enrolledUserIds = new Set(enrollments.map((e) => e.userId));
  const enrollable = people.filter((p) => !enrolledUserIds.has(p.id));
  const sortedItems = [...items].sort((a, b) => a.sort - b.sort);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {passportName}
          <Badge variant="outline">{kind}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Items ({sortedItems.length})</p>
          <ul className="flex flex-col gap-1">
            {sortedItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {item.sort}. {item.label} <Badge variant="outline">{item.type}</Badge>
                </span>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deletePassportItem({ id: item.id });
                        if (!result.ok) setError(result.error);
                        router.refresh();
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
            {sortedItems.length === 0 && <li className="text-sm text-muted-foreground">No items yet.</li>}
          </ul>
        </div>

        {canManage && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await createPassportItem({
                  passportId,
                  type: newItemType,
                  label: newItemLabel,
                  sort: sortedItems.length + 1,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setNewItemLabel("");
                router.refresh();
              });
            }}
          >
            <Input
              placeholder="New item label"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              className="max-w-xs"
            />
            <Select value={newItemType} onValueChange={(v) => setNewItemType(v as PassportItem["type"])}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Checkmark</SelectItem>
                <SelectItem value="slider">Slider (0-100)</SelectItem>
                <SelectItem value="photo">Photo evidence</SelectItem>
                <SelectItem value="signature">Trainer signature</SelectItem>
                <SelectItem value="course">Linked course</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={isPending || !newItemLabel.trim()}>
              Add item
            </Button>
          </form>
        )}

        {canManage && enrollable.length > 0 && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (enrollTarget === UNSET) return;
              setError(null);
              startTransition(async () => {
                const result = await enrollPassport({
                  passportId,
                  userId: enrollTarget,
                  track: kind === "leadership" ? enrollTrack : undefined,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEnrollTarget(UNSET);
                setEnrollTrack("");
                router.refresh();
              });
            }}
          >
            <Select value={enrollTarget} onValueChange={setEnrollTarget}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Enroll someone..." />
              </SelectTrigger>
              <SelectContent>
                {enrollable.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kind === "leadership" && (
              <Input
                placeholder="Track (e.g. DT/FC/OT/Both)"
                value={enrollTrack}
                onChange={(e) => setEnrollTrack(e.target.value)}
                className="w-48"
              />
            )}
            <Button type="submit" size="sm" disabled={isPending || enrollTarget === UNSET}>
              Enroll
            </Button>
          </form>
        )}

        <div className="flex flex-col gap-3">
          {enrollments.map((enrollment) => {
            const enrollmentProgress = progress[enrollment.id] ?? [];
            const completedItemIds = new Set(
              enrollmentProgress.filter((p) => p.completedAt !== null).map((p) => p.itemId),
            );
            const allComplete = sortedItems.length > 0 && sortedItems.every((i) => completedItemIds.has(i.id));
            const stars = currentStarsByUser[enrollment.userId] ?? null;
            const isSelf = currentUserId === enrollment.userId;
            const canEditProgress = canManage || canStamp || isSelf;

            return (
              <div key={enrollment.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {enrollment.userName}
                    {enrollment.track && <span className="text-muted-foreground"> ({enrollment.track})</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    {kind === "position" && (
                      <Badge variant={stars !== null && stars >= 3 ? "success" : "outline"}>
                        {stars !== null ? `${stars.toFixed(1)}★` : "Not rated"}
                      </Badge>
                    )}
                    {enrollment.stampedAt ? (
                      <Badge variant="success">Stamped</Badge>
                    ) : (
                      canStamp && (
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await stampPassport({ enrollmentId: enrollment.id });
                              if (!result.ok) setError(result.error);
                              router.refresh();
                            })
                          }
                        >
                          Stamp
                        </Button>
                      )
                    )}
                  </div>
                </div>

                <ul className="mt-2 flex flex-col gap-1">
                  {sortedItems.map((item) => {
                    const done = completedItemIds.has(item.id);
                    const draftKey = `${enrollment.id}:${item.id}`;
                    const labelClass = done ? "line-through text-muted-foreground" : "";
                    return (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                        {item.type === "signature" ? (
                          <>
                            <Checkbox checked={done} disabled />
                            <span className={labelClass}>{item.label}</span>
                            {!done && canStamp && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    const result = await signItem({ enrollmentId: enrollment.id, itemId: item.id });
                                    if (!result.ok) setError(result.error);
                                    router.refresh();
                                  })
                                }
                              >
                                Countersign
                              </Button>
                            )}
                          </>
                        ) : item.type === "slider" ? (
                          // TR6: a slider item completes at 100. Send the numeric
                          // sliderValue (not just a checkbox) so the action can
                          // mark it complete.
                          <>
                            <span className={labelClass}>{item.label}</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              className="w-20"
                              aria-label={`${item.label} progress (0-100)`}
                              disabled={!canEditProgress || isPending}
                              value={sliderDrafts[draftKey] ?? (done ? "100" : "")}
                              onChange={(e) =>
                                setSliderDrafts((d) => ({ ...d, [draftKey]: e.target.value }))
                              }
                            />
                            {canEditProgress && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() =>
                                  saveProgress(enrollment.id, item.id, {
                                    sliderValue: Number(sliderDrafts[draftKey] ?? (done ? "100" : "0")),
                                  })
                                }
                              >
                                Save
                              </Button>
                            )}
                            {done && <Badge variant="success">100%</Badge>}
                          </>
                        ) : item.type === "photo" ? (
                          // TR6: a photo item completes once a non-blank photo URL
                          // is recorded. Send photoUrl so the action can mark it
                          // complete.
                          <>
                            <span className={labelClass}>{item.label}</span>
                            <Input
                              type="url"
                              className="w-56"
                              placeholder="Photo URL"
                              aria-label={`${item.label} photo URL`}
                              disabled={!canEditProgress || isPending}
                              value={photoDrafts[draftKey] ?? ""}
                              onChange={(e) =>
                                setPhotoDrafts((d) => ({ ...d, [draftKey]: e.target.value }))
                              }
                            />
                            {canEditProgress && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() =>
                                  saveProgress(enrollment.id, item.id, {
                                    photoUrl: photoDrafts[draftKey] ?? "",
                                  })
                                }
                              >
                                Save
                              </Button>
                            )}
                            {done && <Badge variant="success">Uploaded</Badge>}
                          </>
                        ) : (
                          <>
                            <Checkbox
                              checked={done}
                              disabled={!canEditProgress || isPending}
                              onCheckedChange={(checked) =>
                                saveProgress(enrollment.id, item.id, { checked: checked === true })
                              }
                            />
                            <span className={labelClass}>{item.label}</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {allComplete && !enrollment.stampedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">All items complete — ready to stamp.</p>
                )}
              </div>
            );
          })}
          {enrollments.length === 0 && <p className="text-sm text-muted-foreground">No one enrolled yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
