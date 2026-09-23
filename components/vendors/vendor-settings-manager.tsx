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
import {
  createVendor,
  deleteVendor,
  setVendorActive,
  updateVendor,
} from "@/app/(app)/vendors/actions";
import {
  filterVendors,
  groupVendorsByLetter,
  vendorFilterLabel,
  type VendorRow,
  type VendorStatusFilter,
} from "@/components/vendors/vendor-types";

interface VendorFormState {
  name: string;
  category: string;
  repName: string;
  phone: string;
  email: string;
  accountNumber: string;
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
    website: vendor.website ?? "",
    notes: vendor.notes ?? "",
  };
}

function formPayload(form: VendorFormState) {
  return {
    ...form,
    category: form.category || undefined,
    repName: form.repName || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
    accountNumber: form.accountNumber || undefined,
    website: form.website || undefined,
    notes: form.notes || undefined,
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

export function VendorSettingsManager({ vendors }: { vendors: VendorRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<VendorFormState>(emptyForm());
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null);
  const [editForm, setEditForm] = useState<VendorFormState>(emptyForm());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorStatusFilter>("all");

  const filtered = useMemo(
    () => filterVendors(vendors, query, statusFilter),
    [vendors, query, statusFilter],
  );
  const groups = groupVendorsByLetter(filtered);
  const filterLabel = vendorFilterLabel(statusFilter);

  function startEdit(vendor: VendorRow) {
    setEditingVendor(vendor);
    setEditForm(formFromRow(vendor));
    setError(null);
  }

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
        <button
          type="button"
          aria-label="Add vendor"
          onClick={() => {
            setCreateForm(emptyForm());
            setError(null);
            setCreateOpen(true);
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <ChipRow>
        <FilterChip
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          All
        </FilterChip>
        <FilterChip
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        >
          Active
        </FilterChip>
        <FilterChip
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        >
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
              <p className="px-1 text-[13px] font-bold text-muted-ink">
                {letter}
              </p>
              <SectionCard flush>
                <div className="divide-y divide-line">
                  {group.map((vendor) => (
                    <ListRow
                      key={vendor.id}
                      title={vendor.name}
                      description={vendor.category ?? "No category"}
                      trailing={
                        <StatusBadge
                          tone={vendor.active ? "success" : "neutral"}
                          dot={vendor.active}
                        >
                          {vendor.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      }
                      onClick={() => startEdit(vendor)}
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
                const result = await createVendor(formPayload(createForm));
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

      <Dialog
        open={editingVendor !== null}
        onOpenChange={(open) => !open && setEditingVendor(null)}
      >
        <DialogContent>
          {editingVendor && (
            <>
              <DialogHeader>
                <DialogTitle>Edit vendor</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  startTransition(async () => {
                    const result = await updateVendor({
                      id: editingVendor.id,
                      ...formPayload(editForm),
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEditingVendor(null);
                    router.refresh();
                  });
                }}
              >
                <VendorFormFields form={editForm} onChange={setEditForm} />
                <DialogFooter className="gap-2 sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await setVendorActive({
                            id: editingVendor.id,
                            active: !editingVendor.active,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setEditingVendor(null);
                          router.refresh();
                        });
                      }}
                    >
                      {editingVendor.active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete vendor "${editingVendor.name}"? Use deactivate if this vendor has any history.`,
                          )
                        ) {
                          return;
                        }
                        setError(null);
                        startTransition(async () => {
                          const result = await deleteVendor({
                            id: editingVendor.id,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setEditingVendor(null);
                          router.refresh();
                        });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving..." : "Save changes"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
