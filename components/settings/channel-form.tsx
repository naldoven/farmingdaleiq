"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createChannel } from "@/app/(app)/settings/discord/actions";

/** Registers a new Discord channel webhook. */
export function ChannelForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b border-border pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createChannel({ name, webhookUrl, purpose });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setWebhookUrl("");
          setPurpose("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label="Channel name"
          placeholder="Channel name (e.g. Leaders)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label="Webhook URL"
          placeholder="https://discord.com/api/webhooks/..."
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="min-w-[280px]"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label="Purpose"
          placeholder="Purpose (optional)"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding..." : "Add channel"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
