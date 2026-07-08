"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { ChipRow, FilterChip, SectionCard, StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "@/app/(app)/notifications/actions";

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

type Filter = "all" | "unread";

/**
 * Notification center list, restyled to the KitchenIQ mobile design system
 * (docs/DESIGN-SYSTEM.md): a chip row (All / Unread) over a flush
 * SectionCard of rows, unread rows carrying a tinted icon chip, bold title,
 * and a "New" StatusBadge (never color-only — the label carries the state).
 * Tapping a row marks it read (same `markRead` action as before) and
 * navigates to `link` when present; "Mark all read" calls the same
 * `markAllRead` action. No data or permission changes from the prior
 * version, only the presentation.
 */
export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const visible = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications),
    [notifications, filter],
  );

  function openNotification(n: NotificationRow) {
    if (!n.read_at) {
      startTransition(async () => {
        await markRead({ id: n.id });
        router.refresh();
      });
    }
    if (n.link) {
      router.push(n.link);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipRow aria-label="Notification filters">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({notifications.length})
        </FilterChip>
        <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
          Unread ({unreadCount})
        </FilterChip>
      </ChipRow>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[13px] font-semibold text-accent disabled:opacity-40"
          disabled={unreadCount === 0 || isPending}
          onClick={() =>
            startTransition(async () => {
              await markAllRead();
              router.refresh();
            })
          }
        >
          Mark all read
        </button>
      </div>

      {visible.length === 0 ? (
        <SectionCard>
          <p className="py-6 text-center text-[13px] text-muted-ink">
            {filter === "unread" ? "No unread notifications." : "You're all caught up."}
          </p>
        </SectionCard>
      ) : (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {visible.map((n) => {
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                  onClick={() => openNotification(n)}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      unread ? "bg-accent-soft text-accent-ink" : "bg-secondary text-muted-ink",
                    )}
                  >
                    <Bell className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px]",
                          unread ? "font-bold text-ink" : "font-semibold text-ink",
                        )}
                      >
                        {n.title}
                      </span>
                      {unread && (
                        <StatusBadge tone="accent" dot className="shrink-0">
                          New
                        </StatusBadge>
                      )}
                    </span>
                    {n.body && (
                      <span className="block truncate text-[13px] text-muted-ink">{n.body}</span>
                    )}
                    <span className="block text-[13px] text-muted-ink">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
