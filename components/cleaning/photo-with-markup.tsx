import { strokePoints, type MarkupData } from "@/app/(app)/cleaning/logic";
import { cn } from "@/lib/utils";

/**
 * A reference photo with its saved drawing laid over it. The drawing is
 * stored as 0-1 strokes of the photo's own box (docs/CLEANING-PLAN.md "Phase
 * W": shapes on top of the untouched original), so the overlay only lines up
 * if it covers exactly the image box. That is why the img keeps its natural
 * aspect (w-full, h-auto) and the svg is stretched over it with
 * preserveAspectRatio="none".
 *
 * No hooks, so server pages and client lists can both render it.
 */
export function PhotoWithMarkup({
  src,
  markup,
  alt,
  className,
  emptyLabel = "No photo yet",
}: {
  src: string | null;
  markup: MarkupData | null;
  alt: string;
  className?: string;
  /** Lets a caller say "Photo unavailable" when a photo exists but its URL did not sign. */
  emptyLabel?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-secondary px-1 text-center text-[12px] font-medium leading-tight text-muted-ink",
          className,
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  const strokes = markup?.strokes.filter((stroke) => stroke.points.length > 0) ?? [];

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-secondary", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private-bucket signed URL; next/image would need the storage host allow-listed and would crop the natural aspect the overlay depends on. */}
      <img src={src} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" />
      {strokes.length > 0 ? (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {strokes.map((stroke, index) => {
            // A lone tap has one point, which a polyline will not paint. Doubling
            // it makes a zero-length segment, which round caps draw as a dot.
            const points = stroke.points.length === 1 ? [stroke.points[0], stroke.points[0]] : stroke.points;
            const common = {
              points: strokePoints(points),
              fill: "none",
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
              // Pixel widths, not 0-1 units: the line must stay the same
              // thickness whether the photo is a 72px thumbnail or full width.
              vectorEffect: "non-scaling-stroke" as const,
            };
            return (
              <g key={index}>
                {/* The white halo keeps the red line readable on dark or red surfaces. */}
                <polyline {...common} stroke="#FFFFFF" strokeWidth={6} />
                <polyline {...common} stroke="#DC2626" strokeWidth={3} />
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
