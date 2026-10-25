-- Owner decision 2026-10-25: nobody edits catering prices in the app. The
-- server action updateMenuItem refuses a price change, but that is an app-level
-- check only (AGENTS.md invariant 1: UI hiding is not security). The
-- catering_menu_items write policy lets any catering.manage holder update the
-- row through PostgREST, so this trigger makes the rule hold at the database.
--
-- Allowed: the service role and migrations (auth.uid() is null), which is how
-- catalog prices are loaded. Inserts are not guarded: a brand-new item still
-- needs a price, and createMenuItem sets one. Only a change to an existing
-- item's pickup_price_cents or delivery_price_cents is refused.
--
-- SECURITY INVOKER, no privileged calls. Postgres does not check EXECUTE when a
-- trigger fires, so the function is revoked from every client role like the
-- other trigger functions. Idempotent: create or replace, trigger dropped first.

create or replace function public.enforce_catering_menu_price_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;

  if new.pickup_price_cents is distinct from old.pickup_price_cents
     or new.delivery_price_cents is distinct from old.delivery_price_cents then
    raise exception 'Prices come from the catering catalog and cannot be changed here.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_catering_menu_price_lock() from public, anon, authenticated;

drop trigger if exists catering_menu_items_price_lock on public.catering_menu_items;

create trigger catering_menu_items_price_lock
  before update of pickup_price_cents, delivery_price_cents on public.catering_menu_items
  for each row
  execute function public.enforce_catering_menu_price_lock();
