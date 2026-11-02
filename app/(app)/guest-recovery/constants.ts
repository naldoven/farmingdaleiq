/**
 * Shared Guest Recovery constants (ARCHITECTURE.md "Guest Recovery"). Plain
 * values only, so client components can import them without pulling in server
 * code.
 */

export const RECOVERY_STATUSES = ["owed", "given", "void"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const SEND_CHANNELS = ["email", "sms"] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];

export const SEND_STATUSES = ["sending", "sent", "failed", "skipped"] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

export const GUEST_NAME_MAX = 80;
export const ORDER_NUMBER_MAX = 40;
export const NOTE_MAX = 300;
export const ITEM_NAME_MAX = 80;
export const MAX_ITEMS = 20;
export const MAX_QTY = 20;

/** The redeem token is 64 hex characters (two uuids, dashes stripped). */
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** A recovery counts as "sent fast" when its first message went out this soon after it was logged. */
export const FAST_SEND_MINUTES = 15;

/** A recovery still owed this long after it was logged is flagged for a follow-up call. */
export const STALE_OWED_DAYS = 7;

/** The store name guests see in the email and the text. */
export const STORE_NAME = "Chick-fil-A Farmingdale";

/** Why the guest called. One tap on the log form; also what Stats groups by. */
export const REASONS = ["missing_item", "wrong_item", "quality", "too_slow", "other"] as const;
export type Reason = (typeof REASONS)[number];

export const REASON_LABELS: Record<Reason, string> = {
  missing_item: "Missing item",
  wrong_item: "Wrong item",
  quality: "Quality problem",
  too_slow: "Took too long",
  other: "Other",
};

/** Recoveries logged before reasons existed carry none. */
export const NO_REASON_LABEL = "Not recorded";

/**
 * standard: the guest gets the email, text and QR. spotlight: the guest has the
 * Chick-fil-A app, gets a short "reward within 48 hours" message instead, and
 * the overseer sends the reward by hand.
 */
export const PATHS = ["standard", "spotlight"] as const;
export type RecoveryPath = (typeof PATHS)[number];

export const SPOTLIGHT_PROMISE_HOURS = 48;

export const DEFAULT_EXPIRY_DAYS = 90;
export const MIN_EXPIRY_DAYS = 7;
export const MAX_EXPIRY_DAYS = 365;

/** A recovery is a repeat when the same phone or email had another one this many days earlier. */
export const REPEAT_WINDOW_DAYS = 90;
