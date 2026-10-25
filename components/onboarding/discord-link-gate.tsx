"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageCircle } from "lucide-react";

import { SectionCard } from "@/components/mobile";
import { cn } from "@/lib/utils";
import {
  linkMyDiscordId,
  sendMyDiscordTestPing,
  skipDiscordLinkForNow,
} from "@/app/(app)/onboarding/discord-link/actions";

/**
 * First-login Discord step (rollout pack, PR 1). app/(app)/layout.tsx renders
 * this INSTEAD of the page content while the signed-in person has no numeric
 * Discord id and has not skipped the step, so it meets them on whatever route
 * they land on after the invite link, with no redirect to get wrong.
 *
 * Two phases on one screen: paste and save the id, then send a test ping. The
 * shell is not refreshed after the save on purpose: a refresh would re-run the
 * layout, which would drop this gate before the person could try the ping.
 * "Done" is what triggers the refresh.
 */
const COPY_ID_STEPS = [
  "Open Discord. Go to User Settings (the gear next to your name).",
  "Open Advanced and turn on Developer Mode.",
  "On a computer: right-click your own name and pick Copy User ID. On a phone: tap your profile picture, then the three dots, then Copy User ID.",
  "Paste the number below. It is a long number, not your username.",
];

const PRIMARY_BUTTON =
  "rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const QUIET_BUTTON =
  "rounded-full px-4 py-2 text-[15px] font-semibold text-muted-ink transition-colors hover:bg-secondary disabled:opacity-50";

export function DiscordLinkGate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [discordUserId, setDiscordUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [ping, setPing] = useState<"idle" | "sent" | "queued" | "repeat">("idle");

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await linkMyDiscordId({ discordUserId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLinked(true);
    });
  };

  const sendPing = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendMyDiscordTestPing();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data.queued) setPing("repeat");
      else setPing(result.data.delivered ? "sent" : "queued");
    });
  };

  const skip = () => {
    setError(null);
    startTransition(async () => {
      const result = await skipDiscordLinkForNow();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <h1 className="sr-only">Link your Discord</h1>
      <SectionCard>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              {linked ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[19px] font-semibold text-ink">
                {linked ? "Discord linked" : "Link your Discord"}
              </p>
              <p className="text-[13px] text-muted-ink">
                {linked
                  ? "Send yourself a test ping to make sure it reaches you."
                  : "Shout-outs, to-dos, and shift alerts reach you in Discord. One-time setup."}
              </p>
            </div>
          </div>

          {!linked && (
            <>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] text-ink">
                {COPY_ID_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold text-muted-ink">Discord user ID</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="123456789012345678"
                    value={discordUserId}
                    onChange={(e) => setDiscordUserId(e.target.value)}
                    className="h-11 rounded-lg border border-line bg-card px-3 text-[15px] text-ink outline-none focus:border-accent"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className={cn(PRIMARY_BUTTON)}
                    disabled={isPending || discordUserId.trim().length === 0}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className={QUIET_BUTTON} disabled={isPending} onClick={skip}>
                    Skip for now
                  </button>
                </div>
              </form>
            </>
          )}

          {linked && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cn(PRIMARY_BUTTON)}
                  disabled={isPending}
                  onClick={sendPing}
                >
                  {isPending ? "Sending..." : "Send me a test ping"}
                </button>
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  disabled={isPending}
                  onClick={() => router.refresh()}
                >
                  Done
                </button>
              </div>
              {ping === "sent" && (
                <p className="text-[13px] text-success">Sent. Check Discord for the ping.</p>
              )}
              {ping === "queued" && (
                <p className="text-[13px] text-muted-ink">
                  Queued. It should land in Discord within a few minutes.
                </p>
              )}
              {ping === "repeat" && (
                <p className="text-[13px] text-muted-ink">
                  A ping is already on its way. Wait a minute before sending another.
                </p>
              )}
              <p className="text-[13px] text-muted-ink">
                No ping? The ID may belong to another account. A manager can fix it on your
                People profile.
              </p>
            </div>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
      </SectionCard>
    </div>
  );
}
