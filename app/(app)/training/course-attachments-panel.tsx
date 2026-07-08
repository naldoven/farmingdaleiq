"use client";

/**
 * Course attachments list + add/remove form (ARCHITECTURE.md training
 * courses: "linked course content"; parity-audit fix for "course_attachments
 * ... zero references"). Colocated under app/(app)/training (not
 * components/training) so this stream owns the file outright.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCourseAttachment, deleteCourseAttachment } from "@/app/(app)/training/actions";

export interface CourseAttachment {
  id: string;
  fileUrl: string;
  label: string | null;
}

export function CourseAttachmentsPanel({
  courseId,
  attachments,
  canManage,
}: {
  courseId: string;
  attachments: CourseAttachment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <a href={a.fileUrl} target="_blank" rel="noreferrer" className="truncate text-primary underline">
                {a.label ?? a.fileUrl}
              </a>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteCourseAttachment({ id: a.id });
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
        </ul>
      )}
      {canManage && (
        <form
          className="mt-1 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createCourseAttachment({ courseId, fileUrl, label });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFileUrl("");
              setLabel("");
              router.refresh();
            });
          }}
        >
          <Input
            placeholder="File URL"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            className="max-w-xs"
          />
          <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-[10rem]" />
          <Button type="submit" size="sm" disabled={isPending || !fileUrl.trim()}>
            Add attachment
          </Button>
        </form>
      )}
    </div>
  );
}
