"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createEquipment } from "@/app/(app)/maintenance/equipment/actions";
import type { PersonOption } from "@/components/maintenance/triage-queue";

export interface EquipmentRow {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  status: string;
  service_vendor_name: string | null;
}

const NONE_VALUE = "none";

interface FormState {
  name: string;
  category: string;
  area: string;
  model: string;
  serial: string;
  serviceVendorId: string;
  installedOn: string;
  warrantyExpiresOn: string;
  photoUrl: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    category: "",
    area: "",
    model: "",
    serial: "",
    serviceVendorId: NONE_VALUE,
    installedOn: "",
    warrantyExpiresOn: "",
    photoUrl: "",
    notes: "",
  };
}

/** Equipment registry list + create (ARCHITECTURE.md "Equipment registry"). */
export function EquipmentList({
  equipment,
  vendorOptions,
  canManage,
}: {
  equipment: EquipmentRow[];
  vendorOptions: PersonOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => {
              setForm(emptyForm());
              setCreateOpen(true);
            }}
          >
            Add equipment
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Area</TableHead>
            <TableHead>Service vendor</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equipment.map((eq) => (
            <TableRow key={eq.id}>
              <TableCell className="font-medium">
                <Link href={`/maintenance/equipment/${eq.id}`} className="text-primary hover:underline">
                  {eq.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{eq.category ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{eq.area ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{eq.service_vendor_name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={eq.status === "down" ? "destructive" : "success"}>{eq.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {equipment.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No equipment yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add equipment</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await createEquipment({
                  name: form.name,
                  category: form.category || undefined,
                  area: form.area || undefined,
                  model: form.model || undefined,
                  serial: form.serial || undefined,
                  serviceVendorId: form.serviceVendorId === NONE_VALUE ? undefined : form.serviceVendorId,
                  installedOn: form.installedOn || undefined,
                  warrantyExpiresOn: form.warrantyExpiresOn || undefined,
                  photoUrl: form.photoUrl || undefined,
                  notes: form.notes || undefined,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCreateOpen(false);
                router.refresh();
              });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="eq-name">Name</Label>
                <Input id="eq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-category">Category</Label>
                <Input
                  id="eq-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-area">Area</Label>
                <Input id="eq-area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-model">Model</Label>
                <Input id="eq-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-serial">Serial</Label>
                <Input id="eq-serial" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Service vendor</Label>
                <Select value={form.serviceVendorId} onValueChange={(v) => setForm({ ...form, serviceVendorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {vendorOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-installed">Installed on</Label>
                <Input
                  id="eq-installed"
                  type="date"
                  value={form.installedOn}
                  onChange={(e) => setForm({ ...form, installedOn: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eq-warranty">Warranty expires</Label>
                <Input
                  id="eq-warranty"
                  type="date"
                  value={form.warrantyExpiresOn}
                  onChange={(e) => setForm({ ...form, warrantyExpiresOn: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="eq-photo">Photo URL</Label>
                <Input id="eq-photo" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="eq-notes">Notes</Label>
                <Textarea id="eq-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add equipment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
