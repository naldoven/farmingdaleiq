/**
 * Zod-free constants for the Training schedule module. Kept out of validation.ts
 * so the client form (components/training/create-session-form.tsx) can import
 * them without pulling zod and the whole schema module into the browser bundle.
 * validation.ts re-exports these for server/action code.
 */

export const SESSION_TAG_OPTIONS = [
  "Learn",
  "Position Overview",
  "Nug Review",
] as const;
