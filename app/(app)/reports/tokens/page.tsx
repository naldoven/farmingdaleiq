import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { summarizeRewardClaims, summarizeTokenActivity } from "../logic";
import { fetchRewardReportData, fetchTokenReportData } from "../queries";
import { cell, tableData } from "../table-helpers";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

/**
 * /reports/tokens -- token activity by employee (tokens.manage) and a reward
 * claims summary (rewards.fulfill or rewards.manage). Same
 * summarizeTokenActivity / summarizeRewardClaims the old "Tokens & rewards"
 * tab used; the two sections are gated independently, matching that tab.
 */
export default async function TokensReportPage() {
  await requirePermission("reports.view");
  const [canViewTokens, canViewFulfillClaims, canViewManageClaims] = await Promise.all([
    hasPermission("tokens.manage"),
    hasPermission("rewards.fulfill"),
    hasPermission("rewards.manage"),
  ]);
  const canViewRewards = canViewFulfillClaims || canViewManageClaims;

  const supabase = await createClient();
  const [{ data: profiles }, tokenData, rewardData] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    canViewTokens ? fetchTokenReportData(supabase) : Promise.resolve(null),
    canViewRewards ? fetchRewardReportData(supabase) : Promise.resolve(null),
  ]);
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const tokenActivity = tokenData ? summarizeTokenActivity(tokenData.transactions) : [];
  const rewardClaimSummary = rewardData ? summarizeRewardClaims(rewardData.claims) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold text-ink">Tokens &amp; rewards</h2>
        <p className="text-[13px] text-muted-ink">Token activity by employee and reward claims summary.</p>
      </div>

      {canViewTokens ? (
        <ReportTable
          title="Token activity by employee"
          csvFilename="token-activity.csv"
          emptyMessage="No token activity recorded."
          {...tableData(tokenActivity, (r) => r.userId, [
            { key: "user", header: "Employee", cell: (r) => cell(profileNameById.get(r.userId) ?? "Unknown") },
            { key: "earned", header: "Earned", format: "number", cell: (r) => cell(r.earned) },
            { key: "spent", header: "Spent", format: "number", cell: (r) => cell(r.spent) },
            { key: "net", header: "Net", format: "number", cell: (r) => cell(r.net) },
            { key: "transactionCount", header: "Transactions", format: "number", cell: (r) => cell(r.transactionCount) },
          ])}
        />
      ) : (
        <LockedSection title="Token activity" requires="tokens.manage" />
      )}

      {canViewRewards ? (
        <Card>
          <CardHeader>
            <CardTitle>Reward claims summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <Stat label="Total claims" value={rewardClaimSummary?.totalClaims ?? 0} />
            <Stat label="Pending" value={rewardClaimSummary?.pending ?? 0} />
            <Stat label="Delivered" value={rewardClaimSummary?.delivered ?? 0} />
            <Stat label="Cancelled" value={rewardClaimSummary?.cancelled ?? 0} />
            <Stat label="Delivered cost" value={rewardClaimSummary?.totalCostDelivered ?? 0} />
          </CardContent>
        </Card>
      ) : (
        <LockedSection title="Reward claims summary" requires="rewards.fulfill or rewards.manage" />
      )}
    </div>
  );
}
