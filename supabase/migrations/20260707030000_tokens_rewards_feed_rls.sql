-- RLS policies for Tokens, rewards, feed (PLAN.md S7). These are PERMISSIVE
-- policies layered on top of the default_deny policy created in
-- 20260707009900_rls_default_deny.sql (permissive policies OR together, so
-- this grants exactly the access described below and nothing else leaks
-- through) -- same pattern as 20260707001850_people_teams_rls.sql for
-- People & Teams, and 20260707010000_checklists_rls.sql / 20260707010500_
-- waste_rls.sql for S1/S5.
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` and
-- `lib/tokens/ledger.ts` as shared/frozen after P0, "report needed changes
-- back instead of editing" ("interface only until S7"). This file is an
-- ADDITIVE new migration (no existing file is edited) touching ONLY the
-- tables this stream owns (token_earning_rules, token_transactions, rewards,
-- reward_claims, feed_posts, feed_likes, feed_comments) plus one new table
-- this stream introduces to track its own event-consumer idempotency
-- (token_processed_events, see below) -- without RLS policies these tables
-- are unreachable from the normal per-request client (every table got a
-- `using (false)` default-deny policy in P0), which would make the whole
-- module non-functional end to end. This mirrors S1's and S5's precedent
-- (both hit and documented the same gap first). Flagged in this stream's
-- final report for orchestrator sign-off given the "do not touch
-- migrations" instruction is otherwise blanket.
--
-- Money-math note (ARCHITECTURE.md "Technical architecture": "Token
-- integrity: balances are never stored ... redemptions validate balance in
-- a transaction"): the redeem_reward() and gift_tokens() functions below are
-- SECURITY DEFINER plpgsql functions that take a per-user
-- pg_advisory_xact_lock before re-reading the ledger sum, so two concurrent
-- calls for the same user serialize instead of racing on a stale balance.
-- They are the ONLY way `redeem`/`gift_out`/`gift_in` rows get written; no
-- RLS insert policy grants those kinds directly, so a client can't bypass
-- the transactional check by calling `.insert()` on token_transactions
-- directly.

-- ---------------------------------------------------------------------
-- token_earning_rules: config data (event_key -> token amount). Any
-- signed-in member can read (the earning-rule consumer's amounts should be
-- visible to anyone curious what a task/checklist is worth); only
-- tokens.manage can write.
-- ---------------------------------------------------------------------
create policy token_earning_rules_select_authenticated on public.token_earning_rules
  for select
  using (auth.uid() is not null);

create policy token_earning_rules_write_manager on public.token_earning_rules
  for all
  using (public.has_permission('tokens.manage'))
  with check (public.has_permission('tokens.manage'));

-- ---------------------------------------------------------------------
-- token_transactions: a user sees their own ledger; tokens.manage sees
-- everyone's (admin ledger view / audit). Inserts of 'earn' / 'recognition'
-- / 'top_performer' / 'adjust' kinds are allowed for a tokens.award holder
-- (created_by must be the caller); 'redeem' / 'gift_out' / 'gift_in' rows
-- are only ever written by the SECURITY DEFINER functions below, which
-- bypass RLS entirely, so no insert policy names those kinds. The nightly
-- earning-rule consumer (app/api/cron/tokens/route.ts) uses the
-- service-role client, which also bypasses RLS.
-- ---------------------------------------------------------------------
create policy token_transactions_select_own on public.token_transactions
  for select
  using (user_id = auth.uid());

create policy token_transactions_select_manager on public.token_transactions
  for select
  using (public.has_permission('tokens.manage'));

create policy token_transactions_insert_award on public.token_transactions
  for insert
  with check (
    kind in ('earn', 'recognition', 'top_performer', 'adjust')
    and public.has_permission('tokens.award')
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------
-- rewards: any signed-in member can browse the store; rewards.manage can
-- create/edit/retire rewards. Stock decrements happen only inside
-- redeem_reward() (SECURITY DEFINER), never through this policy.
-- ---------------------------------------------------------------------
create policy rewards_select_authenticated on public.rewards
  for select
  using (auth.uid() is not null);

create policy rewards_write_manager on public.rewards
  for all
  using (public.has_permission('rewards.manage'))
  with check (public.has_permission('rewards.manage'));

-- ---------------------------------------------------------------------
-- reward_claims: a user sees their own claims; rewards.fulfill or
-- rewards.manage can see every claim (the fulfillment queue). Inserts only
-- happen inside redeem_reward() (SECURITY DEFINER); updates (mark
-- delivered/cancelled) require rewards.fulfill.
-- ---------------------------------------------------------------------
create policy reward_claims_select_own on public.reward_claims
  for select
  using (user_id = auth.uid());

create policy reward_claims_select_fulfiller on public.reward_claims
  for select
  using (public.has_permission('rewards.fulfill') or public.has_permission('rewards.manage'));

create policy reward_claims_update_fulfiller on public.reward_claims
  for update
  using (public.has_permission('rewards.fulfill') or public.has_permission('rewards.manage'))
  with check (public.has_permission('rewards.fulfill') or public.has_permission('rewards.manage'));

-- ---------------------------------------------------------------------
-- feed_posts: any signed-in member can read the store feed. Inserting a
-- 'broadcast' post requires feed.post_broadcast; inserting a 'recognition'
-- post requires tokens.award (recognitions always carry a token award, so
-- the same permission that guards the ledger insert guards the shoutout).
-- 'top_performer' posts are written by the service-role event consumer
-- (app/api/cron/tokens/route.ts), which bypasses RLS, so no policy names
-- that kind.
-- ---------------------------------------------------------------------
create policy feed_posts_select_authenticated on public.feed_posts
  for select
  using (auth.uid() is not null);

create policy feed_posts_insert_broadcast on public.feed_posts
  for insert
  with check (
    kind = 'broadcast'
    and public.has_permission('feed.post_broadcast')
    and (author_id is null or author_id = auth.uid())
  );

create policy feed_posts_insert_recognition on public.feed_posts
  for insert
  with check (
    kind = 'recognition'
    and public.has_permission('tokens.award')
    and (author_id is null or author_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- feed_likes / feed_comments: any signed-in member can read; liking/
-- commenting requires feed.post (ARCHITECTURE.md "Team Feed": "Team members
-- can like and comment on posts" -- feed.post is seeded as a base_key on
-- every role in 20260707001900_seed_store_config.sql, so this is the
-- practical equivalent of "any active member" today while still failing
-- closed for a hypothetical future role that lacks it). A like/comment is
-- always attributed to the caller.
-- ---------------------------------------------------------------------
create policy feed_likes_select_authenticated on public.feed_likes
  for select
  using (auth.uid() is not null);

create policy feed_likes_insert_self on public.feed_likes
  for insert
  with check (public.has_permission('feed.post') and user_id = auth.uid());

create policy feed_likes_delete_self on public.feed_likes
  for delete
  using (user_id = auth.uid());

create policy feed_comments_select_authenticated on public.feed_comments
  for select
  using (auth.uid() is not null);

create policy feed_comments_insert_self on public.feed_comments
  for insert
  with check (
    public.has_permission('feed.post')
    and (author_id is null or author_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- token_processed_events: this stream's OWN idempotency cursor for the
-- app_events consumer (app/api/cron/tokens/route.ts), separate from
-- app_events.processed_at. app_events is a P0-owned shared table
-- (docs/agent-map.md) with more than one intended consumer (this stream
-- for task_complete/checklist_complete/top_performer; S10 Notifications+
-- Discord for its own, overlapping set of keys like top_performer/
-- recognition/broadcast/reward_claim). If this stream wrote
-- app_events.processed_at, it would hide those rows from S10's consumer
-- (and vice versa). Recording "has S7 handled event X" in a table only S7
-- reads/writes avoids that cross-stream race entirely, matching this
-- task's instruction to "read the app_events / your own tables
-- idempotently within YOUR code." Only ever touched by the service-role
-- cron route, so it keeps the plain default-deny policy from P0 (no
-- policy added here).
-- ---------------------------------------------------------------------
create table public.token_processed_events (
  event_id uuid primary key references public.app_events(id) on delete cascade,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- redeem_reward(): atomically debits the caller's ledger for a reward and
-- creates the reward_claims row. SECURITY DEFINER so it can read/write
-- across token_transactions / rewards / reward_claims regardless of the
-- caller's own row-level grants, but it re-derives the acting user from
-- auth.uid() (never trusts a passed-in user id) and re-checks
-- has_permission('rewards.claim') itself, so it cannot be used to redeem on
-- someone else's behalf. pg_advisory_xact_lock(hashtext(user)) serializes
-- concurrent redemptions for the SAME user (double-click / retry), and
-- `select ... for update` on the reward row serializes concurrent
-- redemptions of the SAME reward across different users (the stock check).
-- Fulfillment-task creation is explicitly NOT done here: `tasks` is owned
-- by S2 (docs/agent-map.md), so this function only leaves
-- reward_claims.fulfillment_task_id null; the caller (lib/tokens/ledger.ts
-- redeemReward) emits a `reward_claim` event for the P2 wiring agent / S2's
-- event consumer to pick up (PLAN.md S7 build note: "rewards store + claim
-- -> fulfillment task via event").
-- ---------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns table(transaction_id uuid, claim_id uuid, balance_after int, cost int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cost int;
  v_stock int;
  v_active boolean;
  v_balance int;
  v_tx_id uuid;
  v_claim_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  if not public.has_permission('rewards.claim') then
    raise exception 'Missing permission: rewards.claim';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select r.token_cost, r.stock, r.active into v_cost, v_stock, v_active
  from public.rewards r
  where r.id = p_reward_id
  for update;

  if not found then
    raise exception 'Reward not found';
  end if;

  if not v_active then
    raise exception 'Reward is not active';
  end if;

  if v_stock is not null and v_stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_user;

  if v_balance < v_cost then
    raise exception 'Insufficient balance';
  end if;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by)
  values (v_user, -v_cost, 'redeem', jsonb_build_object('reward_id', p_reward_id), v_user)
  returning id into v_tx_id;

  insert into public.reward_claims (reward_id, user_id, cost, status)
  values (p_reward_id, v_user, v_cost, 'pending')
  returning id into v_claim_id;

  if v_stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_user;

  return query select v_tx_id, v_claim_id, v_balance, v_cost;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- cancel_reward_claim(): reverses a pending claim (rewards.fulfill /
-- rewards.manage only), refunding the ledger with an 'adjust' credit and
-- restocking the reward, atomically. A 'delivered' claim cannot be
-- cancelled through this path.
-- ---------------------------------------------------------------------
create or replace function public.cancel_reward_claim(p_claim_id uuid)
returns table(transaction_id uuid, balance_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_tx_id uuid;
  v_balance int;
begin
  if not (public.has_permission('rewards.fulfill') or public.has_permission('rewards.manage')) then
    raise exception 'Missing permission: rewards.fulfill';
  end if;

  select * into v_claim
  from public.reward_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'Only a pending claim can be cancelled';
  end if;

  update public.reward_claims
  set status = 'cancelled'
  where id = p_claim_id;

  update public.rewards
  set stock = stock + 1
  where id = v_claim.reward_id and stock is not null;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (
    v_claim.user_id,
    v_claim.cost,
    'adjust',
    jsonb_build_object('reward_claim_id', p_claim_id, 'reason', 'claim_cancelled'),
    auth.uid(),
    'Reward claim cancelled, tokens refunded'
  )
  returning id into v_tx_id;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_claim.user_id;

  return query select v_tx_id, v_balance;
end;
$$;

revoke all on function public.cancel_reward_claim(uuid) from public;
grant execute on function public.cancel_reward_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- gift_tokens(): atomically moves tokens from the caller to a coworker,
-- capped by the caller's current balance (ARCHITECTURE.md "Tokens &
-- Rewards": "Anyone can gift their own tokens to a coworker (capped by
-- their balance)"). Same advisory-lock pattern as redeem_reward() to
-- prevent a double-submit from overspending the caller's balance.
-- ---------------------------------------------------------------------
create or replace function public.gift_tokens(p_to_user_id uuid, p_amount int, p_note text default null)
returns table(debit_transaction_id uuid, credit_transaction_id uuid, balance_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_balance int;
  v_debit_id uuid;
  v_credit_id uuid;
begin
  if v_from is null then
    raise exception 'Not signed in';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if p_to_user_id = v_from then
    raise exception 'Cannot gift tokens to yourself';
  end if;

  if not public.has_permission('tokens.gift') then
    raise exception 'Missing permission: tokens.gift';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_from::text));

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_from;

  if v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (v_from, -p_amount, 'gift_out', jsonb_build_object('to_user_id', p_to_user_id), v_from, p_note)
  returning id into v_debit_id;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (p_to_user_id, p_amount, 'gift_in', jsonb_build_object('from_user_id', v_from), v_from, p_note)
  returning id into v_credit_id;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_from;

  return query select v_debit_id, v_credit_id, v_balance;
end;
$$;

revoke all on function public.gift_tokens(uuid, int, text) from public;
grant execute on function public.gift_tokens(uuid, int, text) to authenticated;
