"use client";

import { useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";

import { normalizePoint, strokePoints, thinStroke, type MarkupData } from "@/app/(app)/cleaning/logic";

/**
 * Draw on a just-taken photo to point at the exact spot ("the vent ABOVE
 * boards"). Strokes are stored in normalized 0-1 coordinates of the photo's
 * own box, so PhotoWithMarkup lines them up at any size and the original
 * photo is never altered.
 *
 * The photo renders at its natural aspect (never object-contain/cover): the
 * overlay is the same box as the image, which is what keeps a circle on the
 * vent instead of beside it. Height is capped by limiting width to
 * maxHeightVh * aspect.
 */
export function MarkupCanvas({
  src,
  aspect,
  value,
  onChange,
  maxHeightVh = 42,
}: {
  src: string;
  /** width / height of the photo. */
  aspect: number;
  value: MarkupData | null;
  onChange: (next: MarkupData | null) => void;
  maxHeightVh?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<[number, number][] | null>(null);
  const strokes = value?.strokes ?? [];

  function pointFrom(event: React.PointerEvent): [number, number] | null {
    const box = boxRef.current?.getBoundingClientRect();
    return box ? normalizePoint(event.clientX, event.clientY, box) : null;
  }

  function handleDown(event: React.PointerEvent) {
    const p = pointFrom(event);
    if (!p) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLive([p]);
  }

  function handleMove(event: React.PointerEvent) {
    if (!live) return;
    const p = pointFrom(event);
    if (p) setLive([...live, p]);
  }

  function handleUp() {
    if (!live) return;
    // A tap with no movement still marks a dot, which is a valid pointer.
    const points = thinStroke(live);
    setLive(null);
    onChange({ strokes: [...strokes, { points }] });
  }

  const shown = live ? [...strokes, { points: live }] : strokes;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ maxWidth: `calc(${maxHeightVh}vh * ${aspect})` }}
      >
        {/* A blob: preview URL; next/image cannot optimize it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Photo to mark up" className="block h-auto w-full select-none" draggable={false} />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          role="img"
          aria-label="Draw on the photo to mark the spot"
        >
          {shown.map((stroke, index) => (
            <g key={index}>
              <polyline
                points={strokePoints(stroke.points)}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={strokePoints(stroke.points)}
                fill="none"
                stroke="#DC2626"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="flex w-full items-center justify-between text-[13px] text-muted-ink">
        <span>Draw a circle or arrow on the spot (optional)</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-11 items-center gap-1 rounded-lg border border-line px-3 font-semibold text-ink disabled:opacity-40"
            disabled={strokes.length === 0}
            onClick={() => onChange(strokes.length > 1 ? { strokes: strokes.slice(0, -1) } : null)}
          >
            <Undo2 className="h-4 w-4" aria-hidden /> Undo
          </button>
          <button
            type="button"
            className="flex h-11 items-center gap-1 rounded-lg border border-line px-3 font-semibold text-ink disabled:opacity-40"
            disabled={strokes.length === 0}
            onClick={() => onChange(null)}
          >
            <Eraser className="h-4 w-4" aria-hidden /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}
