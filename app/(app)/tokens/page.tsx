import { redirect } from "next/navigation";
import { Coins } from "lucide-react";

import { SectionCard, SectionLabel } from "@/components/mobile";
import { EarningRulesAdmin, type EarningRuleRow } from "@/components/tokens/earning-rules-admin";
import { GiftForm } from "@/components/tokens/gift-form";
import { TransactionHistory } from "@/components/tokens/transaction-history";
import { AdjustTokensForm } from "@/app/(app)/tokens/adjust-tokens-form";
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
 * "Token integrity"). Restyled to the KitchenIQ mobile design system
 * (docs/DESIGN-SYSTEM.md) -- data, actions, and permission checks unchanged.
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

  const [{ data: profiles }, earningRulesResult, adjustRecipientsResult] = await Promise.all([
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
    // Adjust can correct anyone's balance, including the admin's own, so this
    // list is not self-filtered the way gifting is.
    canManage
      ? supabase.from("profiles").select("id, name").eq("active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
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
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {/* Balance hero: gold coin + big number, the KitchenIQ Tokens card. */}
      <section className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-card">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Coins className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] text-muted-ink">Your balance</p>
          <p className="text-[34px] font-bold leading-tight tabular-nums text-ink">
            {balance} <span className="text-[15px] font-semibold text-muted-ink">tokens</span>
          </p>
        </div>
      </section>

      {canGift && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Send</SectionLabel>
          <SectionCard>
            <GiftForm recipients={profiles ?? []} balance={balance} />
          </SectionCard>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionLabel>History</SectionLabel>
        <SectionCard flush>
          <TransactionHistory
            rows={(transactions ?? []).map((t) => ({
              id: t.id,
              delta: t.delta,
              kind: t.kind,
              note: t.note,
              createdAt: t.created_at,
            }))}
          />
        </SectionCard>
      </section>

      {canManage && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Earning rules</SectionLabel>
          <SectionCard flush>
            <EarningRulesAdmin rules={earningRules} />
          </SectionCard>
        </section>
      )}

      {canManage && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Manual adjustment</SectionLabel>
          <SectionCard>
            <p className="mb-3 text-[13px] text-muted-ink">
              Correct an employee&apos;s balance. Recorded in the ledger.
            </p>
            <AdjustTokensForm recipients={adjustRecipientsResult.data ?? []} />
          </SectionCard>
        </section>
      )}
    </div>
  );
}
