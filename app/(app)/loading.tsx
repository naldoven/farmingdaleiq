/**
 * Route-group loading boundary. Next streams this skeleton immediately on
 * navigation while a segment's server component fetches its data, so switching
 * pages feels instant instead of blocking on the network. Kept generic (a
 * title bar, a stat row, and a list) so it reads sensibly for every screen in
 * the group without pretending to match any one layout exactly.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* Title */}
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />

      {/* Stat / summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
