-- FIQ-01 (high): stop a tokens.award holder from self-minting unlimited tokens.
--
-- The original token_transactions_insert_award policy
-- (20260707030000_tokens_rewards_feed_rls.sql) let any tokens.award holder
-- (down to Team Leader) POST directly to PostgREST and:
--   - credit ANY user_id, including their OWN (self-credit),
--   - with kind 'adjust' (an unbounded manual correction), and
--   - for any delta magnitude,
-- bypassing the app's self/amount guards entirely.
--
-- This migration tightens that INSERT policy to the exact shape the legitimate
-- award paths use, routes 'adjust' through a tokens.manage-gated SECURITY
-- DEFINER function, and adds a per-row magnitude bound on the award kinds as
-- defense in depth. The SECURITY DEFINER money functions (redeem_reward,
-- gift_tokens, cancel_reward_claim) and the service-role cron consumer bypass
-- RLS, so none of them depend on this policy and none are affected.
--
-- Idempotent: policy and constraint are dropped-if-exists before (re)creation.

-- ---------------------------------------------------------------------
-- 1. Tighten the award INSERT policy.
--    - kind limited to the three genuine credit kinds (no 'adjust').
--    - created_by must be the caller (drop the NULL branch — a direct
--      client insert can no longer omit attribution).
--    - user_id <> auth.uid() blocks self-credit outright.
-- ---------------------------------------------------------------------
drop policy if exists token_transactions_insert_award on public.token_transactions;
create policy token_transactions_insert_award on public.token_transactions
  for insert
  with check (
    kind in ('earn', 'recognition', 'top_performer')
    and public.has_permission('tokens.award')
    and created_by = auth.uid()
    and user_id <> auth.uid()
  );

-- ---------------------------------------------------------------------
-- 2. Per-row magnitude bound for the award kinds. Redeem/gift/adjust rows
--    are written only by SECURITY DEFINER functions (balance-capped), so
--    this constraint deliberately does not touch them; it only bounds the
--    positive credit kinds an award holder can mint, so a compromised or
--    malicious award holder cannot hand out an absurd amount in one row.
--    10000 is ~500x the largest seeded award (top_performer = 20), so it
--    never blocks a legitimate credit.
-- ---------------------------------------------------------------------
alter table public.token_transactions
  drop constraint if exists token_transactions_award_delta_bound;
alter table public.token_transactions
  add constraint token_transactions_award_delta_bound check (
    kind not in ('earn', 'recognition', 'top_performer')
    or (delta >= 0 and delta <= 10000)
  );

-- ---------------------------------------------------------------------
-- 3. Route 'adjust' through a tokens.manage-gated SECURITY DEFINER function.
--    The tightened policy no longer allows a direct 'adjust' insert from the
--    authenticated client; a manual admin adjustment now goes through here,
--    which re-checks tokens.manage itself (never trusts a passed-in actor)
--    and records the acting admin as created_by. Bounded to a sane range so
--    even an admin path can't fat-finger a runaway value.
-- ---------------------------------------------------------------------
create or replace function public.adjust_tokens(
  p_user_id uuid,
  p_delta int,
  p_note text default null
)
returns table(transaction_id uuid, balance_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tx_id uuid;
  v_balance int;
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;

  if not public.has_permission('tokens.manage') then
    raise exception 'Missing permission: tokens.manage';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Adjustment amount must be non-zero';
  end if;

  if p_delta < -1000000 or p_delta > 1000000 then
    raise exception 'Adjustment amount is out of range';
  end if;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (
    p_user_id,
    p_delta,
    'adjust',
    jsonb_build_object('reason', 'manual_adjustment'),
    v_actor,
    p_note
  )
  returning id into v_tx_id;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = p_user_id;

  return query select v_tx_id, v_balance;
end;
$$;

revoke all on function public.adjust_tokens(uuid, int, text) from public;
grant execute on function public.adjust_tokens(uuid, int, text) to authenticated;
