"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateEarningRule } from "@/app/(app)/tokens/actions";

export interface EarningRuleRow {
  eventKey: string;
  amount: number;
  label: string;
}

/**
 * tokens.manage admin panel for token_earning_rules (ARCHITECTURE.md
 * "/settings": "earning rules" -- kept here on /tokens instead since
 * token_earning_rules is owned by this stream and /settings' routes/dirs
 * are owned by S10, per docs/agent-map.md). Always shows the three event
 * keys the consumer (app/api/cron/tokens/route.ts) reacts to today, even if
 * a row doesn't exist yet in the table (defaults to 0, matching
 * resolveEarnAmount's "no rule -> award nothing" behavior). Styled as a
 * KitchenIQ list card -- each row is title + event key over an inline
 * amount input and Save button.
 */
export function EarningRulesAdmin({ rules }: { rules: EarningRuleRow[] }) {
  return (
    <div className="divide-y divide-line">
      {rules.map((rule) => (
        <EarningRuleRowEditor key={rule.eventKey} rule={rule} />
      ))}
    </div>
  );
}

function EarningRuleRowEditor({ rule }: { rule: EarningRuleRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(rule.amount));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{rule.label}</p>
        <p className="truncate text-[13px] text-muted-ink">{rule.eventKey}</p>
        {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      </div>
      <Input
        type="number"
        min="0"
        step="1"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="w-20 shrink-0 text-center"
      />
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 rounded-full"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await updateEarningRule({ eventKey: rule.eventKey, amount: Number(amount) });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
