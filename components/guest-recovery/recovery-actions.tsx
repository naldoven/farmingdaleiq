"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { giveRecovery, resendRecovery, voidRecovery } from "@/app/(app)/guest-recovery/actions";
import type { SendChannel } from "@/app/(app)/guest-recovery/constants";

const BUTTON = "min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink disabled:opacity-50";

/**
 * The buttons on the redeem screen. Given is the big one. Void takes a second
 * tap so a thumb slip does not cancel a guest's food. Resend and the two copy
 * buttons are for when a send failed or the guest lost the message; the copy
 * buttons are also the way to reach a guest while texting is switched off.
 */
export function RecoveryActions({
  id,
  owed,
  canEmail,
  canText,
  link,
  smsText,
}: {
  id: string;
  owed: boolean;
  canEmail: boolean;
  canText: boolean;
  link: string | null;
  smsText: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  function run(task: () => Promise<{ ok: true; data: { message: string } } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setMessage(result.ok ? { ok: true, text: result.data.message } : { ok: false, text: result.error });
      setConfirmVoid(false);
      router.refresh();
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: `${what} copied.` });
    } catch {
      setMessage({ ok: false, text: "Could not copy. Press and hold the link to copy it." });
    }
  }

  const resend = (channel: SendChannel) => run(() => resendRecovery({ id, channels: [channel] }));

  return (
    <div className="space-y-3">
      {owed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => giveRecovery({ id }))}
          className="min-h-14 w-full rounded-lg bg-success px-4 text-lg font-bold text-white disabled:opacity-50"
        >
          Hand over: mark as given
        </button>
      )}

      {owed && (
        <div className="flex flex-wrap gap-2">
          {canEmail && (
            <button type="button" disabled={pending} onClick={() => resend("email")} className={BUTTON}>
              Resend email
            </button>
          )}
          {canText && (
            <button type="button" disabled={pending} onClick={() => resend("sms")} className={BUTTON}>
              Resend text
            </button>
          )}
          {link && (
            <button type="button" onClick={() => copy(link, "Link")} className={BUTTON}>
              Copy link
            </button>
          )}
          {smsText && canText && (
            <button type="button" onClick={() => copy(smsText, "Text message")} className={BUTTON}>
              Copy text message
            </button>
          )}
        </div>
      )}

      {owed &&
        (confirmVoid ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => voidRecovery({ id }))}
              className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Yes, void it
            </button>
            <button type="button" onClick={() => setConfirmVoid(false)} className={BUTTON}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmVoid(true)} className="min-h-11 text-sm font-semibold text-danger">
            Void this recovery
          </button>
        ))}

      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
