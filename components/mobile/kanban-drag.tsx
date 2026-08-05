"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Touch + mouse + pen drag-and-drop for Kanban-style boards (maintenance
 * work orders, catering pipeline). Native HTML5 drag-and-drop (the
 * `draggable` attribute + dragstart/dragover/drop) never fires from a touch
 * interaction on iOS/Android at all -- it is mouse-only -- which is why the
 * original catering board's drag-and-drop silently did nothing on a phone,
 * the actual device this app runs on. This hook uses Pointer Events instead,
 * which unify mouse/touch/pen, and does its own hit-testing via
 * `elementFromPoint` rather than relying on native dragover/drop.
 *
 * Interaction: a mouse drag arms as soon as the pointer moves past a small
 * threshold (desktop click-drag is unambiguous). A touch/pen drag requires a
 * brief press-and-hold first, so a normal scroll swipe that happens to start
 * on a card is never hijacked into a drag -- if the pointer moves more than
 * a small tolerance before the hold timer fires, the gesture is treated as
 * a scroll and released back to the browser untouched.
 *
 * Ref ownership: the caller creates `containerRef` (its scrolling row of
 * columns) and `ghostElRef` (the floating drag-preview node it renders,
 * usually via KanbanGhostPortal below) with its own `useRef` calls and
 * passes them in, rather than this hook creating and returning them --
 * refs and any JSX built around them stay inside the component that owns
 * them, which this project's stricter react-hooks/refs lint rule requires
 * (a ref, or a `ref=`-bearing element, crossing back out of a custom hook's
 * return value gets flagged even though the underlying pattern is safe).
 * Position tracking and the edge-auto-scroll/ghost-follow loop run inside a
 * `useEffect` scoped to the armed drag, so refs are only ever touched
 * inside that effect or a pointer event handler, never during render.
 * `overColumn` is the only per-move React state, and only updates when the
 * pointer actually crosses into a different column, so dragging doesn't
 * re-render the whole board on every pointermove.
 */

const TOUCH_HOLD_MS = 180;
const TOUCH_CANCEL_TOLERANCE_PX = 10;
const MOUSE_ARM_THRESHOLD_PX = 6;
const EDGE_SCROLL_ZONE_PX = 56;
const EDGE_SCROLL_MAX_SPEED = 16;
export const KANBAN_GHOST_OFFSET_X = 16;
export const KANBAN_GHOST_OFFSET_Y = -12;

interface PendingDrag {
  cardId: string;
  ghost: ReactNode;
  pointerType: string;
  startX: number;
  startY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

interface ArmedDrag {
  cardId: string;
  ghost: ReactNode;
}

export interface KanbanDragOptions {
  /** Called on drop with the card id and the column it was dropped on. */
  onDrop: (cardId: string, column: string) => void;
  /** The horizontally-scrolling row of columns, for edge auto-scroll. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The floating ghost preview's DOM node (see KanbanGhostPortal). */
  ghostElRef: RefObject<HTMLDivElement | null>;
}

export interface KanbanDragApi {
  /** Spread onto a column's wrapper element. */
  columnProps(column: string): { "data-kanban-column": string };
  /**
   * Spread onto a card's wrapper element. `disabled` (e.g. a terminal-status
   * card with nowhere valid to go) renders no drag handlers at all, so the
   * card isn't a false affordance.
   */
  cardHandlers(
    cardId: string,
    ghost: ReactNode,
    options?: { disabled?: boolean },
  ): { onPointerDown?: (e: ReactPointerEvent) => void };
  /** The column currently under the pointer while dragging (for highlight). */
  overColumn: string | null;
  /** The card id currently being dragged (for source-card dim styling). */
  draggingId: string | null;
  /** Ghost preview content while armed, or null; render via KanbanGhostPortal. */
  armedGhostContent: ReactNode | null;
}

function findColumnAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const column = el?.closest("[data-kanban-column]");
  return column?.getAttribute("data-kanban-column") ?? null;
}

export function useKanbanDrag({ onDrop, containerRef, ghostElRef }: KanbanDragOptions): KanbanDragApi {
  const [armed, setArmed] = useState<ArmedDrag | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const pendingRef = useRef<PendingDrag | null>(null);
  const armedRef = useRef<ArmedDrag | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const overColumnRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const endDrag = useCallback(
    (drop: boolean) => {
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (drop && armedRef.current && overColumnRef.current) {
        onDrop(armedRef.current.cardId, overColumnRef.current);
      }

      pendingRef.current = null;
      armedRef.current = null;
      overColumnRef.current = null;
      setArmed(null);
      setOverColumn(null);
    },
    [onDrop],
  );

  const arm = useCallback((cardId: string, ghost: ReactNode) => {
    const next = { cardId, ghost };
    armedRef.current = next;
    setArmed(next);
  }, []);

  // Ghost position + edge auto-scroll: one requestAnimationFrame loop, alive
  // only while a drag is armed. Started/torn down by this effect (also runs
  // its cleanup on unmount, so a drag in flight when the board unmounts
  // still cancels its frame) -- refs are only touched inside `tick` here,
  // never during render.
  useEffect(() => {
    if (!armed) return;
    let rafId: number;

    function tick() {
      const el = ghostElRef.current;
      if (el) {
        el.style.transform = `translate3d(${posRef.current.x + KANBAN_GHOST_OFFSET_X}px, ${posRef.current.y + KANBAN_GHOST_OFFSET_Y}px, 0)`;
      }

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const x = posRef.current.x;
        if (x < rect.left + EDGE_SCROLL_ZONE_PX) {
          const depth = (rect.left + EDGE_SCROLL_ZONE_PX - x) / EDGE_SCROLL_ZONE_PX;
          container.scrollLeft -= EDGE_SCROLL_MAX_SPEED * Math.min(1, depth);
        } else if (x > rect.right - EDGE_SCROLL_ZONE_PX) {
          const depth = (x - (rect.right - EDGE_SCROLL_ZONE_PX)) / EDGE_SCROLL_ZONE_PX;
          container.scrollLeft += EDGE_SCROLL_MAX_SPEED * Math.min(1, depth);
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [armed, containerRef, ghostElRef]);

  const cardHandlers = useCallback(
    (cardId: string, ghost: ReactNode, options?: { disabled?: boolean }) => {
      if (options?.disabled) return {};

      return {
        onPointerDown: (e: ReactPointerEvent) => {
          // Never arm from an interactive descendant (a link, the stage
          // dropdown, a remove button) -- let it handle its own click.
          const target = e.target as HTMLElement;
          if (target.closest?.('a, button, select, input, textarea, [role="combobox"], [data-no-drag]')) {
            return;
          }
          if (e.pointerType === "mouse" && e.button !== 0) return;

          const pointerType = e.pointerType;
          const startX = e.clientX;
          const startY = e.clientY;
          posRef.current = { x: startX, y: startY };

          function onMove(ev: PointerEvent) {
            posRef.current = { x: ev.clientX, y: ev.clientY };

            if (!armedRef.current) {
              const pending = pendingRef.current;
              if (!pending) return;
              const dx = ev.clientX - pending.startX;
              const dy = ev.clientY - pending.startY;
              const dist = Math.hypot(dx, dy);

              if (pending.pointerType === "mouse") {
                if (dist > MOUSE_ARM_THRESHOLD_PX) {
                  if (pending.holdTimer) clearTimeout(pending.holdTimer);
                  ev.preventDefault();
                  arm(pending.cardId, pending.ghost);
                }
              } else if (dist > TOUCH_CANCEL_TOLERANCE_PX) {
                // Moved too far before the hold armed: a scroll gesture, not
                // a drag. Release cleanly and let the browser keep scrolling.
                if (pending.holdTimer) clearTimeout(pending.holdTimer);
                endDrag(false);
              }
              return;
            }

            ev.preventDefault();
            const column = findColumnAt(ev.clientX, ev.clientY);
            if (column !== overColumnRef.current) {
              overColumnRef.current = column;
              setOverColumn(column);
            }
          }

          function onUp() {
            const pending = pendingRef.current;
            if (pending?.holdTimer) clearTimeout(pending.holdTimer);
            endDrag(true);
          }

          function onCancel() {
            const pending = pendingRef.current;
            if (pending?.holdTimer) clearTimeout(pending.holdTimer);
            endDrag(false);
          }

          window.addEventListener("pointermove", onMove, { passive: false });
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onCancel);
          cleanupRef.current = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
          };

          if (pointerType === "mouse") {
            pendingRef.current = { cardId, ghost, pointerType, startX, startY, holdTimer: null };
          } else {
            const holdTimer = setTimeout(() => {
              // Still within tolerance of the start point: a deliberate
              // press-and-hold, not a scroll swipe. Arm the drag now.
              const dx = posRef.current.x - startX;
              const dy = posRef.current.y - startY;
              if (Math.hypot(dx, dy) <= TOUCH_CANCEL_TOLERANCE_PX) {
                arm(cardId, ghost);
              }
            }, TOUCH_HOLD_MS);
            pendingRef.current = { cardId, ghost, pointerType, startX, startY, holdTimer };
          }
        },
      };
    },
    [arm, endDrag],
  );

  // Safety net: release the window listeners if the component unmounts
  // mid-drag (the rAF loop's own cleanup, above, handles itself).
  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const columnProps = useCallback(
    (column: string) => ({ "data-kanban-column": column }),
    [],
  );

  return {
    columnProps,
    cardHandlers,
    overColumn,
    draggingId: armed?.cardId ?? null,
    armedGhostContent: armed?.ghost ?? null,
  };
}

/** Default ghost preview: a compact card with a title and optional caption. */
export function KanbanGhostCard({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="w-[220px] rounded-xl border border-line bg-card px-3 py-2 shadow-lg">
      <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
      {caption && <p className="truncate text-[13px] text-muted-ink">{caption}</p>}
    </div>
  );
}
