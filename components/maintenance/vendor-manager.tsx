"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createVendor, setVendorActive, updateVendor } from "@/app/(app)/vendors/actions";
import { DAYS_OF_WEEK } from "@/app/(app)/vendors/validation";

export interface VendorRow {
  id: string;
  name: string;
  category: string | null;
  rep_name: string | null;
  phone: string | null;
  email: string | null;
  account_number: string | null;
  delivery_days: string[] | null;
  website: string | null;
  notes: string | null;
  active: boolean;
}

type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

interface VendorFormState {
  name: string;
  category: string;
  repName: string;
  phone: string;
  email: string;
  accountNumber: string;
  deliveryDays: DayOfWeek[];
  website: string;
  notes: string;
}

function emptyForm(): VendorFormState {
  return {
    name: "",
    category: "",
    repName: "",
    phone: "",
    email: "",
    accountNumber: "",
    deliveryDays: [],
    website: "",
    notes: "",
  };
}

function formFromRow(vendor: VendorRow): VendorFormState {
  return {
    name: vendor.name,
    category: vendor.category ?? "",
    repName: vendor.rep_name ?? "",
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    accountNumber: vendor.account_number ?? "",
    // Trusted cast: delivery_days is only ever written by createVendor/
    // updateVendor below, which validate against DAYS_OF_WEEK via
    // vendorSchema before insert/update.
    deliveryDays: (vendor.delivery_days ?? []) as DayOfWeek[],
    website: vendor.website ?? "",
    notes: vendor.notes ?? "",
  };
}

function VendorFormFields({
  form,
  onChange,
}: {
  form: VendorFormState;
  onChange: (next: VendorFormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="vendor-name">Name</Label>
        <Input
          id="vendor-name"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-category">Category</Label>
        <Input
          id="vendor-category"
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-rep">Rep name</Label>
        <Input
          id="vendor-rep"
          value={form.repName}
          onChange={(e) => onChange({ ...form, repName: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-phone">Phone</Label>
        <Input
          id="vendor-phone"
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-email">Email</Label>
        <Input
          id="vendor-email"
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-account">Account number</Label>
        <Input
          id="vendor-account"
          value={form.accountNumber}
          onChange={(e) => onChange({ ...form, accountNumber: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor-website">Website</Label>
        <Input
          id="vendor-website"
          value={form.website}
          onChange={(e) => onChange({ ...form, website: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Delivery days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((day) => {
            const active = form.deliveryDays.includes(day);
            return (
              <button
                type="button"
                key={day}
                onClick={() =>
                  onChange({
                    ...form,
                    deliveryDays: active
                      ? form.deliveryDays.filter((d) => d !== day)
                      : [...form.deliveryDays, day],
                  })
                }
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="vendor-notes">Notes</Label>
        <Textarea
          id="vendor-notes"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

/** Directory + admin CRUD for vendors (ARCHITECTURE.md "Vendors"). */
export function VendorManager({ vendors, canManage }: { vendors: VendorRow[]; canManage: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<VendorFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VendorFormState>(emptyForm());

  function startEdit(vendor: VendorRow) {
    setEditingId(vendor.id);
    setEditForm(formFromRow(vendor));
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => {
              setCreateForm(emptyForm());
              setCreateOpen(true);
            }}
          >
            Add vendor
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Rep contact</TableHead>
            <TableHead>Delivery days</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell className="font-medium">{vendor.name}</TableCell>
              <TableCell className="text-muted-foreground">{vendor.category ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {[vendor.rep_name, vendor.phone, vendor.email].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {(vendor.delivery_days ?? []).join(", ") || "—"}
              </TableCell>
              <TableCell>
                <Badge variant={vendor.active ? "success" : "outline"}>
                  {vendor.active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(vendor)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await setVendorActive({ id: vendor.id, active: !vendor.active });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      {vendor.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
          {vendors.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                No vendors yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await createVendor({
                  ...createForm,
                  category: createForm.category || undefined,
                  repName: createForm.repName || undefined,
                  phone: createForm.phone || undefined,
                  email: createForm.email || undefined,
                  accountNumber: createForm.accountNumber || undefined,
                  website: createForm.website || undefined,
                  notes: createForm.notes || undefined,
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
            <VendorFormFields form={createForm} onChange={setCreateForm} />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit vendor</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editingId) return;
              setError(null);
              startTransition(async () => {
                const result = await updateVendor({
                  id: editingId,
                  ...editForm,
                  category: editForm.category || undefined,
                  repName: editForm.repName || undefined,
                  phone: editForm.phone || undefined,
                  email: editForm.email || undefined,
                  accountNumber: editForm.accountNumber || undefined,
                  website: editForm.website || undefined,
                  notes: editForm.notes || undefined,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEditingId(null);
                router.refresh();
              });
            }}
          >
            <VendorFormFields form={editForm} onChange={setEditForm} />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
