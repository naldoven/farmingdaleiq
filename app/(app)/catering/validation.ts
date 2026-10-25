import { z } from "zod";

import {
  BULK_CLOSE_MAX_ORDERS,
  CHECKLIST_STAGES,
  FULFILLMENT_METHODS,
  HISTORY_PERIODS,
  ORDER_STAGES,
  RESTORE_STAGES,
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

/**
 * Ties delivery_address to fulfillment=delivery (parity audit Catering
 * finding: "Delivery orders don't require a delivery address"). Applied via
 * .superRefine below to both create and update so a delivery order can never
 * be saved without somewhere to deliver it.
 */
function requireDeliveryAddress(
  data: { fulfillment?: "pickup" | "delivery"; deliveryAddress?: string },
  ctx: z.RefinementCtx,
) {
  if (data.fulfillment === "delivery" && !data.deliveryAddress?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Delivery address is required for delivery orders",
      path: ["deliveryAddress"],
    });
  }
}

export const createOrderSchema = z
  .object({
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
  })
  .superRefine(requireDeliveryAddress);
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderDetailsSchema = z
  .object({
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
  })
  .superRefine(requireDeliveryAddress);
export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>;

export const orderIdSchema = z.object({ orderId: z.string().uuid() });

export const changeStageSchema = z.object({
  orderId: z.string().uuid(),
  toStage: z.enum(ORDER_STAGES),
});
export type ChangeStageInput = z.infer<typeof changeStageSchema>;

// CAT1: cancelling an order is a dedicated action (not a stage-dropdown move),
// so it only needs the order id — the target stage is always `cancelled`.
export const cancelOrderSchema = z.object({
  orderId: z.string().uuid(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// Manager overrides are logged to the catering channel, so the reason has to
// say something. Three characters rules out a stray tap or a single letter.
const overrideReasonSchema = z
  .string()
  .trim()
  .min(3, "Add a short reason.")
  .max(300, "Keep the reason under 300 characters.");

// `fromStage` is the stage the manager was looking at. The action
// compare-and-sets on it, so a double tap moves the order back one step, not
// two.
export const moveOrderBackSchema = z.object({
  orderId: z.string().uuid(),
  fromStage: z.enum(ORDER_STAGES),
  reason: overrideReasonSchema,
});
export type MoveOrderBackInput = z.infer<typeof moveOrderBackSchema>;

export const restoreOrderSchema = z.object({
  orderId: z.string().uuid(),
  toStage: z.enum(RESTORE_STAGES, { error: "Pick a stage to restore to." }),
  reason: overrideReasonSchema,
});
export type RestoreOrderInput = z.infer<typeof restoreOrderSchema>;

// Bulk close of stale orders (manager override). The reason is shared by the
// whole batch and lands on every order's audit event. The cap (200) bounds one
// database call at a month or two of neglect; the screen can be used twice.
// The stale-orders page loads the same number, so "Select all" always fits.
export const bulkCloseStaleOrdersSchema = z.object({
  orderIds: z
    .array(z.string().uuid())
    .min(1, "Pick at least one order.")
    .max(BULK_CLOSE_MAX_ORDERS, `Close at most ${BULK_CLOSE_MAX_ORDERS} orders at a time.`),
  reason: overrideReasonSchema,
});
export type BulkCloseStaleOrdersInput = z.infer<typeof bulkCloseStaleOrdersSchema>;

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

/**
 * Server-side row checks for a menu item's `components` and `scaling_rules`
 * (docs/STORE-SETUP.md, area "catering_menu"). The row editor
 * (components/catering/menu-item-form.tsx) checks the same rules in the
 * browser, but a browser check is a courtesy: the action is a public
 * endpoint and used to store any JSON list, which the readers in logic.ts
 * (parseComponents, parseScalingRules) then quietly repaired at read time
 * (a bad quantity became 1, a bad amount became 0). Bad input is now
 * refused here with a plain message instead of being repaired.
 *
 * The saved shape is unchanged: components are `{ name, qty }` and rules are
 * `{ label, perHeadcount, perQty }`. A missing `qty` is 1 and a missing
 * amount is 0 (the defaults logic.ts documents); a value that is present
 * but wrong is an error. Names are trimmed. Unknown fields are refused so
 * nothing is dropped without a word.
 */
const MAX_ROWS = 50;
const MAX_AMOUNT = 10_000;

/** Object-level message: a wrong type gets `fallback`, an extra field says so. */
const rowObjectError = (fallback: string) => (issue: { code: string }) =>
  issue.code === "unrecognized_keys" ? "has a field this form does not use" : fallback;

const componentRowSchema = z.strictObject(
  {
    name: z
      .string({ error: "name is required" })
      .trim()
      .min(1, "name is required")
      .max(200, "name is too long (200 characters at most)"),
    qty: z
      .number({ error: "quantity must be a number" })
      .min(1, "quantity must be at least 1")
      .max(MAX_AMOUNT, `quantity can't be more than ${MAX_AMOUNT}`)
      .default(1),
  },
  { error: rowObjectError("each component needs a name and a quantity") },
);

const scalingAmount = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} can't be negative`)
    .max(MAX_AMOUNT, `${label} can't be more than ${MAX_AMOUNT}`)
    .default(0);

const scalingRuleRowSchema = z
  .strictObject(
    {
      label: z
        .string({ error: "supply name is required" })
        .trim()
        .min(1, "supply name is required")
        .max(200, "supply name is too long (200 characters at most)"),
      perHeadcount: scalingAmount("per guest amount"),
      perQty: scalingAmount("per item amount"),
    },
    { error: rowObjectError("each scaling rule needs a supply name and an amount") },
  )
  .refine((rule) => rule.perHeadcount > 0 || rule.perQty > 0, {
    // Matches findScalingRuleProblem in menu/rows.ts: a rule with no amount
    // on either axis adds nothing to any order.
    message: "needs a per guest or per item amount above 0",
  });

/**
 * Text in, validated and normalized JSON text out, so the action keeps its
 * `parseJsonArray(parsed.componentsText)` call and stores exactly what passed.
 * Empty text means "no rows". Errors read "Component 2: quantity must be at
 * least 1" and are capped at three so a phone screen can show them.
 */
function jsonRowsText(rowSchema: z.ZodType, rowName: string, listName: string) {
  return z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((text, ctx) => {
      let value: unknown;
      try {
        value = JSON.parse(text ? text : "[]");
      } catch {
        ctx.addIssue({ code: "custom", message: `${listName} must be a valid list.` });
        return z.NEVER;
      }
      if (!Array.isArray(value)) {
        ctx.addIssue({ code: "custom", message: `${listName} must be a list.` });
        return z.NEVER;
      }
      if (value.length > MAX_ROWS) {
        ctx.addIssue({ code: "custom", message: `${listName}: ${MAX_ROWS} rows at most.` });
        return z.NEVER;
      }
      const rows: unknown[] = [];
      const problems: string[] = [];
      value.forEach((entry, index) => {
        const result = rowSchema.safeParse(entry);
        if (result.success) {
          rows.push(result.data);
        } else {
          problems.push(`${rowName} ${index + 1}: ${result.error.issues[0].message}.`);
        }
      });
      if (problems.length > 0) {
        for (const message of problems.slice(0, 3)) ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return JSON.stringify(rows);
    });
}

const componentsText = jsonRowsText(componentRowSchema, "Component", "Components");
const scalingRulesText = jsonRowsText(scalingRuleRowSchema, "Scaling rule", "Scaling rules");

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: optionalString,
  pickupPriceText: z.string().trim().regex(/^$|^\d+(?:\.\d{1,2})?$/, "Enter a valid pickup price").default(""),
  deliveryPriceText: z.string().trim().regex(/^$|^\d+(?:\.\d{1,2})?$/, "Enter a valid delivery price").default(""),
  componentsText,
  scalingRulesText,
  active: z.boolean().default(true),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;

export const updateMenuItemSchema = menuItemSchema.extend({ id: z.string().uuid() });
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const menuItemIdSchema = z.object({ id: z.string().uuid() });

export const historyPeriodSchema = z.enum(HISTORY_PERIODS);

/**
 * Admin CRUD for catering_checklist_defaults (parity audit Catering finding:
 * "No admin UI for per-stage checklist default templates" — the table has a
 * write RLS policy but nothing in the app wrote it).
 */
export const checklistDefaultSchema = z.object({
  stage: z.enum(CHECKLIST_STAGES),
  label: z.string().trim().min(1, "Label is required").max(200),
});
export type ChecklistDefaultInput = z.infer<typeof checklistDefaultSchema>;

export const checklistDefaultIdSchema = z.object({ id: z.string().uuid() });

export const updateChecklistDefaultSchema = checklistDefaultSchema.extend({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type UpdateChecklistDefaultInput = z.infer<typeof updateChecklistDefaultSchema>;

export const toggleChecklistDefaultActiveSchema = checklistDefaultIdSchema.extend({
  active: z.boolean(),
});
export type ToggleChecklistDefaultActiveInput = z.infer<typeof toggleChecklistDefaultActiveSchema>;

/** Order search box on /catering. The 2-character floor lives in classifyOrderSearch. */
export const orderSearchSchema = z.object({ query: z.string().trim().max(80) });
export type OrderSearchInput = z.infer<typeof orderSearchSchema>;

export const reorderChecklistDefaultsSchema = z.object({
  stage: z.enum(CHECKLIST_STAGES),
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderChecklistDefaultsInput = z.infer<typeof reorderChecklistDefaultsSchema>;
