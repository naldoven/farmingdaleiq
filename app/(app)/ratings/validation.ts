import { z } from "zod";

/**
 * Input validation for the Ratings server actions
 * (app/(app)/ratings/actions.ts). Kept in a plain module so it's
 * unit-testable on its own, matching the People module's pattern.
 */

const starsSchema = z.number().min(0).max(5);

export const quickRateSchema = z.object({
  userId: z.string().uuid(),
  positionId: z.string().uuid(),
  stars: starsSchema,
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type QuickRateInput = z.infer<typeof quickRateSchema>;

export const rubricRateSchema = z.object({
  userId: z.string().uuid(),
  positionId: z.string().uuid(),
  category1: starsSchema.nullable(),
  category2: starsSchema.nullable(),
  category3: starsSchema.nullable(),
  category4: starsSchema.nullable(),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type RubricRateInput = z.infer<typeof rubricRateSchema>;

export const resolveRerateSchema = z.object({
  id: z.string().uuid(),
});

export type ResolveRerateInput = z.infer<typeof resolveRerateSchema>;

export const upsertRubricSchema = z.object({
  positionId: z.string().uuid(),
  category1: z.string().trim().max(100).optional().or(z.literal("")),
  category2: z.string().trim().max(100).optional().or(z.literal("")),
  category3: z.string().trim().max(100).optional().or(z.literal("")),
  category4: z.string().trim().max(100).optional().or(z.literal("")),
});

export type UpsertRubricInput = z.infer<typeof upsertRubricSchema>;
