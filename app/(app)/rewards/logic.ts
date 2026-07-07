/**
 * Pure claim-eligibility logic for the Rewards module. Dependency-free (no
 * Supabase client) so it's directly unit-testable and shared between the
 * server page (deciding whether to render a claim button as enabled) and
 * components/tokens/reward-card.tsx (client-side guard before even calling
 * the server action). The REAL enforcement is still server-side --
 * redeem_reward() re-checks all three conditions atomically -- this is
 * advisory/UX only.
 */

export interface RewardForClaim {
  active: boolean;
  stock: number | null;
  tokenCost: number;
}

export type ClaimBlockedReason = "inactive" | "out_of_stock" | "insufficient_balance" | null;

export function whyCantClaim(reward: RewardForClaim, balance: number): ClaimBlockedReason {
  if (!reward.active) return "inactive";
  if (reward.stock !== null && reward.stock <= 0) return "out_of_stock";
  if (balance < reward.tokenCost) return "insufficient_balance";
  return null;
}

export function canClaim(reward: RewardForClaim, balance: number): boolean {
  return whyCantClaim(reward, balance) === null;
}

export const CLAIM_BLOCKED_LABELS: Record<Exclude<ClaimBlockedReason, null>, string> = {
  inactive: "Not available",
  out_of_stock: "Out of stock",
  insufficient_balance: "Not enough tokens",
};

export function claimBlockedLabel(reason: ClaimBlockedReason): string | null {
  return reason ? CLAIM_BLOCKED_LABELS[reason] : null;
}
