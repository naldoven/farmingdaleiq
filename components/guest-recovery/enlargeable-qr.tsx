"use client";

import { useEffect, useState } from "react";

/**
 * The guest's QR code. Tapping it opens a full-screen white view with the code as
 * large as the screen allows, so a team member can scan it off a phone from a
 * normal distance. Escape, the Close button, or a tap outside the code closes it.
 *
 * The code arrives as a data-URI image: nothing from the generated SVG is ever
 * parsed as page HTML.
 */
export function EnlargeableQr({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Enlarge your code"
        className="block w-full max-w-[280px] rounded-2xl bg-white p-3 text-center text-ink"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Your code" className="aspect-square w-full" />
        <span className="mt-1 block text-[12px] text-muted-ink">Tap to enlarge</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your code, enlarged"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-5 text-center text-ink"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Dismiss"
            className="absolute inset-0 h-full w-full cursor-default"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Your code, enlarged" className="pointer-events-none relative aspect-square w-full max-w-[min(92vw,66dvh)]" />
          <p className="pointer-events-none relative text-[16px] font-extrabold">Show this to a team member.</p>
          <p className="pointer-events-none relative text-[13px] text-muted-ink">
            Turn your screen brightness up. Tap anywhere to close.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="relative min-h-11 rounded-full bg-accent px-8 text-[15px] font-extrabold text-white"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
