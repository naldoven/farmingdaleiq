import { ZodError } from "zod";

import { PermissionError } from "@/lib/auth/permissions";

/**
 * Maps a thrown error to a single user-facing line for a Server Action's
 * ActionResult. This is the one shared version of what nearly every
 * app/(app)/**\/actions.ts used to duplicate as a local `toActionError`.
 *
 * Order matters: ZodError extends Error, so it MUST be handled before the
 * generic Error branch. A thrown ZodError's `.message` is a raw JSON array of
 * issues, so the old local copies (which only had a generic Error branch) put
 * that raw JSON in front of the user (the S1 audit finding). Here we join the
 * human-readable issue messages into one friendly line instead.
 */
export function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  // Must precede the generic Error branch below (ZodError extends Error).
  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => issue.message)
      .filter(Boolean)
      .join("; ");
    return message || "Please check the form and try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}
