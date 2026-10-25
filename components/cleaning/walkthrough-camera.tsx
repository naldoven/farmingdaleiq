"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ImagePlus, Loader2, RotateCcw, Trash2, X } from "lucide-react";

import type { CaptureSource } from "@/app/(app)/cleaning/constants";
import { emptyItemDetails } from "@/components/cleaning/item-details-fields";
import {
  WalkthroughDetailsSheet,
  type WalkthroughItem,
  type WalkthroughZone,
} from "@/components/cleaning/walkthrough-details-sheet";
import {
  buildSavePayload,
  isShotForm,
  isUnsent,
  queueSummary,
  type ShotForm,
  type ShotStatus,
} from "@/components/cleaning/walkthrough-form";
import { decideSend, retryDelayMs, type SendOutcome } from "@/lib/cleaning/send-policy";
import { deleteShot, loadShots, updateShotPayload, writeShot } from "@/lib/cleaning/shot-queue-storage";
import {
  CLEANING_PHOTO,
  canvasToJpegBlob,
  computeTargetDimensions,
  downscaleImageToJpeg,
  readUploadErrorMessage,
} from "@/lib/images/client-image";

/**
 * The walkthrough camera (docs/CLEANING-PLAN.md "Phase W"), modeled on the
 * Quote Tool's crew camera (src/components/advertising/simplecrew/
 * CameraScreen.tsx): a live viewfinder so photos are taken now, not picked
 * from the camera roll; the zone picker in the top bar the way the Quote
 * Tool puts the campaign there; a shutter that can be tapped again and
 * again; and a queue that keeps every shot until the server confirms it.
 *
 * Durability: each shot is written to IndexedDB at the shutter, before any
 * upload, so closing the tab or losing wifi in the walk-in never costs a
 * re-shoot. The server dedupes by the shot id, so restored shots are simply
 * resent (the Quote Tool had to hold them because its server could not).
 *
 * The whole screen is a fixed z-[60] layer over the app header and tab bar;
 * colors here are literal, not theme tokens, because a viewfinder is black
 * whatever the theme does (the Quote Tool's dark-theme inversion turned its
 * viewfinder cream).
 */

interface StoredPayload {
  v: 1;
  aspect: number;
  form: ShotForm;
  /** Only a form the leader pressed Save on is sent after a restore; a
   * "Later" form waits for them, half-filled details must never post. */
  ready: boolean;
  /** Who took it. The queue lives per phone, not per person, so on a shared
   * store phone only the signed-in leader's own shots are restored and sent;
   * otherwise one leader's photos would post under the next one's name. */
  userId: string;
}

interface Shot {
  id: string;
  previewUrl: string;
  blob: Blob;
  aspect: number;
  capturedAt: string;
  form: ShotForm | null;
  status: ShotStatus;
  attempts: number;
  error: string | null;
  /** Held for a reason that may clear on its own (connection, server), so
   * coming back online retries it. A refused-details hold waits for a fix. */
  retryable: boolean;
  /** Details changed after a send attempt. If the server then says the shot
   * was already saved, those changes did not apply and the leader is told. */
  editedAfterSend: boolean;
}

type CameraState = "starting" | "live" | "blocked";

const ENDPOINT = "/api/cleaning/walkthrough";

function isStoredPayload(value: unknown): value is StoredPayload {
  return Boolean(value && typeof value === "object" && (value as StoredPayload).v === 1);
}

function shotLabel(shot: Shot): string {
  if (!shot.form) return "Needs details";
  if (shot.form.mode === "existing") return shot.form.existingItemName ?? "Existing item";
  return shot.form.details.name.trim() || "Needs details";
}

function statusText(shot: Shot): string {
  switch (shot.status) {
    case "needs-details":
      return "Tap to add details";
    case "waiting":
    case "sending":
      return shot.attempts > 0 ? "Retrying..." : "Sending...";
    case "saved":
      return shot.error ?? "Saved";
    case "held":
      return shot.error ?? "Not sent";
  }
}

async function imageAspect(blob: Blob): Promise<number> {
  try {
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.width / bitmap.height;
    bitmap.close();
    return Number.isFinite(aspect) && aspect > 0 ? aspect : 0.75;
  } catch {
    return 0.75;
  }
}

export function WalkthroughCamera({
  zones,
  items,
  exitHref,
  userId,
}: {
  zones: WalkthroughZone[];
  items: WalkthroughItem[];
  exitHref: string;
  userId: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sendingRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const shotsRef = useRef<Shot[]>([]);

  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [camera, setCamera] = useState<CameraState>("starting");
  // Bumped to restart the camera when its stream has ended.
  const [cameraKey, setCameraKey] = useState(0);
  const [flash, setFlash] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    shotsRef.current = shots;
  });

  const patchShot = useCallback((id: string, patch: Partial<Shot>) => {
    setShots((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // Live camera, rear lens. Started without waiting for a tap so the
  // permission prompt appears the moment the screen opens, before the first
  // thing worth photographing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // iOS can end the stream when the system camera or another app takes
        // the lens (the phone-camera fallback does exactly that). A frozen
        // viewfinder would keep saving black frames, so restart instead.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => setCameraKey((k) => k + 1));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamera("live");
      } catch {
        if (!cancelled) setCamera("blocked");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraKey]);

  // iOS pauses the video when the app goes to the background; resume it, or
  // restart the camera if the stream ended meanwhile (also retries a blocked
  // camera after the leader allows it in settings and comes back). Also
  // keeps the screen awake during the walk where the browser allows it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        setCameraKey((k) => k + 1);
      } else {
        void videoRef.current?.play().catch(() => {});
      }
      void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.body.style.overflow = overflow;
      void lock?.release().catch(() => {});
    };
  }, []);

  // Bring back whatever the last session left on this phone, once.
  const restoredRef = useRef(false);
  useEffect(() => {
    // No cancel flag: under StrictMode's mount-unmount-mount a cancelled first
    // run plus this once-guard would skip the restore entirely.
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      // Another leader's shots stay on the phone untouched until they open
      // the walkthrough themselves.
      const stored = (await loadShots()).filter((s) => isStoredPayload(s.payload) && s.payload.userId === userId);
      if (stored.length === 0) return;
      const restored: Shot[] = stored.map((s) => {
        const payload = isStoredPayload(s.payload) ? s.payload : null;
        const saved = payload && isShotForm(payload.form) ? payload.form : null;
        const form: ShotForm = saved ?? {
          mode: "new",
          details: emptyItemDetails(zones[0]?.id ?? ""),
          existingItemId: null,
          existingItemName: null,
          markup: null,
          captureSource: "live",
        };
        return {
          id: s.id,
          previewUrl: URL.createObjectURL(s.blob),
          blob: s.blob,
          aspect: payload?.aspect ?? 0.75,
          capturedAt: s.capturedAt,
          form,
          status: saved && payload?.ready ? "waiting" : "needs-details",
          attempts: 0,
          error: null,
          retryable: true,
          editedAfterSend: false,
        };
      });
      setShots((current) => [...restored.filter((r) => !current.some((c) => c.id === r.id)), ...current]);
      setNotice(`${restored.length} photo${restored.length === 1 ? "" : "s"} from last time ${restored.length === 1 ? "is" : "are"} back in the queue.`);
    })();
  }, [zones, userId]);

  // Free preview memory and pending retries when leaving the screen.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const send = useCallback(
    async (id: string) => {
      const shot = shotsRef.current.find((s) => s.id === id);
      if (!shot || !shot.form || sendingRef.current.has(id)) return;
      // One send loop per shot: two loops double-posted a photo in the
      // Quote Tool. The server would dedupe it, but it still wastes a slow
      // upload on store wifi.
      sendingRef.current.add(id);

      const body = new FormData();
      body.append("photo", new File([shot.blob], `${id}.jpg`, { type: shot.blob.type || "image/jpeg" }));
      body.append("payload", JSON.stringify(buildSavePayload(id, shot.capturedAt, shot.form)));

      let outcome: SendOutcome;
      let message: string | null = null;
      let duplicate = false;
      try {
        const res = await fetch(ENDPOINT, { method: "POST", body, credentials: "same-origin" });
        const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
        if (res.redirected || (res.ok && !isJson)) {
          // A login page that came back 200 is NOT a save.
          outcome = { kind: "http", status: 401 };
          message = "Signed out. Sign in again, then tap Retry.";
        } else if (res.ok) {
          outcome = { kind: "ok" };
          const json = (await res.json().catch(() => null)) as { duplicate?: unknown } | null;
          duplicate = json?.duplicate === true;
        } else {
          outcome = { kind: "http", status: res.status };
          message = res.status === 401 ? "Signed out. Sign in again, then tap Retry." : await readUploadErrorMessage(res);
        }
      } catch {
        outcome = { kind: "network" };
        message = "No connection. It will keep trying.";
      }

      sendingRef.current.delete(id);
      const attempts = shot.attempts + 1;
      const decision = decideSend(outcome, attempts);

      if (decision === "done") {
        void deleteShot(id);
        // An earlier try landed but its answer was lost, and the leader
        // edited the shot since. The server keeps the first version, so say
        // where to fix it instead of showing a plain "Saved" (PR #88 review).
        const lostEdits = duplicate && shot.editedAfterSend;
        patchShot(id, {
          status: "saved",
          attempts,
          error: lostEdits ? "Saved earlier. Later changes did not apply; fix them on the master list." : null,
        });
        return;
      }
      if (decision === "retry") {
        patchShot(id, { status: "waiting", attempts, error: message });
        // The timer only clears itself and touches the shot; the "send what
        // is waiting" effect below does the resend, so there is one path in.
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setShots((current) => current.map((s) => (s.id === id ? { ...s } : s)));
        }, retryDelayMs(attempts));
        timersRef.current.set(id, timer);
        return;
      }
      const retryable = outcome.kind === "network" || (outcome.kind === "http" && (outcome.status >= 500 || outcome.status === 408 || outcome.status === 429));
      patchShot(id, { status: "held", attempts, error: message, retryable });
    },
    [patchShot],
  );

  // Start sending any shot that is ready and not already in flight or
  // waiting on a backoff timer.
  useEffect(() => {
    for (const shot of shots) {
      if (shot.status === "waiting" && !sendingRef.current.has(shot.id) && !timersRef.current.has(shot.id)) {
        void send(shot.id);
      }
    }
  }, [shots, send]);

  // Coming back online retries everything that was stuck on the connection.
  useEffect(() => {
    const onOnline = () => {
      setShots((current) =>
        current.map((s) => (s.status === "held" && s.retryable ? { ...s, status: "waiting", attempts: 0, error: null } : s)),
      );
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  function defaultForm(source: CaptureSource): ShotForm {
    return {
      mode: "new",
      details: emptyItemDetails(zoneId),
      existingItemId: null,
      existingItemName: null,
      markup: null,
      captureSource: source,
    };
  }

  async function addShot(blob: Blob, aspect: number, source: CaptureSource) {
    const id = crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    const form = defaultForm(source);
    // Written before anything else so the shot survives a closed tab. A
    // failed write (private mode, full storage) still lets the walk go on.
    await writeShot({
      id,
      blob,
      payload: { v: 1, aspect, form, ready: false, userId } satisfies StoredPayload,
      capturedAt,
      createdAt: Date.now(),
    });
    const shot: Shot = {
      id,
      previewUrl: URL.createObjectURL(blob),
      blob,
      aspect,
      capturedAt,
      form,
      status: "needs-details",
      attempts: 0,
      error: null,
      retryable: true,
      editedAfterSend: false,
    };
    setShots((current) => [...current, shot]);
    setActiveId(id);
  }

  async function shoot() {
    const video = videoRef.current;
    if (camera !== "live" || !video || video.videoWidth === 0) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    const size = computeTargetDimensions(video.videoWidth, video.videoHeight, CLEANING_PHOTO.maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, size.width, size.height);
    try {
      const blob = await canvasToJpegBlob(canvas, CLEANING_PHOTO.quality);
      await addShot(blob, size.width / size.height, "live");
    } catch {
      setNotice("That photo did not take. Try again.");
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const blob = await downscaleImageToJpeg(file, CLEANING_PHOTO);
    if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      setNotice("This phone saved the photo in a format the app can't read. Try the live camera.");
      return;
    }
    await addShot(blob, await imageAspect(blob), "file");
  }

  function persistForm(shot: Shot, form: ShotForm, ready: boolean) {
    void updateShotPayload(shot.id, { v: 1, aspect: shot.aspect, form, ready, userId } satisfies StoredPayload);
  }

  function discard(id: string) {
    const shot = shotsRef.current.find((s) => s.id === id);
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    void deleteShot(id);
    if (shot) URL.revokeObjectURL(shot.previewUrl);
    setShots((current) => current.filter((s) => s.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function exit() {
    const unsent = shots.filter((s) => isUnsent(s.status)).length;
    if (
      unsent > 0 &&
      !window.confirm(
        `${unsent} photo${unsent === 1 ? " is" : "s are"} not saved yet. ${unsent === 1 ? "It stays" : "They stay"} on this phone and finish${unsent === 1 ? "es" : ""} next time you open the walkthrough. Leave now?`,
      )
    ) {
      return;
    }
    router.push(exitHref);
  }

  const active = shots.find((s) => s.id === activeId) ?? null;
  const lastShot = shots[shots.length - 1] ?? null;
  const savedCount = shots.filter((s) => s.status === "saved").length;
  const attention = shots.filter((s) => s.status === "needs-details" || s.status === "held").length;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#000] text-[#fff]">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col">
          {/* Top bar: exit and the zone, which carries over to every shot. */}
          <div className="flex items-center gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
            <button
              type="button"
              onClick={exit}
              aria-label="Leave the walkthrough"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ffffff26]"
            >
              <X className="h-6 w-6" aria-hidden />
            </button>
            <div className="flex flex-1 gap-2 overflow-x-auto py-1" role="radiogroup" aria-label="Zone for the next photo">
              {zones.map((zone) => {
                const selected = zone.id === zoneId;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setZoneId(zone.id)}
                    className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-bold ${
                      selected ? "bg-[#fff] text-[#111]" : "bg-[#ffffff26] text-[#fff]"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: zone.color }} aria-hidden />
                    {zone.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Viewfinder */}
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            {flash && <div className="pointer-events-none absolute inset-0 bg-[#fff]/70" aria-hidden />}
            {camera === "starting" && (
              <p className="absolute inset-0 flex items-center justify-center text-[15px] text-[#ffffffcc]">Starting camera...</p>
            )}
            {camera === "blocked" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <p className="text-[16px] font-semibold">The camera is blocked for this site.</p>
                <p className="text-[14px] text-[#ffffffb3]">
                  Allow camera access in the browser settings and reopen the walkthrough, or use the phone camera below.
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-12 items-center gap-2 rounded-lg bg-[#fff] px-5 text-[15px] font-bold text-[#111]"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden /> Use phone camera
                </button>
              </div>
            )}
            {notice && (
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="absolute inset-x-3 top-3 rounded-lg bg-[#000000b3] px-3 py-2 text-left text-[14px]"
              >
                {notice} <span className="text-[#ffffffb3]">(tap to hide)</span>
              </button>
            )}
          </div>

          {/* Bottom bar: queue, shutter. */}
          <div className="flex items-center justify-between px-6 pb-2 pt-4">
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              aria-label={`Photo queue: ${queueSummary(shots.map((s) => s.status))}`}
              className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-[#ffffff80] bg-[#ffffff1a]"
            >
              {lastShot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastShot.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[12px] text-[#ffffffb3]">Queue</span>
              )}
              {shots.length > 0 && (
                <span
                  className={`absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-bold ${
                    attention > 0 ? "bg-[#F59E0B] text-[#111]" : "bg-[#16A34A] text-[#fff]"
                  }`}
                >
                  {attention > 0 ? attention : savedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void shoot()}
              disabled={camera !== "live"}
              aria-label="Take photo"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#fff] disabled:opacity-40"
            >
              <span className="h-16 w-16 rounded-full bg-[#fff]" />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Use the phone camera app instead"
              className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#ffffff1a]"
            >
              <Camera className="h-7 w-7" aria-hidden />
            </button>
          </div>
          {/* The safe-area padding sits on this last line so it clears the
              iPhone home indicator, not just the shutter row above it. */}
          <p className="pb-[max(env(safe-area-inset-bottom),12px)] text-center text-[13px] text-[#ffffffb3]">
            {queueSummary(shots.map((s) => s.status))}
          </p>
        </div>
        {/* Fallback for a blocked live camera. capture="environment" opens the
            camera app on most phones but is only a hint, so these photos are
            stored as capture_source "file". */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {queueOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-[#00000080]" onClick={() => setQueueOpen(false)}>
          <div
            className="max-h-[75vh] overflow-y-auto rounded-t-2xl bg-card px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-semibold">This walk</h2>
              <button type="button" className="h-11 px-2 font-semibold text-accent" onClick={() => setQueueOpen(false)}>
                Done
              </button>
            </div>
            {shots.length === 0 && <p className="py-6 text-center text-[15px] text-muted-ink">No photos yet.</p>}
            <ul className="flex flex-col divide-y divide-line">
              {[...shots].reverse().map((shot) => (
                <li key={shot.id} className="flex items-center gap-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.previewUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  <button
                    type="button"
                    className="min-h-[52px] flex-1 text-left"
                    disabled={shot.status === "saved" || shot.status === "waiting"}
                    onClick={() => {
                      setQueueOpen(false);
                      setActiveId(shot.id);
                    }}
                  >
                    <span className="block text-[15px] font-semibold">{shotLabel(shot)}</span>
                    <span
                      className={`block text-[13px] ${
                        shot.status === "held"
                          ? "text-danger"
                          : shot.status === "saved"
                            ? shot.error
                              ? "text-warning"
                              : "text-success"
                            : "text-muted-ink"
                      }`}
                    >
                      {statusText(shot)}
                    </span>
                  </button>
                  {shot.status === "saved" && <CheckCircle2 className="h-6 w-6 text-success" aria-label="Saved" />}
                  {shot.status === "waiting" && <Loader2 className="h-6 w-6 animate-spin text-muted-ink" aria-label="Sending" />}
                  {shot.status === "held" && (
                    <button
                      type="button"
                      aria-label="Retry sending"
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line"
                      onClick={() => patchShot(shot.id, { status: "waiting", attempts: 0, error: null })}
                    >
                      <RotateCcw className="h-5 w-5" aria-hidden />
                    </button>
                  )}
                  {(shot.status === "held" || shot.status === "needs-details") && (
                    <button
                      type="button"
                      aria-label="Delete photo"
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-danger"
                      onClick={() => {
                        if (window.confirm("Delete this photo? It has not been saved.")) discard(shot.id);
                      }}
                    >
                      <Trash2 className="h-5 w-5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {active && active.form && (
        <WalkthroughDetailsSheet
          key={active.id}
          previewUrl={active.previewUrl}
          aspect={active.aspect}
          initial={active.form}
          zones={zones}
          items={items}
          serverError={active.status === "held" ? active.error : null}
          onSave={(form) => {
            persistForm(active, form, true);
            if (form.mode === "new") setZoneId(form.details.zoneId);
            patchShot(active.id, {
              form,
              status: "waiting",
              attempts: 0,
              error: null,
              editedAfterSend: active.editedAfterSend || active.attempts > 0,
            });
            setActiveId(null);
          }}
          onLater={(form) => {
            persistForm(active, form, false);
            patchShot(active.id, { form });
            setActiveId(null);
          }}
          onDiscard={() => discard(active.id)}
        />
      )}
    </>
  );
}
