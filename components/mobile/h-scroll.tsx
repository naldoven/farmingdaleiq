import * as React from "react";

import { cn } from "@/lib/utils";

export interface HScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Snap alignment for children. Defaults to start. */
  snap?: "start" | "center" | "none";
}

/**
 * Horizontal snap-scroll row (the scoreboard pattern). Children lay out in a
 * single row that scrolls sideways inside its own container, so the page body
 * never scrolls horizontally. Scrollbar is hidden; edge padding is included so
 * the first/last tiles are not clipped.
 *
 * forwardRef so a Kanban board can attach its scroll container ref here (for
 * edge auto-scroll while dragging a card, components/mobile/kanban-drag.tsx)
 * without giving up this shared scoreboard-row primitive.
 */
export const HScroll = React.forwardRef<HTMLDivElement, HScrollProps>(function HScroll(
  { snap = "start", className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1",
        snap === "none" && "snap-none",
        className,
      )}
      {...props}
    >
      {React.Children.map(children, (child) =>
        child == null ? null : (
          <div
            className={cn(
              "shrink-0",
              snap === "center"
                ? "snap-center"
                : snap === "start"
                  ? "snap-start"
                  : undefined,
            )}
          >
            {child}
          </div>
        ),
      )}
    </div>
  );
});
