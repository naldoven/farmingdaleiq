/**
 * Zod-free constants for the Vendors module. Kept out of validation.ts so
 * client components (components/maintenance/vendor-manager.tsx) can import them
 * without pulling zod and the whole schema module into the browser bundle.
 * validation.ts re-exports these for server/action code.
 */

export const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
