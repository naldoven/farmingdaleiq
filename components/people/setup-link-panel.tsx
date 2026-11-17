"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const noSubscribe = () => () => {};

/**
 * Shows a fresh setup link once, with Share (the phone's share sheet) and Copy
 * (docs/STAFF-SIGN-IN-PLAN.md, Steps 3 and 4). The link lives only in this
 * component's state: it is never stored, logged, or sent anywhere else.
 * Previews are safe now: the link opens /auth/confirm, which spends nothing
 * until the person taps Continue.
 */
export function SetupLinkPanel({ name, link }: { name: string; link: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // navigator.share exists only in the browser (and not in every desktop
  // browser); reading it during the server render would not match the client.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ ok: true, text: "Link copied." });
    } catch {
      setMessage({ ok: false, text: "Could not copy. Press and hold the link to copy it." });
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "FarmingdaleIQ setup link",
        text: `${name}, tap this link to set your FarmingdaleIQ password.`,
        url: link,
      });
    } catch {
      // Closing the share sheet throws too; nothing to report.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3">
      <p className="text-[15px] font-semibold text-ink">
        Send this only to {name}. It works once.
      </p>
      <p className="break-all rounded-lg bg-card p-2 text-[13px] text-muted-ink select-all">{link}</p>
      <div className="flex gap-2">
        {canShare ? (
          <Button type="button" className="min-h-11 flex-1" onClick={share}>
            Share
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={copy}>
          Copy link
        </Button>
      </div>
      {message ? (
        <p className={`text-[13px] ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p>
      ) : null}
      <p className="text-[13px] text-muted-ink">
        If it expires, tap New setup link on {name}&apos;s profile.
      </p>
    </div>
  );
}
