"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, RotateCcw } from "lucide-react";

import { FIND_NOTE_MAX } from "@/app/(app)/cleaning/constants";
// Type-only: finds-view.ts reaches server-side modules the browser bundle must not pull in.
import type { FindZone } from "@/app/(app)/cleaning/finds-view";
import { ChipRow, FilterChip } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CLEANING_PHOTO, downscaleImageToJpeg, readUploadErrorMessage } from "@/lib/images/client-image";
import { cn } from "@/lib/utils";

/**
 * "Post a find" for the found-and-fixed log (docs/CLEANING-PLAN.md
 * "Decisions": ATD log). A leader fixed something that is on no list: tap, take
 * the photo, pick the area, say what it was in one line, post. The photo is
 * shrunk on the phone, then sent to /api/cleaning/finds.
 *
 * The photo id is made once per shot and reused on every retry, so a resend
 * after a lost answer records one find and one #cleaning post. A failed send
 * keeps the shot in memory behind a Retry button: nobody re-shoots because the
 * wifi blinked. A retry sends whatever the fields say now; if the first try
 * actually landed, the server answers "duplicate" and keeps the first note.
 * "Retake photo" starts a fresh id.
 *
 * While a shot is being prepared or sent, the sheet's controls are disabled
 * and it cannot be dismissed, so a second tap has nothing to land on.
 */

const ENDPOINT = "/api/cleaning/finds";
const SIGNED_OUT = "Signed out. Sign in again, then tap Retry.";
const READABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ChipRow scrolls sideways by default. The area picker must show every choice
// at once, so it wraps (the same fix item-details-fields.tsx uses).
const WRAP_ROW = "mx-0 flex-wrap overflow-visible px-0";
const TAP = "min-h-11 px-4 text-[14px] disabled:pointer-events-none disabled:opacity-50";

type Phase = "idle" | "shrinking" | "sending" | "failed";

interface Shot {
  photoId: string;
  blob: Blob;
  previewUrl: string | null;
}

function makePreview(blob: Blob): string | null {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
}

function revoke(url: string | null) {
  if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

export function FindPostButton({ zones }: { zones: FindZone[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // A ref, not state: two taps in the same frame both see the same render.
  const workingRef = useRef(false);
  const previewRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shot, setShot] = useState<Shot | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // The preview link holds the decoded photo in memory until it is revoked.
  useEffect(() => () => revoke(previewRef.current), []);

  function releaseShot() {
    revoke(previewRef.current);
    previewRef.current = null;
    setShot(null);
  }

  async function run(task: () => Promise<void>) {
    if (workingRef.current) return;
    workingRef.current = true;
    try {
      await task();
    } finally {
      workingRef.current = false;
    }
  }

  async function handleFile(file: File) {
    await run(async () => {
      setPhase("shrinking");
      setError(null);
      const blob = await downscaleImageToJpeg(file, CLEANING_PHOTO);
      if (!READABLE_TYPES.includes(blob.type)) {
        // The shrink hands the original back when it cannot decode it (HEIC
        // on an old browser). The server only takes JPEG, PNG and WebP.
        setError("This phone saved the photo in a format the app can't read. Try again.");
        setPhase("idle");
        return;
      }
      revoke(previewRef.current);
      previewRef.current = makePreview(blob);
      setShot({ photoId: crypto.randomUUID(), blob, previewUrl: previewRef.current });
      setPhase("idle");
    });
  }

  async function send() {
    if (!shot || !zoneId || note.trim().length === 0) return;
    await run(async () => {
      setPhase("sending");
      setError(null);
      let failure: string | null = null;
      try {
        const body = new FormData();
        body.append("photo", new File([shot.blob], `${shot.photoId}.jpg`, { type: shot.blob.type || "image/jpeg" }));
        body.append("payload", JSON.stringify({ photoId: shot.photoId, zoneId, note: note.trim() }));
        const res = await fetch(ENDPOINT, { method: "POST", body, credentials: "same-origin" });
        const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
        if (res.redirected || (res.ok && !isJson)) {
          // A login page that came back 200 is NOT a saved find.
          failure = SIGNED_OUT;
        } else if (!res.ok) {
          failure = res.status === 401 ? SIGNED_OUT : await readUploadErrorMessage(res);
        }
      } catch {
        failure = "No connection. Tap Retry when you are back online.";
      }

      if (failure) {
        setError(failure);
        setPhase("failed");
        return;
      }
      releaseShot();
      setZoneId(null);
      setNote("");
      setPhase("idle");
      startRefresh(() => router.refresh());
    });
  }

  const busy = phase === "shrinking" || phase === "sending";
  const ready = Boolean(zoneId) && note.trim().length > 0;
  const noAreas = zones.length === 0;

  const statusLine = busy ? (
    <p role="status" className="flex h-12 items-center gap-2 text-[15px] font-medium text-muted-ink">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      {phase === "shrinking" ? "Preparing photo..." : "Sending..."}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-2">
      {!shot && statusLine}
      {!shot && !busy && refreshing ? (
        <p role="status" className="flex h-12 items-center gap-2 text-[15px] font-medium text-muted-ink">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Posted. Updating...
        </p>
      ) : null}
      {!shot && !busy && !refreshing ? (
        <>
          {error ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button
            className="h-12 w-full rounded-lg text-[16px]"
            disabled={noAreas}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden="true" />
            Post a find
          </Button>
          {noAreas ? (
            <p className="text-[13px] text-muted-ink">No areas are set up yet. Ask a planner to turn some on.</p>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={shot !== null}
        onOpenChange={(next) => {
          // Closing mid-send would hide the answer to a post that may still land.
          if (next || phase === "sending" || phase === "shrinking") return;
          releaseShot();
          setError(null);
          setPhase("idle");
        }}
      >
        <DialogContent
          // A stray tap on the dimmed page must not throw away a shot and a typed note.
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="bottom-0 top-auto max-h-[92dvh] max-w-none translate-y-0 overflow-y-auto rounded-b-none px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl sm:p-6"
        >
          <DialogHeader className="text-left">
            <DialogTitle className="text-[19px]">Post a find</DialogTitle>
            <DialogDescription className="text-[14px]">
              Pick the area and say what you found and fixed.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {shot?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shot.previewUrl}
                alt="The photo you took"
                className="h-40 w-full rounded-lg border border-line object-cover"
              />
            ) : null}

            <div className="flex flex-col gap-2">
              <span id="find-area-label" className="text-[13px] font-semibold text-ink">
                Area
              </span>
              <ChipRow className={WRAP_ROW} role="group" aria-labelledby="find-area-label">
                {zones.map((zone) => (
                  <FilterChip
                    key={zone.id}
                    className={cn(TAP, "gap-2")}
                    active={zoneId === zone.id}
                    activeColor="accent"
                    disabled={busy}
                    onClick={() => setZoneId(zone.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 rounded-full ring-1 ring-black/15"
                      style={{ backgroundColor: zone.color }}
                    />
                    {zone.name}
                  </FilterChip>
                ))}
              </ChipRow>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="find-note" className="text-[13px] font-semibold text-ink">
                What did you find?
              </label>
              <Input
                id="find-note"
                value={note}
                disabled={busy}
                maxLength={FIND_NOTE_MAX}
                autoComplete="off"
                enterKeyHint="done"
                placeholder="For example: grease behind the fryer"
                // 16px: iOS Safari zooms the page when focusing a smaller input.
                className="h-12 text-base"
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="text-right text-[12px] text-muted-ink">
                {note.length}/{FIND_NOTE_MAX}
              </p>
            </div>

            {statusLine}
            {error ? (
              <p role="alert" className="text-[14px] font-medium text-danger">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="submit" className="h-12 rounded-lg text-[16px]" disabled={busy || !ready}>
                {phase === "failed" ? (
                  <>
                    <RotateCcw aria-hidden="true" />
                    Retry
                  </>
                ) : (
                  "Post"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-lg text-[16px]"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Retake photo
              </Button>
            </DialogFooter>
            {!ready && !busy ? (
              <p className="text-[13px] text-muted-ink">Pick an area and write a short note to post.</p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>

      {/* capture="environment" opens the camera app on a phone and the file
          picker on a desktop. It is a hint, so the file may still come from
          the gallery. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-label="Photo of what you found"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again still fires a change.
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
