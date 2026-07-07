"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { deleteChannel, sendTestMessage, updateChannel } from "@/app/(app)/settings/discord/actions";

export interface ChannelRow {
  id: string;
  name: string;
  purpose: string | null;
  active: boolean;
}

function ChannelRowItem({ channel }: { channel: ChannelRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rotating, setRotating] = useState(false);
  const [newWebhook, setNewWebhook] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={channel.active}
            onCheckedChange={(checked) =>
              startTransition(async () => {
                await updateChannel({ id: channel.id, active: checked === true });
                router.refresh();
              })
            }
          />
          <span className="font-medium">{channel.name}</span>
          {channel.purpose && (
            <span className="text-sm text-muted-foreground">— {channel.purpose}</span>
          )}
          <Badge variant={channel.active ? "success" : "outline"}>
            {channel.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await sendTestMessage({ channelId: channel.id });
                setMessage(
                  result.ok
                    ? result.data.delivered
                      ? "Test message delivered."
                      : "Queued — will retry."
                    : result.error,
                );
              })
            }
          >
            Send test
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRotating((v) => !v)}>
            Rotate webhook
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                if (!window.confirm(`Delete channel "${channel.name}"?`)) return;
                await deleteChannel({ id: channel.id });
                router.refresh();
              })
            }
          >
            Delete
          </Button>
        </div>
      </div>

      {rotating && (
        <div className="flex gap-2">
          <Input
            placeholder="New https://discord.com/api/webhooks/... URL"
            value={newWebhook}
            onChange={(e) => setNewWebhook(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={!newWebhook || isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateChannel({ id: channel.id, webhookUrl: newWebhook });
                if (result.ok) {
                  setNewWebhook("");
                  setRotating(false);
                  router.refresh();
                } else {
                  setMessage(result.error);
                }
              })
            }
          >
            Save
          </Button>
        </div>
      )}

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

export function ChannelList({ channels }: { channels: ChannelRow[] }) {
  if (channels.length === 0) {
    return <p className="text-sm text-muted-foreground">No channels registered yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {channels.map((channel) => (
        <ChannelRowItem key={channel.id} channel={channel} />
      ))}
    </div>
  );
}
