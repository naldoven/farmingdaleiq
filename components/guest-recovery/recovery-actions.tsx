"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  assignRecovery,
  giveRecovery,
  resendRecovery,
  switchToStandard,
  voidRecovery,
} from "@/app/(app)/guest-recovery/actions";
import type { RecoveryPath, SendChannel } from "@/app/(app)/guest-recovery/constants";
import type { WorkerView } from "@/app/(app)/guest-recovery/types";

const BUTTON = "min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink disabled:opacity-50";

type Result = { ok: true; data: { message: string } } | { ok: false; error: string };

/**
 * The buttons on the redeem screen. The big one hands over (a normal recovery)
 * or marks the reward sent (Spotlight). An expired code asks for a second tap
 * first: it is never refused, because a manager may still honor it, but nobody
 * does it by accident. Void takes a second tap too. Spotlight adds two things:
 * send the guest the normal code when their app account did not come up, and
 * hand the reward to another leader on the overseer's day off. Resend and the
 * copy buttons only exist for a normal recovery, since a Spotlight guest has no
 * link until they are switched.
 */
export function RecoveryActions({
  id,
  owed,
  path,
  expired,
  expiredOn,
  canEmail,
  canText,
  link,
  smsText,
  workers,
  assignedTo,
  canAssign,
}: {
  id: string;
  owed: boolean;
  path: RecoveryPath;
  expired: boolean;
  expiredOn: string;
  canEmail: boolean;
  canText: boolean;
  link: string | null;
  smsText: string | null;
  workers: WorkerView[];
  assignedTo: string | null;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<"void" | "expired" | "switch" | null>(null);
  const [assignee, setAssignee] = useState("");

  const spotlight = path === "spotlight";

  function run(task: () => Promise<Result>) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setMessage(result.ok ? { ok: true, text: result.data.message } : { ok: false, text: result.error });
      setConfirm(null);
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
  const give = () => run(() => giveRecovery({ id }));
  const others = workers.filter((w) => w.id !== assignedTo);

  return (
    <div className="space-y-3">
      {owed &&
        (confirm === "expired" ? (
          <div className="space-y-2 rounded-xl border-2 border-danger bg-danger-soft p-3">
            <p role="alert" className="text-[15px] font-bold text-danger">
              This code expired {expiredOn}. Hand it over anyway?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={give}
                className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Yes, hand over
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={BUTTON}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => (expired ? setConfirm("expired") : give())}
            className="min-h-14 w-full rounded-lg bg-success px-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {spotlight ? "Reward sent: mark as given" : "Hand over: mark as given"}
          </button>
        ))}

      {owed && spotlight && (
        <>
          {confirm === "switch" ? (
            <div className="space-y-2 rounded-xl border border-line bg-card p-3">
              <p className="text-[15px] font-semibold text-ink">
                Send this guest the normal email, text and code? It takes them off the Spotlight list.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => switchToStandard({ id }))}
                  className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Yes, send the code
                </button>
                <button type="button" onClick={() => setConfirm(null)} className={BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm("switch")} className={`${BUTTON} w-full`}>
              App account did not come up? Send them a code instead
            </button>
          )}

          {canAssign && others.length > 0 && (
            <div className="space-y-2 rounded-xl border border-line bg-card p-3">
              <label htmlFor="assignee" className="block text-sm font-semibold text-ink">
                Hand this reward to someone else
              </label>
              <div className="flex gap-2">
                <select
                  id="assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="min-h-11 flex-1 rounded-lg border border-border bg-card px-3 text-base text-ink"
                >
                  <option value="">Pick a leader</option>
                  {others.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !assignee}
                  onClick={() => run(() => assignRecovery({ id, assigneeId: assignee }))}
                  className={BUTTON}
                >
                  Hand over
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {owed && !spotlight && (
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
        (confirm === "void" ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => voidRecovery({ id }))}
              className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Yes, void it
            </button>
            <button type="button" onClick={() => setConfirm(null)} className={BUTTON}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm("void")} className="min-h-11 text-sm font-semibold text-danger">
            Void this recovery
          </button>
        ))}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
