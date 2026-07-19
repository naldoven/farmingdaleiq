"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adjustTokens } from "@/app/(app)/tokens/actions";

export interface AdjustRecipientOption {
  id: string;
  name: string;
}

/**
 * Admin manual balance correction (the sanctioned `adjust` path). Only
 * rendered when the page already checked tokens.manage; the adjust_tokens()
 * SQL function re-checks it server-side. A signed delta (positive credits,
 * negative debits) keeps the append-only ledger the single source of truth --
 * no balance is ever stored or overwritten.
 */
export function AdjustTokensForm({ recipients }: { recipients: AdjustRecipientOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // S3: default to no one picked. Defaulting to the first employee (often the
  // owner account, which sorts first) meant a rushed submit adjusted the wrong
  // person's balance. Empty forces an explicit choice; the guard below and the
  // adjust_tokens() server path both reject an empty user id. Mirrors the
  // fixed gift-form picker.
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const deltaNumber = Number(delta);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!userId) {
          setError("Pick an employee first.");
          return;
        }
        if (!Number.isInteger(deltaNumber) || deltaNumber === 0) {
          setError("Enter a non-zero whole number.");
          return;
        }
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await adjustTokens({ userId, delta: deltaNumber, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDelta("");
          setNote("");
          setMessage(`New balance: ${result.data.balanceAfter}.`);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="adjust-user">
          Employee
        </label>
        <Select value={userId} onValueChange={setUserId} disabled={recipients.length === 0}>
          <SelectTrigger id="adjust-user">
            <SelectValue placeholder="Pick an employee" />
          </SelectTrigger>
          <SelectContent>
            {recipients.map((recipient) => (
              <SelectItem key={recipient.id} value={recipient.id}>
                {recipient.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="adjust-delta">
          Adjustment (use a minus sign to remove tokens)
        </label>
        <Input
          id="adjust-delta"
          type="number"
          step="1"
          inputMode="numeric"
          required
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="adjust-note">
          Reason (optional)
        </label>
        <Textarea id="adjust-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}
      {message && <p className="text-[13px] text-muted-ink">{message}</p>}

      <Button type="submit" className="rounded-full" disabled={isPending || !userId}>
        {isPending ? "Applying..." : "Apply adjustment"}
      </Button>
    </form>
  );
}
