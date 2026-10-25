-- Changes RLS on populated tables; apply only after the owner's go, before merging #83.
--
-- Positions and position groups are store setup, edited at /settings/positions,
-- and those server actions require settings.manage (Director and Location
-- Manager in the seeded roles). The database still checked setups.manage, which
-- Shift Supervisor and up hold, so a Shift Supervisor could rename, reorder, or
-- delete positions straight through the API even though the screen refused them.
-- Deleting a position erases its ratings and its passport with every trainee's
-- progress (see delete_position below), so this is a real gap.
--
-- This migration makes the database enforce the same rule as the actions:
--   * position_groups_write_manager and positions_write_manager (the write
--     policies from 20260707050000_app_events_and_rls_backfill.sql) now need
--     settings.manage. The select policies are untouched: any signed-in member
--     can still read positions.
--   * delete_position and delete_position_group (20260718010300_delete_position_rpc.sql)
--     now check settings.manage inside the function. Only that check changed;
--     every delete statement is identical to the original. They are SECURITY
--     DEFINER, so this internal check is the only gate (RLS does not apply).
--
-- Nothing is weakened: in the seeded roles, every role that holds settings.manage
-- (Director and Location Manager) also holds setups.manage, so the set of people
-- who can write only shrinks.
--
-- Side effect: the dormant Setups module's editor (/setups/templates, switched
-- off in lib/features.ts) writes the same tables. Its position edits now need
-- settings.manage too. If that module is ever switched back on, point it at
-- /settings/positions or give its roles settings.manage.
--
-- Rollout order: apply this before #83's code ships. Until then the new screen
-- still works for Director and Location Manager, who hold both keys.
--
-- Idempotent: policies are dropped first, functions use create or replace, and
-- the revoke and grant statements can run again.

drop policy if exists position_groups_write_manager on public.position_groups;
create policy position_groups_write_manager on public.position_groups
  for all
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

drop policy if exists positions_write_manager on public.positions;
create policy positions_write_manager on public.positions
  for all
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

create or replace function public.delete_position(p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Position Passport (cascades passport_enrollments -> passport_item_progress).
  delete from public.passports where position_id = p_position_id;
  -- Ratings history + any open re-rate nudges for this position.
  delete from public.position_ratings where position_id = p_position_id;
  delete from public.rerate_prompts where position_id = p_position_id;
  -- Setup wiring owned by this module.
  delete from public.setup_assignments where position_id = p_position_id;
  delete from public.layout_tiles where position_id = p_position_id;
  -- rating_rubrics + setup_template_positions cascade on their own FK.
  -- Raises 23503 here if roadmap_stations / training_sessions still reference it.
  delete from public.positions where id = p_position_id;
end;
$$;

revoke all on function public.delete_position(uuid) from public, anon, authenticated;
grant execute on function public.delete_position(uuid) to authenticated;

create or replace function public.delete_position_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pos record;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Clear each member position's blocking dependents first, otherwise the
  -- group delete cascades into positions and hits the same FKs.
  for pos in select id from public.positions where group_id = p_group_id loop
    delete from public.passports where position_id = pos.id;
    delete from public.position_ratings where position_id = pos.id;
    delete from public.rerate_prompts where position_id = pos.id;
    delete from public.setup_assignments where position_id = pos.id;
    delete from public.layout_tiles where position_id = pos.id;
  end loop;

  -- positions cascade-delete with the group (positions.group_id ON DELETE CASCADE).
  delete from public.position_groups where id = p_group_id;
end;
$$;

revoke all on function public.delete_position_group(uuid) from public, anon, authenticated;
grant execute on function public.delete_position_group(uuid) to authenticated;
