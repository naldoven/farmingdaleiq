export interface VendorRow {
  id: string;
  name: string;
  category: string | null;
  rep_name: string | null;
  phone: string | null;
  email: string | null;
  account_number: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
}

export type VendorStatusFilter = "all" | "active" | "inactive";

/** "A" for names starting with a letter, "#" for anything else. */
export function groupVendorsByLetter(vendors: VendorRow[]): [string, VendorRow[]][] {
  const groups = new Map<string, VendorRow[]>();
  for (const vendor of vendors) {
    const first = vendor.name.trim().charAt(0).toUpperCase();
    const key = first >= "A" && first <= "Z" ? first : "#";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(vendor);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function filterVendors(
  vendors: VendorRow[],
  query: string,
  statusFilter: VendorStatusFilter,
) {
  const q = query.trim().toLowerCase();
  return vendors.filter((vendor) => {
    if (statusFilter === "active" && !vendor.active) return false;
    if (statusFilter === "inactive" && vendor.active) return false;
    if (!q) return true;
    return (
      vendor.name.toLowerCase().includes(q) ||
      (vendor.category ?? "").toLowerCase().includes(q) ||
      (vendor.rep_name ?? "").toLowerCase().includes(q)
    );
  });
}

export function vendorFilterLabel(statusFilter: VendorStatusFilter) {
  if (statusFilter === "active") return "Active";
  if (statusFilter === "inactive") return "Inactive";
  return "All";
}
