import { z } from "zod";

import {
  CHECKLIST_STAGES,
  FULFILLMENT_METHODS,
  HISTORY_PERIODS,
  ORDER_STAGES,
} from "@/app/(app)/catering/logic";

/**
 * Input validation for the Catering server actions
 * (app/(app)/catering/actions.ts). Kept in a plain module (no "use server")
 * so it's unit-testable on its own and importable from client components.
 */

const optionalString = z.string().trim().optional().or(z.literal(""));

export const orderItemInputSchema = z.object({
  menuItemId: z.string().uuid(),
  qty: z.number().int().min(1).max(1000),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const createOrderSchema = z.object({
  guestName: z.string().trim().min(1, "Guest name is required"),
  phone: optionalString,
  email: z.string().trim().email().optional().or(z.literal("")),
  eventDate: z.string().trim().min(1, "Event date is required"),
  eventTime: optionalString,
  headcount: z.number().int().min(0).max(10000).optional(),
  amount: z.number().min(0).max(1_000_000).optional(),
  fulfillment: z.enum(FULFILLMENT_METHODS).optional(),
  deliveryAddress: optionalString,
  paperGoods: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  items: z.array(orderItemInputSchema).default([]),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderDetailsSchema = z.object({
  id: z.string().uuid(),
  guestName: z.string().trim().min(1, "Guest name is required"),
  phone: optionalString,
  email: z.string().trim().email().optional().or(z.literal("")),
  eventDate: z.string().trim().min(1, "Event date is required"),
  eventTime: optionalString,
  headcount: z.number().int().min(0).max(10000).optional(),
  amount: z.number().min(0).max(1_000_000).optional(),
  fulfillment: z.enum(FULFILLMENT_METHODS).optional(),
  deliveryAddress: optionalString,
  paperGoods: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>;

export const orderIdSchema = z.object({ orderId: z.string().uuid() });

export const changeStageSchema = z.object({
  orderId: z.string().uuid(),
  toStage: z.enum(ORDER_STAGES),
});
export type ChangeStageInput = z.infer<typeof changeStageSchema>;

export const addOrderItemSchema = z.object({
  orderId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  qty: z.number().int().min(1).max(1000).default(1),
});
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemQtySchema = z.object({
  id: z.string().uuid(),
  qty: z.number().int().min(1).max(1000),
});
export type UpdateOrderItemQtyInput = z.infer<typeof updateOrderItemQtySchema>;

export const orderItemIdSchema = z.object({ id: z.string().uuid() });

export const addChecklistItemSchema = z.object({
  orderId: z.string().uuid(),
  stage: z.enum(CHECKLIST_STAGES),
  label: z.string().trim().min(1, "Label is required").max(200),
});
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;

export const toggleChecklistItemSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean(),
});
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemSchema>;

export const checklistItemIdSchema = z.object({ id: z.string().uuid() });

export const resolveFollowUpSchema = z.object({
  id: z.string().uuid(),
  outcome: z.string().trim().max(500).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type ResolveFollowUpInput = z.infer<typeof resolveFollowUpSchema>;

const jsonArrayText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : "[]"))
  .refine(
    (v) => {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    },
    { message: "Must be a valid JSON array" },
  );

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: optionalString,
  componentsText: jsonArrayText,
  scalingRulesText: jsonArrayText,
  active: z.boolean().default(true),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;

export const updateMenuItemSchema = menuItemSchema.extend({ id: z.string().uuid() });
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const menuItemIdSchema = z.object({ id: z.string().uuid() });

export const historyPeriodSchema = z.enum(HISTORY_PERIODS);
