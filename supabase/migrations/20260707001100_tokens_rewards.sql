-- Tokens & rewards
-- ARCHITECTURE.md "Data model (Postgres)" > Tokens & rewards
-- Token integrity: balances are never stored, always the sum of
-- token_transactions (see lib/tokens/ledger.ts).

create table public.token_earning_rules (
  event_key text primary key,
  amount int not null default 0
);

create table public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  delta int not null,
  kind text not null
    check (kind in ('earn', 'recognition', 'top_performer', 'gift_in', 'gift_out', 'redeem', 'adjust')),
  ref jsonb,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  token_cost int not null,
  active boolean not null default true,
  stock int
);

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id),
  user_id uuid not null references public.profiles(id),
  cost int not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'cancelled')),
  fulfillment_task_id uuid references public.tasks(id),
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id)
);
