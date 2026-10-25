import type { OrderStage } from "@/app/(app)/catering/logic";

/**
 * Shared result type for Catering server actions. Kept out of the "use
 * server" action files themselves: Next.js only allows async function
 * exports from a file marked "use server", so shared types/helpers used by
 * more than one action file live here instead (mirrors app/(app)/people/
 * action-types.ts and app/(app)/checklists/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * One row of the /catering order search. Deliberately carries no phone or
 * email: the search matches on them but the client never receives them.
 */
export type OrderSearchResult = {
  id: string;
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  stage: OrderStage;
  headcount: number | null;
};
