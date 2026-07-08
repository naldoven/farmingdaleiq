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
import { sendGift } from "@/app/(app)/tokens/actions";
import { canAffordGift } from "@/app/(app)/tokens/logic";

export interface GiftRecipientOption {
  id: string;
  name: string;
}

/**
 * Peer-to-peer token gifting (ARCHITECTURE.md "Tokens & Rewards": "Anyone
 * can gift their own tokens to a coworker (capped by their balance)"). The
 * balance cap shown here is advisory -- the real enforcement is the
 * gift_tokens() SQL function called by sendGift(), which re-checks the
 * balance atomically.
 */
export function GiftForm({
  recipients,
  balance,
}: {
  recipients: GiftRecipientOption[];
  balance: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toUserId, setToUserId] = useState(recipients[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!toUserId) {
          setError("Pick a coworker first.");
          return;
        }
        if (!canAffordGift(balance, amountNumber)) {
          setError(`You only have ${balance} tokens to send.`);
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await sendGift({ toUserId, amount: amountNumber, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setAmount("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="gift-recipient">
          Send to
        </label>
        <Select value={toUserId} onValueChange={setToUserId} disabled={recipients.length === 0}>
          <SelectTrigger id="gift-recipient">
            <SelectValue placeholder="Pick a coworker" />
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
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="gift-amount">
          Amount (you have {balance})
        </label>
        <Input
          id="gift-amount"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-muted-ink" htmlFor="gift-note">
          Note (optional)
        </label>
        <Textarea id="gift-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <Button type="submit" className="rounded-full" disabled={isPending || !toUserId}>
        {isPending ? "Sending..." : "Send tokens"}
      </Button>
    </form>
  );
}
