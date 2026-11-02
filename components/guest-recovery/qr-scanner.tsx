"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Camera, X } from "lucide-react";

import { extractRecoveryToken } from "@/app/(app)/guest-recovery/scan";
import { SectionCard } from "@/components/mobile";

const FIELD =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink placeholder:text-muted-ink";

/** Frames are read this often, and downscaled to this width: plenty to read a QR, light on a phone. */
const SCAN_INTERVAL_MS = 150;
const SCAN_WIDTH = 640;

type CameraState = "idle" | "starting" | "scanning" | "denied" | "unsupported";

/**
 * Scan a guest's QR code inside the app (ARCHITECTURE.md "Guest Recovery").
 * A leader can also point the phone's own camera at it; this is for the leader
 * who is already in the app. The scanner reads the code, takes only the token
 * out of it (scan.ts), and opens /recover/<token>, which sends a signed-in
 * leader on to the redeem screen. Typing or pasting the code or link works too,
 * for a dark room, a cracked camera or a guest who has only the text.
 */
export function QrScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastBadRef = useRef<string>("");
  const doneRef = useRef(false);

  const [camera, setCamera] = useState<CameraState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  function open(token: string) {
    if (doneRef.current) return;
    doneRef.current = true;
    stopCamera();
    router.push(`/recover/${token}`);
  }

  async function start() {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCamera("scanning");
      loop();
    } catch (error) {
      stopCamera();
      const name = (error as { name?: string })?.name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }

  function loop() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let last = 0;

    const tick = (now: number) => {
      frameRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || !context || video.readyState < 2 || now - last < SCAN_INTERVAL_MS) return;
      last = now;

      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      if (!found?.data) return;

      const token = extractRecoveryToken(found.data);
      if (token) {
        open(token);
      } else if (found.data !== lastBadRef.current) {
        lastBadRef.current = found.data;
        setMessage("That QR code is not a guest recovery code.");
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const token = extractRecoveryToken(manual);
    if (!token) {
      setManualError("That is not a guest recovery code. Paste the whole link or the 64-character code.");
      return;
    }
    setManualError(null);
    open(token);
  }

  const showVideo = camera === "starting" || camera === "scanning";

  return (
    <div className="space-y-4">
      <SectionCard title="Scan the guest's code">
        <div className="space-y-3">
          <div className={showVideo ? "overflow-hidden rounded-xl bg-black" : "hidden"}>
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" aria-label="Camera view" />
          </div>

          {camera === "scanning" && (
            <p role="status" className="text-sm text-muted-ink">
              Point the camera at the guest&apos;s QR code. It opens on its own.
            </p>
          )}
          {camera === "denied" && (
            <p role="alert" className="text-sm font-medium text-danger">
              Camera access is blocked. Allow the camera for this site in your browser settings, or paste the code below.
            </p>
          )}
          {camera === "unsupported" && (
            <p role="alert" className="text-sm font-medium text-danger">
              This phone or browser cannot open the camera here. Use your phone&apos;s own camera on the QR, or paste the code below.
            </p>
          )}
          {message && (
            <p role="alert" className="text-sm font-medium text-danger">
              {message}
            </p>
          )}

          {showVideo ? (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCamera("idle");
              }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 text-base font-semibold text-ink"
            >
              <X className="size-5" aria-hidden />
              Stop camera
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-base font-semibold text-white"
            >
              <Camera className="size-5" aria-hidden />
              Scan with camera
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Or enter the code">
        <form onSubmit={submitManual} className="space-y-3" noValidate>
          <div>
            <label htmlFor="recovery-code" className="mb-1 block text-sm font-semibold text-ink">
              Paste the guest&apos;s link or code
            </label>
            <input
              id="recovery-code"
              className={FIELD}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          {manualError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {manualError}
            </p>
          )}
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg border border-border px-4 text-base font-semibold text-ink"
          >
            Open
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
