"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setEventRoute } from "@/app/(app)/settings/discord/actions";
import type { ChannelRow } from "@/components/settings/channel-list";

const EVENT_LABELS: Record<string, string> = {
  task_overdue: "Task overdue",
  checklist_missed: "Checklist missed",
  break_overdue: "Break overdue",
  temp_failed: "Out-of-range temperature",
  maint_request: "New maintenance request",
  work_order_status: "Work order status change",
  equipment_down: "Equipment down",
  equipment_up: "Equipment back up",
  pm_due: "PM coming due",
  recognition: "Recognition",
  top_performer: "Top Performer",
  broadcast: "Broadcast",
  reward_claim: "Reward claim",
  catering_order_new: "New catering order",
  catering_stage_change: "Catering stage change",
  infraction_issued: "Infraction issued (name only, no points)",
  disciplinary_triggered: "Disciplinary action (name only, no points)",
};

interface RouteConfig {
  event_key: string;
  channel_id: string | null;
  enabled: boolean;
}

export function EventRouteTable({
  eventKeys,
  channels,
  routeByKey,
}: {
  eventKeys: readonly string[];
  channels: ChannelRow[];
  routeByKey: Record<string, RouteConfig>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Enabled</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {eventKeys.map((key) => {
          const route = routeByKey[key];
          const channelId = route?.channel_id ?? "";
          const enabled = route?.enabled ?? false;

          return (
            <TableRow key={key}>
              <TableCell>{EVENT_LABELS[key] ?? key}</TableCell>
              <TableCell>
                <Select
                  value={channelId || undefined}
                  disabled={isPending}
                  onValueChange={(value) =>
                    startTransition(async () => {
                      await setEventRoute({ eventKey: key, channelId: value, enabled });
                      router.refresh();
                    })
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="No channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={enabled}
                  disabled={isPending || !channelId}
                  onCheckedChange={(checked) =>
                    startTransition(async () => {
                      await setEventRoute({
                        eventKey: key,
                        channelId: channelId || null,
                        enabled: checked === true,
                      });
                      router.refresh();
                    })
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
