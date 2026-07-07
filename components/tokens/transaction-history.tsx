import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
 * just the raw deltas.
 */
export function TransactionHistory({ rows }: { rows: TransactionHistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No token activity yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Note</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{transactionKindLabel(row.kind)}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{row.note ?? "—"}</TableCell>
            <TableCell className={`text-right font-medium ${row.delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {row.delta >= 0 ? `+${row.delta}` : row.delta}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
