"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
  ChipRow,
  FilterChip,
  ListRow,
  SearchBar,
  SectionCard,
  StatusBadge,
} from "@/components/mobile";
import { createVendor, setVendorActive, updateVendor } from "@/app/(app)/vendors/actions";
import { DAYS_OF_WEEK } from "@/app/(app)/vendors/constants";

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
type StatusFilter = "all" | "active" | "inactive";

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

/** "A" for names starting with a letter, "#" for anything else (numbers etc). */
function groupByLetter(vendors: VendorRow[]): [string, VendorRow[]][] {
  const groups = new Map<string, VendorRow[]>();
  for (const vendor of vendors) {
    const first = vendor.name.trim().charAt(0).toUpperCase();
    const key = first >= "A" && first <= "Z" ? first : "#";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(vendor);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
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
              <FilterChip
                key={day}
                type="button"
                active={active}
                onClick={() =>
                  onChange({
                    ...form,
                    deliveryDays: active
                      ? form.deliveryDays.filter((d) => d !== day)
                      : [...form.deliveryDays, day],
                  })
                }
              >
                {day}
              </FilterChip>
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

/**
 * Directory + admin CRUD for vendors (ARCHITECTURE.md "Vendors"). Restyled to
 * the KitchenIQ mobile list pattern: SearchBar + status FilterChips + an
 * alphabetically-sectioned list of ListRows, with a round accent "+" for
 * canManage holders to add a vendor. Tapping a row opens the same edit dialog
 * the old table's "Edit" button opened; a "Deactivate/Reactivate" control
 * moved into that dialog's footer since the row itself no longer has a
 * per-item action column.
 */
export function VendorManager({ vendors, canManage }: { vendors: VendorRow[]; canManage: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<VendorFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VendorFormState>(emptyForm());
  const [editingActive, setEditingActive] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  function startEdit(vendor: VendorRow) {
    setEditingId(vendor.id);
    setEditForm(formFromRow(vendor));
    setEditingActive(vendor.active);
    setError(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      if (statusFilter === "active" && !vendor.active) return false;
      if (statusFilter === "inactive" && vendor.active) return false;
      if (!q) return true;
      return (
        vendor.name.toLowerCase().includes(q) ||
        (vendor.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [vendors, query, statusFilter]);

  const groups = groupByLetter(filtered);
  const filterLabel =
    statusFilter === "active" ? "Active" : statusFilter === "inactive" ? "Inactive" : "All";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SearchBar
          label="Search vendors"
          placeholder="Search vendors"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          containerClassName="flex-1"
        />
        {canManage && (
          <button
            type="button"
            aria-label="Add vendor"
            onClick={() => {
              setCreateForm(emptyForm());
              setCreateOpen(true);
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ChipRow>
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
          Active
        </FilterChip>
        <FilterChip active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")}>
          Inactive
        </FilterChip>
      </ChipRow>

      <p className="px-1 text-[13px] font-semibold text-muted-ink">
        {filterLabel} ({filtered.length})
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.length === 0 ? (
        <p className="px-1 text-[13px] text-muted-ink">No vendors match.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([letter, group]) => (
            <div key={letter} className="flex flex-col gap-1.5">
              <p className="px-1 text-[13px] font-bold text-muted-ink">{letter}</p>
              <SectionCard flush>
                <div className="divide-y divide-line">
                  {group.map((vendor) => (
                    <ListRow
                      key={vendor.id}
                      title={vendor.name}
                      description={vendor.category ?? "No category"}
                      trailing={
                        <StatusBadge tone={vendor.active ? "success" : "neutral"} dot={vendor.active}>
                          {vendor.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      }
                      onClick={canManage ? () => startEdit(vendor) : undefined}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
      )}

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
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  if (!editingId) return;
                  startTransition(async () => {
                    const result = await setVendorActive({ id: editingId, active: !editingActive });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEditingActive((prev) => !prev);
                    router.refresh();
                  });
                }}
              >
                {editingActive ? "Deactivate" : "Reactivate"}
              </Button>
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
