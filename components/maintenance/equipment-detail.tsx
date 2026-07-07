"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addEquipmentFile, setEquipmentStatus } from "@/app/(app)/maintenance/equipment/actions";
import { PmScheduleManager, type PmScheduleRow } from "@/components/maintenance/pm-schedule-manager";
import type { PersonOption } from "@/components/maintenance/triage-queue";

export interface EquipmentDetailData {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  model: string | null;
  serial: string | null;
  service_vendor_name: string | null;
  installed_on: string | null;
  warranty_expires_on: string | null;
  status: string;
  notes: string | null;
}

export interface FileRow {
  id: string;
  file_url: string;
  label: string | null;
}

export interface DowntimeRow {
  id: string;
  started_at: string;
  ended_at: string | null;
}

export interface EquipmentWorkOrderRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

function StatusToggle({ equipment }: { equipment: EquipmentDetailData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Badge variant={equipment.status === "down" ? "destructive" : "success"}>{equipment.status}</Badge>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setEquipmentStatus({
              equipmentId: equipment.id,
              status: equipment.status === "down" ? "operational" : "down",
              workOrderId: undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        Mark {equipment.status === "down" ? "operational" : "down"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function FilesManager({ equipmentId, files }: { equipmentId: string; files: FileRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.file_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary hover:underline"
        >
          {file.label || file.file_url}
        </a>
      ))}
      {files.length === 0 && <p className="text-sm text-muted-foreground">No manuals or files attached.</p>}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await addEquipmentFile({ equipmentId, fileUrl, label: label || undefined });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setFileUrl("");
            setLabel("");
            router.refresh();
          });
        }}
      >
        <Input
          aria-label="File URL"
          placeholder="File URL"
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          className="max-w-[16rem]"
          required
        />
        <Input
          aria-label="Label"
          placeholder="Label (e.g. Manual)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-[10rem]"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
          {isPending ? "Adding..." : "Add file"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Equipment detail page (ARCHITECTURE.md "Equipment registry"). */
export function EquipmentDetail({
  equipment,
  files,
  downtime,
  workOrders,
  pmSchedules,
  assigneeOptions,
  vendorOptions,
  canManage,
}: {
  equipment: EquipmentDetailData;
  files: FileRow[];
  downtime: DowntimeRow[];
  workOrders: EquipmentWorkOrderRow[];
  pmSchedules: PmScheduleRow[];
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{equipment.name}</h1>
        {canManage ? (
          <StatusToggle equipment={equipment} />
        ) : (
          <Badge variant={equipment.status === "down" ? "destructive" : "success"}>{equipment.status}</Badge>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {equipment.category && (
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{equipment.category}</dd>
          </div>
        )}
        {equipment.area && (
          <div>
            <dt className="text-muted-foreground">Area</dt>
            <dd>{equipment.area}</dd>
          </div>
        )}
        {equipment.model && (
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{equipment.model}</dd>
          </div>
        )}
        {equipment.serial && (
          <div>
            <dt className="text-muted-foreground">Serial</dt>
            <dd>{equipment.serial}</dd>
          </div>
        )}
        {equipment.service_vendor_name && (
          <div>
            <dt className="text-muted-foreground">Service vendor</dt>
            <dd>{equipment.service_vendor_name}</dd>
          </div>
        )}
        {equipment.installed_on && (
          <div>
            <dt className="text-muted-foreground">Installed</dt>
            <dd>{equipment.installed_on}</dd>
          </div>
        )}
        {equipment.warranty_expires_on && (
          <div>
            <dt className="text-muted-foreground">Warranty expires</dt>
            <dd>{equipment.warranty_expires_on}</dd>
          </div>
        )}
      </dl>
      {equipment.notes && <p className="text-sm text-muted-foreground">{equipment.notes}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Manuals &amp; files</CardTitle>
        </CardHeader>
        <CardContent>
          <FilesManager equipmentId={equipment.id} files={files} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preventive maintenance</CardTitle>
        </CardHeader>
        <CardContent>
          <PmScheduleManager
            equipmentId={equipment.id}
            schedules={pmSchedules}
            assigneeOptions={assigneeOptions}
            vendorOptions={vendorOptions}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Downtime history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {downtime.map((span) => (
                <TableRow key={span.id}>
                  <TableCell>{new Date(span.started_at).toLocaleString()}</TableCell>
                  <TableCell>{span.ended_at ? new Date(span.ended_at).toLocaleString() : "Ongoing"}</TableCell>
                </TableRow>
              ))}
              {downtime.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No downtime recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work order history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrders.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell>
                    <Link href={`/maintenance/${wo.id}`} className="text-primary hover:underline">
                      {wo.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{wo.status.replace("_", " ")}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(wo.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {workOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No work orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
