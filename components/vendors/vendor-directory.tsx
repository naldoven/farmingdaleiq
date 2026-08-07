"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Copy,
  ExternalLink,
  Hash,
  Mail,
  MessageSquare,
  Phone,
  Settings,
  StickyNote,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChipRow,
  FilterChip,
  ListRow,
  SearchBar,
  SectionCard,
  StatusBadge,
} from "@/components/mobile";
import {
  filterVendors,
  groupVendorsByLetter,
  vendorFilterLabel,
  type VendorRow,
  type VendorStatusFilter,
} from "@/components/vendors/vendor-types";

function contactDescription(vendor: VendorRow) {
  const parts = [vendor.category, vendor.rep_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "No category";
}

function normalizedPhoneHref(prefix: "tel" | "sms", phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized ? `${prefix}:${normalized}` : `${prefix}:${phone}`;
}

function websiteHref(website: string) {
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="flex gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-ink">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-muted-ink">
          {label}
        </span>
        <span className="block break-words text-[15px] font-semibold text-ink">
          {value}
        </span>
      </span>
    </div>
  );
}

export function VendorDirectory({ vendors }: { vendors: VendorRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorStatusFilter>("all");
  const [selectedVendor, setSelectedVendor] = useState<VendorRow | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterVendors(vendors, query, statusFilter),
    [vendors, query, statusFilter],
  );
  const groups = groupVendorsByLetter(filtered);
  const filterLabel = vendorFilterLabel(statusFilter);
  const selectedPhone = selectedVendor?.phone?.trim() || null;
  const selectedEmail = selectedVendor?.email?.trim() || null;
  const selectedWebsite = selectedVendor?.website?.trim() || null;

  async function copyEmail(email: string) {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus("Email copied");
    } catch {
      setCopyStatus("Could not copy email");
    }
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
        <Button
          asChild
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          aria-label="Vendor settings"
        >
          <a href="/vendors-settings">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </a>
        </Button>
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
                      description={contactDescription(vendor)}
                      trailing={
                        <StatusBadge
                          tone={vendor.active ? "success" : "neutral"}
                          dot={vendor.active}
                        >
                          {vendor.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      }
                      onClick={() => {
                        setSelectedVendor(vendor);
                        setCopyStatus(null);
                      }}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={selectedVendor !== null}
        onOpenChange={(open) => !open && setSelectedVendor(null)}
      >
        <DialogContent>
          {selectedVendor && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedVendor.name}</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {selectedPhone && (
                    <>
                      <Button asChild className="flex-1">
                        <a href={normalizedPhoneHref("tel", selectedPhone)}>
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          Call
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="flex-1">
                        <a href={normalizedPhoneHref("sms", selectedPhone)}>
                          <MessageSquare
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Text
                        </a>
                      </Button>
                    </>
                  )}
                  {selectedEmail && (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyEmail(selectedEmail)}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy email
                    </Button>
                  )}
                  {selectedWebsite && (
                    <Button asChild variant="outline" className="flex-1">
                      <a
                        href={websiteHref(selectedWebsite)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        Website
                      </a>
                    </Button>
                  )}
                </div>

                {copyStatus && (
                  <p className="text-[13px] font-semibold text-muted-ink">
                    {copyStatus}
                  </p>
                )}

                <SectionCard>
                  <div className="flex flex-col gap-4">
                    <DetailRow
                      icon={Building2}
                      label="Category"
                      value={selectedVendor.category}
                    />
                    <DetailRow
                      icon={UserRound}
                      label="Rep"
                      value={selectedVendor.rep_name}
                    />
                    <DetailRow
                      icon={Phone}
                      label="Phone"
                      value={selectedVendor.phone}
                    />
                    <DetailRow
                      icon={Mail}
                      label="Email"
                      value={selectedVendor.email}
                    />
                    <DetailRow
                      icon={Hash}
                      label="Account number"
                      value={selectedVendor.account_number}
                    />
                    <DetailRow
                      icon={StickyNote}
                      label="Notes"
                      value={selectedVendor.notes}
                    />
                  </div>
                </SectionCard>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
