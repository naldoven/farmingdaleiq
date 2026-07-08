"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createBroadcast } from "@/app/(app)/team/actions";

/**
 * Leader "post a Broadcast" form (ARCHITECTURE.md "Team Feed": "leader
 * Broadcasts (announcements: rollouts, events, policy updates)"). Only
 * rendered when the page already checked feed.post_broadcast.
 */
export function BroadcastForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createBroadcast({ body });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <Textarea
        required
        rows={3}
        placeholder="Announce a rollout, event, or policy update..."
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <Button type="submit" className="rounded-full" disabled={isPending || !body.trim()}>
        {isPending ? "Posting..." : "Post broadcast"}
      </Button>
    </form>
  );
}
