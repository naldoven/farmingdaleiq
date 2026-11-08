import { z } from "zod";

import { CAR_SIZES, DELIVERY_PLATFORMS, MAX_DRIVERS_PER_ORDER } from "@/app/(app)/catering/drivers/logic";
import { DISCORD_USER_ID_PATTERN } from "@/lib/discord/user-id";

/**
 * Input validation for the driver reservation actions
 * (app/(app)/catering/drivers/actions.ts). A plain module (no "use server")
 * so it is unit-testable and importable from client components.
 */

/** The picked set for an order; an empty list clears the reservation. */
export const setOrderDriversSchema = z.object({
  orderId: z.string().uuid(),
  profileIds: z
    .array(z.string().uuid())
    .max(MAX_DRIVERS_PER_ORDER, `Pick at most ${MAX_DRIVERS_PER_ORDER} drivers.`)
    .refine((ids) => new Set(ids).size === ids.length, "Pick each driver once."),
});
export type SetOrderDriversInput = z.infer<typeof setOrderDriversSchema>;

export const setDeliveryPlatformSchema = z.object({
  orderId: z.string().uuid(),
  platform: z.enum(DELIVERY_PLATFORMS),
});
export type SetDeliveryPlatformInput = z.infer<typeof setDeliveryPlatformSchema>;

export const saveDriverSchema = z.object({
  profileId: z.string().uuid(),
  carSize: z.enum(CAR_SIZES),
  hasRoadwayApp: z.boolean(),
  hasEzcaterApp: z.boolean(),
  active: z.boolean(),
});
export type SaveDriverInput = z.infer<typeof saveDriverSchema>;

/** null clears the contact; escalations then reach Discord only. */
export const escalationContactSchema = z.object({ profileId: z.string().uuid().nullable() });
export type EscalationContactInput = z.infer<typeof escalationContactSchema>;

/**
 * The Discord role escalations tag (the directors). Blank clears it, and the
 * post then goes out without a tag. Same shape check as a Discord user id,
 * because a malformed <@&id> makes Discord reject the whole message.
 */
export const directorsRoleSchema = z.object({
  roleId: z
    .string()
    .trim()
    .regex(DISCORD_USER_ID_PATTERN, "A Discord role ID is a long number, 17 to 20 digits.")
    .nullable(),
});
export type DirectorsRoleInput = z.infer<typeof directorsRoleSchema>;

export const DRIVER_VIEWS = ["today", "tomorrow", "week", "roster"] as const;
export type DriverView = (typeof DRIVER_VIEWS)[number];

/** The Drivers page tab from its ?view= param; anything unknown is Today. */
export function parseDriverView(value: unknown): DriverView {
  const parsed = z.enum(DRIVER_VIEWS).safeParse(value);
  return parsed.success ? parsed.data : "today";
}
