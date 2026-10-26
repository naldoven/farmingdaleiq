"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CLEANING_PHOTO, downscaleImageToJpeg, readUploadErrorMessage } from "@/lib/images/client-image";

/**
 * "Done" and "Checked, not needed" for one planned clean (docs/CLEANING-PLAN.md
 * "Proof": both outcomes need an after-photo). Tapping either opens the phone
 * camera; the shot is shrunk, then posted to /api/cleaning/complete.
 *
 * The photo id is made once per shot and reused on every retry, so a resend
 * after a lost answer records one completion. A failed send keeps the shot in
 * memory behind a Retry button: nobody re-shoots because the wifi blinked.
 * "New photo" is the way out when a retry cannot help (the photo id was used
 * elsewhere, say), and it starts a fresh id.
 *
 * While a shot is being prepared, sent or refreshed the buttons are gone
 * rather than disabled, so a second tap has nothing to land on.
 */

const ENDPOINT = "/api/cleaning/complete";
const SIGNED_OUT = "Signed out. Sign in again, then tap Retry.";
const READABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Phase = "idle" | "shrinking" | "sending" | "failed";

interface Shot {
  photoId: string;
  blob: Blob;
  notNeeded: boolean;
}

export function CompleteCleanButton({
  assignmentId,
  itemName,
  ifNeeded,
}: {
  assignmentId: string;
  itemName: string;
  ifNeeded: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const notNeededRef = useRef(false);
  // A ref, not state: two taps in the same frame both see the same render.
  const workingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  function pick(notNeeded: boolean) {
    notNeededRef.current = notNeeded;
    inputRef.current?.click();
  }

  async function upload(current: Shot) {
    setPhase("sending");
    setError(null);
    let failure: string | null = null;
    // The page is out of date when the clean is gone or closed; refreshing
    // shows what really happened instead of leaving a dead Retry.
    let refreshToo = false;
    try {
      const body = new FormData();
      body.append("photo", new File([current.blob], `${current.photoId}.jpg`, { type: current.blob.type || "image/jpeg" }));
      body.append(
        "payload",
        JSON.stringify({ assignmentId, photoId: current.photoId, notNeeded: current.notNeeded }),
      );
      const res = await fetch(ENDPOINT, { method: "POST", body, credentials: "same-origin" });
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      if (res.redirected || (res.ok && !isJson)) {
        // A login page that came back 200 is NOT a saved clean.
        failure = SIGNED_OUT;
      } else if (!res.ok) {
        failure = res.status === 401 ? SIGNED_OUT : await readUploadErrorMessage(res);
        refreshToo = res.status === 404 || res.status === 409;
      }
    } catch {
      failure = "No connection. Tap Retry when you are back online.";
    }

    if (failure) {
      setShot(current);
      setError(failure);
      setPhase("failed");
      if (refreshToo) startRefresh(() => router.refresh());
      return;
    }
    setShot(null);
    setPhase("idle");
    startRefresh(() => router.refresh());
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
      await upload({ photoId: crypto.randomUUID(), blob, notNeeded: notNeededRef.current });
    });
  }

  const working = phase === "shrinking" || phase === "sending" || refreshing;

  return (
    <div className="flex flex-col gap-2">
      {working ? (
        <p role="status" className="flex h-12 items-center gap-2 text-[15px] font-medium text-muted-ink">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          {phase === "shrinking"
            ? "Preparing photo..."
            : phase === "sending"
              ? "Sending photo..."
              : phase === "failed"
                ? "Checking the latest..."
                : "Saved. Updating..."}
        </p>
      ) : phase === "failed" && shot ? (
        <>
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
          <div className="flex gap-2">
            <Button
              className="h-12 flex-1 rounded-lg text-[16px]"
              aria-label={`Retry: ${itemName}`}
              onClick={() => void run(() => upload(shot))}
            >
              <RotateCcw aria-hidden="true" />
              Retry
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-lg px-4 text-[15px]"
              aria-label={`New photo: ${itemName}`}
              onClick={() => {
                setShot(null);
                setError(null);
                setPhase("idle");
              }}
            >
              New photo
            </Button>
          </div>
        </>
      ) : (
        <>
          {error ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button className="h-12 flex-1 rounded-lg text-[16px]" aria-label={`Done: ${itemName}`} onClick={() => pick(false)}>
              <Camera aria-hidden="true" />
              Done
            </Button>
            {ifNeeded ? (
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-lg text-[16px]"
                aria-label={`Checked, not needed: ${itemName}`}
                onClick={() => pick(true)}
              >
                Checked, not needed
              </Button>
            ) : null}
          </div>
        </>
      )}
      {/* capture="environment" opens the camera app on a phone and the file
          picker on a desktop. It is a hint, so the file may still come from
          the gallery; the proof is the photo plus who and when. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-label={`Photo for ${itemName}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file again still fires a change.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
