import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ListRow } from "@/components/mobile";
import { transactionKindLabel } from "@/app/(app)/tokens/logic";

export interface TransactionHistoryRow {
  id: string;
  delta: number;
  kind: string;
  note: string | null;
  createdAt: string;
}

/**
 * Ledger history for the signed-in user (ARCHITECTURE.md "/tokens":
 * "Balance, history, send tokens"). Read-only render of the rows
 * app/(app)/tokens/page.tsx already fetched via
 * lib/tokens/ledger.ts getRecentTransactions() -- never a stored balance,
 * just the raw deltas. Styled as a KitchenIQ ledger list: each row is a
 * ListRow with the +/- amount as the trailing content.
 */
export function TransactionHistory({ rows }: { rows: TransactionHistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-[15px] text-muted-ink">No token activity yet.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {rows.map((row) => {
        const isCredit = row.delta >= 0;
        return (
          <ListRow
            key={row.id}
            icon={isCredit ? ArrowUpRight : ArrowDownRight}
            iconTone={isCredit ? "success" : "danger"}
            title={transactionKindLabel(row.kind)}
            description={
              row.note ? `${new Date(row.createdAt).toLocaleString()} · ${row.note}` : new Date(row.createdAt).toLocaleString()
            }
            trailing={
              <span className={`text-[15px] font-bold tabular-nums ${isCredit ? "text-success" : "text-danger"}`}>
                {isCredit ? `+${row.delta}` : row.delta}
              </span>
            }
          />
        );
      })}
    </div>
  );
}
