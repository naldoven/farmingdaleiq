"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkInviteList } from "@/app/(app)/people/rollout/actions";
import type { EmailComparison } from "@/app/(app)/people/rollout/logic";

/**
 * Paste-and-compare for the leader email list. The server action compares
 * against existing accounts and returns only what the manager pasted, sorted
 * into matched / missing / invalid. Nothing is stored, and no address goes
 * into a URL: "Invite a person" is a plain link.
 */
export function RolloutEmailCheck() {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailComparison | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setCopied(null);
          startTransition(async () => {
            const response = await checkInviteList({ emails: text });
            if (!response.ok) {
              setResult(null);
              setError(response.error);
              return;
            }
            setResult(response.data);
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rollout-emails">Paste the leader emails, one per line</Label>
          <Textarea
            id="rollout-emails"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={5000}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <div>
          <Button type="submit" disabled={isPending || text.trim() === ""}>
            {isPending ? "Checking..." : "Check"}
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <p className="text-[15px] font-semibold text-ink">
            {result.matched} already {result.matched === 1 ? "has an account" : "have accounts"}
          </p>

          {result.missing.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-muted-ink">
                No account yet ({result.missing.length})
              </p>
              <ul className="flex flex-col gap-1.5">
                {result.missing.map((email) => (
                  <li key={email} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] text-ink">{email}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copy(email)}
                    >
                      {copied === email ? "Copied" : "Copy"}
                    </Button>
                  </li>
                ))}
              </ul>
              <Link href="/people/invite" className="text-[13px] font-semibold text-accent">
                Invite a person
              </Link>
            </div>
          )}

          {result.invalid.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-muted-ink">
                Not an email address ({result.invalid.length})
              </p>
              <ul className="flex flex-col gap-1">
                {result.invalid.map((entry) => (
                  <li key={entry} className="truncate text-[14px] text-danger">
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.missing.length === 0 && result.invalid.length === 0 && (
            <p className="text-[13px] text-muted-ink">Everyone on the list has an account.</p>
          )}
        </div>
      )}
    </div>
  );
}
