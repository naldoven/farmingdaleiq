-- FIQ-02 (high) + FIQ-05 (med): lock down direct PostgREST access to app_events.
--
-- app_events (20260707050000_app_events_and_rls_backfill.sql) shipped with:
--   - a blanket authenticated SELECT (using true), which leaked every
--     coworker's disciplinary/infraction status and catering customer PII
--     (guestName / eventDate / headcount, carried in event payloads) to any
--     signed-in employee via a direct PostgREST read (FIQ-02); and
--   - a blanket authenticated INSERT (with check true), which let any signed-in
--     user forge accountability/recognition/gift/top-performer/broadcast events
--     targeting a coworker, driving real notifications, Web Push, Discord posts,
--     and the token consumer (FIQ-05).
--
-- Every real CONSUMER of app_events uses the service-role client and bypasses
-- RLS (lib/notify/events.ts, app/api/cron/tokens/route.ts,
-- app/(app)/tasks/system-tasks.ts). The ONLY authenticated reader was the
-- top_performer "already picked?" lookup on the setup board
-- (app/(app)/setups/page.tsx and selectTopPerformer in setups/actions.ts). We
-- move that behind a narrow SECURITY DEFINER function that answers a single
-- boolean and exposes no other rows or payload fields, then drop the blanket
-- SELECT entirely.
--
-- The PRODUCER path (emitEvent, lib/events/bus.ts) still needs an authenticated
-- INSERT, so instead of blocking it we constrain WHAT an ordinary member can
-- emit: sensitive/value-bearing keys are gated on the same permission their
-- server action already requires; everything else stays open (unchanged from
-- today). An emitted_by column records the acting user for audit/defense.
--
-- Idempotent: policies/functions dropped-if-exists; column add is IF NOT EXISTS.

-- =====================================================================
-- FIQ-02: remove the blanket authenticated SELECT; expose only the one
-- narrow read the app needs via a SECURITY DEFINER function.
-- =====================================================================
drop policy if exists app_events_select_authenticated on public.app_events;

-- Answers exactly "has a Top Performer already been picked for this setup?"
-- without exposing app_events rows to the authenticated client. SECURITY
-- DEFINER + owned by the migration role (BYPASSRLS) so it can read app_events
-- despite the table now having no authenticated SELECT policy.
create or replace function public.setup_has_top_performer(p_setup_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_events
    where event_key = 'top_performer'
      and payload->>'setup_id' = p_setup_id::text
  );
$$;

revoke all on function public.setup_has_top_performer(uuid) from public;
grant execute on function public.setup_has_top_performer(uuid) to authenticated;

-- =====================================================================
-- FIQ-05: audit column + a producer INSERT policy that gates the sensitive
-- keys on permission. emitted_by defaults to auth.uid() (the acting user for
-- an authenticated emit; NULL for the service-role/cron path).
-- =====================================================================
alter table public.app_events
  add column if not exists emitted_by uuid default auth.uid() references public.profiles(id);

drop policy if exists app_events_insert_authenticated on public.app_events;
create policy app_events_insert_authenticated on public.app_events
  for insert to authenticated
  with check (
    case event_key
      when 'recognition' then public.has_permission('tokens.award')
      when 'gift_sent' then public.has_permission('tokens.gift')
      when 'reward_claim' then public.has_permission('rewards.claim')
      when 'top_performer' then public.has_permission('setups.post')
      when 'broadcast' then public.has_permission('feed.post_broadcast')
      when 'infraction_issued' then
        public.has_permission('accountability.issue') or public.has_permission('accountability.manage')
      when 'disciplinary_triggered' then
        public.has_permission('accountability.issue') or public.has_permission('accountability.manage')
      else true
    end
  );
