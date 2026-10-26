"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setDeliveryPlatform } from "@/app/(app)/catering/drivers/actions";
import {
  DELIVERY_PLATFORMS,
  DELIVERY_PLATFORM_LABELS,
  type DeliveryPlatform,
} from "@/app/(app)/catering/drivers/logic";
import { cn } from "@/lib/utils";

/**
 * Roadway / ezCater switch for one delivery order. Every order starts as
 * Roadway; ezCater orders are re-keyed into CFA online and look the same on
 * arrival, so whoever re-keys one flips it here. catering.manage-gated
 * server-side (setDeliveryPlatform); `canEdit` only decides whether this
 * renders as buttons or as a label.
 */
export function DeliveryPlatformToggle({
  orderId,
  platform,
  canEdit,
}: {
  orderId: string;
  platform: DeliveryPlatform;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(platform);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <span className="text-[13px] font-semibold text-ink">{DELIVERY_PLATFORM_LABELS[platform]}</span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label="Order source" className="flex gap-2">
        {DELIVERY_PLATFORMS.map((option) => {
          const selected = current === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => {
                if (selected) return;
                const previous = current;
                setCurrent(option);
                setError(null);
                startTransition(async () => {
                  const result = await setDeliveryPlatform({ orderId, platform: option });
                  if (!result.ok) {
                    setCurrent(previous);
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className={cn(
                "min-h-11 flex-1 rounded-lg border-2 px-3 text-[14px] font-semibold transition-colors",
                selected
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-card text-muted-ink hover:text-ink",
              )}
            >
              {DELIVERY_PLATFORM_LABELS[option]}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
