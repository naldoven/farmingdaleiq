"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ListRow, SearchBar, SectionCard, StatusBadge } from "@/components/mobile";
import { ORDER_STAGE_LABELS } from "@/app/(app)/catering/logic";
import type { OrderSearchResult } from "@/app/(app)/catering/action-types";
import { searchCateringOrders } from "@/app/(app)/catering/actions";

const DEBOUNCE_MS = 300;

/**
 * Order search on the /catering home screen: type a guest name, phone number,
 * or event date, tap a result, land on the order. The server action does the
 * matching (and re-checks catering.view); this component only debounces,
 * calls it, and drops any response that is no longer the latest request.
 */
export function OrderSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrderSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Bumped on every keystroke so an older, slower response cannot overwrite a
  // newer one.
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++requestId.current;
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchCateringOrders({ query: trimmed });
        if (id !== requestId.current) return;
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setResults(null);
          setError(result.error);
        }
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const handleChange = (value: string) => {
    setQuery(value);
    // Clear here, not in the effect: results from a shorter query must not
    // flash back when the box grows to 2 characters again.
    if (value.trim().length < 2) {
      setResults(null);
      setError(null);
    }
  };

  const typed = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-3">
      <SearchBar
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Search by guest, phone, or event date"
        label="Search catering orders"
        autoComplete="off"
      />

      {typed && error && (
        <p role="alert" className="px-1 text-[13px] text-danger">
          {error}
        </p>
      )}
      {typed && !error && isPending && (
        <p className="px-1 text-[13px] text-muted-ink">Searching...</p>
      )}
      {typed && !error && !isPending && results && results.length === 0 && (
        <p className="px-1 text-[13px] text-muted-ink">No orders match.</p>
      )}
      {typed && !error && results && results.length > 0 && (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {results.map((order) => (
              <ListRow
                key={order.id}
                href={`/catering/orders/${order.id}`}
                title={order.guestName}
                description={`${order.eventDate}${order.eventTime ? ` · ${order.eventTime.slice(0, 5)}` : ""}${order.headcount != null ? ` · ${order.headcount} guests` : ""}`}
                trailing={
                  <StatusBadge
                    tone={order.stage === "closed" ? "success" : order.stage === "cancelled" ? "danger" : "neutral"}
                  >
                    {ORDER_STAGE_LABELS[order.stage]}
                  </StatusBadge>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
