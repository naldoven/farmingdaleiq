"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
 * resolveEarnAmount's "no rule -> award nothing" behavior).
 */
export function EarningRulesAdmin({ rules }: { rules: EarningRuleRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead className="w-40">Tokens</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <EarningRuleRowEditor key={rule.eventKey} rule={rule} />
        ))}
      </TableBody>
    </Table>
  );
}

function EarningRuleRowEditor({ rule }: { rule: EarningRuleRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(rule.amount));
  const [error, setError] = useState<string | null>(null);

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{rule.label}</div>
        <div className="text-xs text-muted-foreground">{rule.eventKey}</div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="secondary"
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
      </TableCell>
    </TableRow>
  );
}
