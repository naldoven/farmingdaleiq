import type { FaultSource, RecoveryPath, RecoveryStatus, SendChannel, SendStatus } from "@/app/(app)/guest-recovery/constants";

/** One missing item on a recovery. name and family are snapshots from when it was logged. */
export interface RecoveryItemView {
  id: string;
  name: string;
  family: string;
  qty: number;
  /** What the guest asked changed. Empty for items logged before mods existed. */
  removed: string[];
  added: string[];
  modNote: string | null;
  /** The two fault-check answers and the source worked out from them. Null when not asked. */
  receiptOk: boolean | null;
  itemOk: boolean | null;
  faultSource: FaultSource | null;
}

/** One send attempt (email or text) for a recovery. */
export interface RecoverySendView {
  id: string;
  channel: SendChannel;
  kind: "initial" | "resend";
  status: SendStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

/**
 * A recovery as the leader screens read it. Holds guest contact details, so it
 * is only ever built for a signed-in holder of guest_recovery.log (RLS enforces
 * the same rule), and never goes into a URL, a log line or an event payload.
 */
export interface RecoveryView {
  id: string;
  token: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  orderNumber: string | null;
  note: string | null;
  smsConsent: boolean;
  status: RecoveryStatus;
  loggedBy: string;
  loggedByName: string;
  createdAt: string;
  givenAt: string | null;
  voidedAt: string | null;
  /** Why the guest called; null for recoveries logged before reasons existed. */
  reason: string | null;
  path: RecoveryPath;
  /** When the guest's code stops being good. Past it, the screens show a red EXPIRED banner. */
  expiresAt: string;
  assignedTo: string | null;
  assignedToName: string | null;
  /** Earlier recoveries for the same phone or email in the 90 days before this one. */
  priorCount: number;
  items: RecoveryItemView[];
  sends: RecoverySendView[];
}

/** One row on the recovery menu. */
export interface MenuItemView {
  id: string;
  name: string;
  family: string;
  category: string;
  sort: number;
  active: boolean;
  /** Takes changes (no pickles, extra sauce). False for nuggets, strips, sides, drinks. */
  modifiable: boolean;
  /** What a guest can ask to leave off. */
  ingredients: string[];
  /** What a guest can ask to add or swap. */
  addons: string[];
}

/** Someone who can work Guest Recovery: who a Spotlight recovery can be handed to. */
export interface WorkerView {
  id: string;
  name: string;
}
