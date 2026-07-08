import * as React from "react";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StoreLocationPillProps
  extends React.HTMLAttributes<HTMLDivElement> {
  storeName: string;
  address: string;
}

/**
 * Rounded outline pill that names the current store and its address, led by a
 * pin. Sits in the home header. Truncates the address on narrow screens so the
 * pill never forces the header to wrap.
 */
export function StoreLocationPill({
  storeName,
  address,
  className,
  ...props
}: StoreLocationPillProps) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5",
        className,
      )}
      {...props}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 truncate text-[13px] leading-tight">
        <span className="font-semibold text-ink">{storeName}</span>
        <span className="text-muted-ink"> · {address}</span>
      </span>
    </div>
  );
}
