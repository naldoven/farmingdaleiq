import { z } from "zod";

import { STORE_SETUP_AREA_KEYS } from "@/lib/store-setup/areas";

/**
 * Input validation for the Store setup server actions
 * (app/(app)/settings/setup/actions.ts). Plain module, no "use server", so it
 * is unit-testable on its own, matching app/(app)/people/validation.ts.
 */
export const setupAreaKeySchema = z.object({
  areaKey: z.enum(STORE_SETUP_AREA_KEYS),
});

export type SetupAreaKeyInput = z.infer<typeof setupAreaKeySchema>;
