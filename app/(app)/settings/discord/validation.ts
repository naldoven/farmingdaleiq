import { z } from "zod";

/**
 * Shared Discord webhook URL validator (FIQ-08). Requires an https Discord
 * incoming-webhook host so the outbox can only ever POST notification content
 * to Discord — never to an internal address (SSRF: 169.254.169.254 /
 * localhost) or an attacker's collector. `z.string().url()` alone permits
 * `http://` and any host, so the explicit https-prefix refinement is what
 * closes it. Factored into one schema so createChannel and updateChannel can
 * never drift apart again.
 */
export const discordWebhookUrl = z
  .string()
  .trim()
  .url("Enter a valid webhook URL")
  .refine(
    (v) =>
      v.startsWith("https://discord.com/api/webhooks/") ||
      v.startsWith("https://discordapp.com/api/webhooks/"),
    { message: "Must be a Discord incoming webhook URL" },
  );

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  webhookUrl: discordWebhookUrl,
  purpose: z.string().trim().max(120).optional().or(z.literal("")),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(80).optional(),
  purpose: z.string().trim().max(120).optional().or(z.literal("")),
  active: z.boolean().optional(),
  /** Optional: replaces the stored webhook URL. Never round-tripped back to the client. */
  webhookUrl: discordWebhookUrl.optional().or(z.literal("")),
});

export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const deleteChannelSchema = z.object({
  id: z.string().uuid(),
});

export type DeleteChannelInput = z.infer<typeof deleteChannelSchema>;

export const setEventRouteSchema = z.object({
  eventKey: z.string().trim().min(1),
  channelId: z.string().uuid().nullable(),
  enabled: z.boolean(),
});

export type SetEventRouteInput = z.infer<typeof setEventRouteSchema>;

export const sendTestMessageSchema = z.object({
  channelId: z.string().uuid(),
});

export type SendTestMessageInput = z.infer<typeof sendTestMessageSchema>;
