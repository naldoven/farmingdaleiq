"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasUnread || isPending}
          onClick={() => startTransition(async () => {
            await markAllRead();
            router.refresh();
          })}
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </CardContent>
        </Card>
      )}

      {notifications.map((n) => {
        const content = (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{n.title}</p>
                {!n.read_at && <Badge variant="default">New</Badge>}
              </div>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
            </div>
          </div>
        );

        return (
          <Card key={n.id}>
            <CardContent
              className="cursor-pointer p-4"
              onClick={() => {
                if (!n.read_at) {
                  startTransition(async () => {
                    await markRead({ id: n.id });
                    router.refresh();
                  });
                }
              }}
            >
              {n.link ? (
                <Link href={n.link} className="block">
                  {content}
                </Link>
              ) : (
                content
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
