import type { RecoveryStatus, SendChannel, SendStatus } from "@/app/(app)/guest-recovery/constants";

/** One missing item on a recovery. name and family are snapshots from when it was logged. */
export interface RecoveryItemView {
  id: string;
  name: string;
  family: string;
  qty: number;
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
}
