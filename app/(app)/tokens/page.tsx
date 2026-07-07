import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EarningRulesAdmin, type EarningRuleRow } from "@/components/tokens/earning-rules-admin";
import { GiftForm } from "@/components/tokens/gift-form";
import { TransactionHistory } from "@/components/tokens/transaction-history";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getBalance, getRecentTransactions } from "@/lib/tokens/ledger";

const EARNING_RULE_LABELS: Record<string, string> = {
  task_complete: "Task completed",
  checklist_complete: "Checklist completed",
  top_performer: "Shift Top Performer",
};

const DEFAULT_EARNING_RULE_KEYS = Object.keys(EARNING_RULE_LABELS);

/**
 * /tokens: balance, ledger history, send tokens (ARCHITECTURE.md page map).
 * Balance and history are always the sum of / a read of token_transactions
 * -- never a stored column (ARCHITECTURE.md "Technical architecture":
 * "Token integrity").
 */
export default async function TokensPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [balance, transactions, canGift, canManage] = await Promise.all([
    getBalance(user.id, supabase),
    getRecentTransactions(user.id, 25, supabase),
    hasPermission("tokens.gift"),
    hasPermission("tokens.manage"),
  ]);

  const [{ data: profiles }, earningRulesResult] = await Promise.all([
    canGift
      ? supabase
          .from("profiles")
          .select("id, name")
          .eq("active", true)
          .neq("id", user.id)
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    canManage
      ? supabase.from("token_earning_rules").select("event_key, amount")
      : Promise.resolve({ data: [] as { event_key: string; amount: number }[] }),
  ]);

  const ruleAmountByKey = new Map((earningRulesResult.data ?? []).map((r) => [r.event_key, r.amount]));
  const earningRules: EarningRuleRow[] = canManage
    ? Array.from(
        new Set([...DEFAULT_EARNING_RULE_KEYS, ...ruleAmountByKey.keys()])
      ).map((eventKey) => ({
        eventKey,
        amount: ruleAmountByKey.get(eventKey) ?? 0,
        label: EARNING_RULE_LABELS[eventKey] ?? eventKey,
      }))
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Tokens</h1>
        <p className="text-sm text-muted-foreground">Your balance, history, and gifting.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Your balance</CardDescription>
          <CardTitle className="text-4xl">{balance}</CardTitle>
        </CardHeader>
      </Card>

      {canGift && (
        <Card>
          <CardHeader>
            <CardTitle>Send tokens</CardTitle>
            <CardDescription>Gift your own tokens to a coworker.</CardDescription>
          </CardHeader>
          <CardContent>
            <GiftForm recipients={profiles ?? []} balance={balance} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Your most recent token activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionHistory
            rows={(transactions ?? []).map((t) => ({
              id: t.id,
              delta: t.delta,
              kind: t.kind,
              note: t.note,
              createdAt: t.created_at,
            }))}
          />
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Earning rules</CardTitle>
            <CardDescription>How many tokens each event is worth.</CardDescription>
          </CardHeader>
          <CardContent>
            <EarningRulesAdmin rules={earningRules} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
