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

/**
 * A route with no channel has nowhere to deliver, so its effective enabled
 * state is always false regardless of the stored `enabled` flag (F-SET-2).
 * This is what closes the client footgun: assigning a channel to an orphaned
 * route must not silently carry a stale `enabled = true` from the DB. The
 * admin has to tick the checkbox in the current UI to turn it on.
 */
export function effectiveEnabled(channelId: string, storedEnabled: boolean): boolean {
  return channelId ? storedEnabled : false;
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

  /** The channel dropdown for one route, shared by the mobile card and the desktop table. */
  const renderChannelSelect = (key: string, channelId: string, enabled: boolean) => (
    <Select
      value={channelId || undefined}
      disabled={isPending}
      onValueChange={(value) =>
        startTransition(async () => {
          // `enabled` here is already the effective value: false when the route
          // was previously unlinked, so a fresh assignment never reactivates it.
          await setEventRoute({ eventKey: key, channelId: value, enabled });
          router.refresh();
        })
      }
    >
      <SelectTrigger className="w-full sm:w-[200px]">
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
  );

  /** The enabled checkbox for one route, shared by both layouts. */
  const renderEnabledCheckbox = (key: string, channelId: string, enabled: boolean, id?: string) => (
    <Checkbox
      id={id}
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
  );

  return (
    <>
      {/* Mobile (F-SET-4): each route is a stacked card so nothing is clipped
          off-screen the way a horizontally-overflowing table would be at 375px. */}
      <div className="flex flex-col gap-3 md:hidden">
        {eventKeys.map((key) => {
          const route = routeByKey[key];
          const channelId = route?.channel_id ?? "";
          const enabled = effectiveEnabled(channelId, route?.enabled ?? false);
          const checkboxId = `route-enabled-${key}`;

          return (
            <div key={key} className="flex flex-col gap-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">{EVENT_LABELS[key] ?? key}</p>
              {renderChannelSelect(key, channelId, enabled)}
              <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm">
                {renderEnabledCheckbox(key, channelId, enabled, checkboxId)}
                <span>Enabled</span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Desktop: the full table. */}
      <div className="hidden md:block">
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
              const enabled = effectiveEnabled(channelId, route?.enabled ?? false);

              return (
                <TableRow key={key}>
                  <TableCell>{EVENT_LABELS[key] ?? key}</TableCell>
                  <TableCell>{renderChannelSelect(key, channelId, enabled)}</TableCell>
                  <TableCell>{renderEnabledCheckbox(key, channelId, enabled)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
