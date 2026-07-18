-- TOK1 (audit iter 1, HIGH money): gift_tokens() and redeem_reward() had only a
-- per-user advisory lock. The lock prevents OVERSPEND (concurrent calls
-- serialize on a fresh balance) but NOT DUPLICATE EXECUTION: two identical
-- submits / a retry both run to completion -- two gift pairs (balance -4 for one
-- intended -2), or two reward_claims + two fulfillment tasks for one intended
-- claim. Only createRecognition was idempotent (its event_id unique index,
-- 20260707080300_idempotency_unique_indexes.sql, FIQ-03).
--
-- Fix: give gift and claim the same guarantee via a client-generated request id
-- (crypto.randomUUID minted per submit attempt), threaded in as p_request_id and
-- stored in the transaction ref jsonb. Inside each SECURITY DEFINER function,
-- after taking the advisory lock, we check whether a row already carries this
-- request_id; if so we return the ORIGINAL result and write nothing (a true
-- no-op). The advisory lock makes the check race-safe: a concurrent duplicate
-- waits for the first to commit, then sees its request_id. The unique partial
-- index (ref->>'request_id', kind) is the DB backstop that hard-fails a second
-- write if the guard is ever bypassed.
--
-- For gift (a gift_out + gift_in pair) the SAME request_id is written to BOTH
-- rows; keying the index on (request_id, kind) lets the pair coexist (distinct
-- kinds) while a retry's gift_out collides with the first gift_out -- the id
-- dedupes the whole logical transfer, not half of it.
--
-- Idempotent migration: drop the old function signatures (so the new default
-- param can't create an ambiguous overload), CREATE OR REPLACE the new ones, and
-- create-the-index-if-not-exists after dropping it. Existing gift/redeem rows
-- carry no 'request_id' key, so the partial index has nothing to collide with.

-- ---------------------------------------------------------------------
-- Unique backstop. Partial: only rows whose ref carries a request_id are
-- constrained; every legacy gift/redeem/recognition row (no request_id key) is
-- untouched. Keyed on (request_id, kind) so a gift_out + gift_in pair sharing
-- one request_id does not self-collide, but a retry of either row does.
-- ---------------------------------------------------------------------
drop index if exists public.token_transactions_request_id_kind_uq;
create unique index token_transactions_request_id_kind_uq
  on public.token_transactions ((ref->>'request_id'), kind)
  where ref ? 'request_id';

-- ---------------------------------------------------------------------
-- redeem_reward(p_reward_id, p_request_id): same body as
-- 20260707030000_tokens_rewards_feed_rls.sql plus the request-id guard. The
-- redeem row's ref now also carries claim_id (so a duplicate can return the
-- original claim) and, when supplied, request_id.
-- ---------------------------------------------------------------------
drop function if exists public.redeem_reward(uuid);

create or replace function public.redeem_reward(p_reward_id uuid, p_request_id uuid default null)
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
  v_ref jsonb;
  v_existing record;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  if not public.has_permission('rewards.claim') then
    raise exception 'Missing permission: rewards.claim';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- Idempotency guard: a retry/double-submit with the same request id returns
  -- the original claim unchanged instead of debiting again.
  if p_request_id is not null then
    select t.id, (t.ref->>'claim_id')::uuid as claim_id, -t.delta as cost
    into v_existing
    from public.token_transactions t
    where t.kind = 'redeem'
      and t.ref->>'request_id' = p_request_id::text
      and t.user_id = v_user
    limit 1;

    if found then
      select coalesce(sum(t.delta), 0) into v_balance
      from public.token_transactions t
      where t.user_id = v_user;
      return query select v_existing.id, v_existing.claim_id, v_balance, v_existing.cost;
      return;
    end if;
  end if;

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

  -- Create the claim first so its id can be recorded on the ledger row, letting
  -- a later duplicate return the same claim_id.
  insert into public.reward_claims (reward_id, user_id, cost, status)
  values (p_reward_id, v_user, v_cost, 'pending')
  returning id into v_claim_id;

  v_ref := jsonb_build_object('reward_id', p_reward_id, 'claim_id', v_claim_id);
  if p_request_id is not null then
    v_ref := v_ref || jsonb_build_object('request_id', p_request_id);
  end if;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by)
  values (v_user, -v_cost, 'redeem', v_ref, v_user)
  returning id into v_tx_id;

  if v_stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_user;

  return query select v_tx_id, v_claim_id, v_balance, v_cost;
end;
$$;

revoke all on function public.redeem_reward(uuid, uuid) from public;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- gift_tokens(p_to_user_id, p_amount, p_note, p_request_id): same body as
-- 20260707030000 plus the request-id guard. The request_id is written to BOTH
-- the gift_out and gift_in rows so the whole transfer dedupes.
-- ---------------------------------------------------------------------
drop function if exists public.gift_tokens(uuid, int, text);

create or replace function public.gift_tokens(
  p_to_user_id uuid,
  p_amount int,
  p_note text default null,
  p_request_id uuid default null
)
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
  v_ref_out jsonb;
  v_ref_in jsonb;
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

  -- Idempotency guard: a retry/double-submit with the same request id returns
  -- the original transfer's ids and the sender's current balance, moving
  -- nothing. Keyed on the gift_out (debit) row.
  if p_request_id is not null then
    select t.id into v_debit_id
    from public.token_transactions t
    where t.kind = 'gift_out'
      and t.ref->>'request_id' = p_request_id::text
      and t.user_id = v_from
    limit 1;

    if v_debit_id is not null then
      select t.id into v_credit_id
      from public.token_transactions t
      where t.kind = 'gift_in'
        and t.ref->>'request_id' = p_request_id::text
        and t.user_id = p_to_user_id
      limit 1;

      select coalesce(sum(t.delta), 0) into v_balance
      from public.token_transactions t
      where t.user_id = v_from;

      return query select v_debit_id, v_credit_id, v_balance;
      return;
    end if;
  end if;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_from;

  if v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  v_ref_out := jsonb_build_object('to_user_id', p_to_user_id);
  v_ref_in := jsonb_build_object('from_user_id', v_from);
  if p_request_id is not null then
    v_ref_out := v_ref_out || jsonb_build_object('request_id', p_request_id);
    v_ref_in := v_ref_in || jsonb_build_object('request_id', p_request_id);
  end if;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (v_from, -p_amount, 'gift_out', v_ref_out, v_from, p_note)
  returning id into v_debit_id;

  insert into public.token_transactions (user_id, delta, kind, ref, created_by, note)
  values (p_to_user_id, p_amount, 'gift_in', v_ref_in, v_from, p_note)
  returning id into v_credit_id;

  select coalesce(sum(t.delta), 0) into v_balance
  from public.token_transactions t
  where t.user_id = v_from;

  return query select v_debit_id, v_credit_id, v_balance;
end;
$$;

revoke all on function public.gift_tokens(uuid, int, text, uuid) from public;
grant execute on function public.gift_tokens(uuid, int, text, uuid) to authenticated;
