-- SETB3 (audit iter 1): make position / position-group deletes actually work.
--
-- Every position auto-gets a Position Passport via the positions_create_passport
-- trigger (20260707020000_training_rls.sql). passports.position_id declares no
-- ON DELETE action, so a plain `delete from positions` ALWAYS failed with
-- passports_position_id_fkey and the raw Postgres error was shown to the user;
-- position_ratings, rerate_prompts, setup_assignments and layout_tiles block the
-- same way. (rating_rubrics and setup_template_positions already cascade.)
--
-- These SECURITY DEFINER functions delete the dependent rows this module can own
-- in FK order, then the position, all inside one function call (atomic: any
-- failure rolls the whole statement back). Deleting the passport cascades its
-- passport_enrollments -> passport_item_progress. If a position is still tied to
-- training (roadmap_stations / training_sessions, owned by S4), the final delete
-- raises 23503 and the caller surfaces a friendly "still in use" message rather
-- than hard-deleting training data.
--
-- Permission: gated on setups.manage inside the function (the server action
-- checks it too), because SECURITY DEFINER bypasses the RLS that would normally
-- enforce it. auth.uid() is still the calling user inside a definer function.

create or replace function public.delete_position(p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('setups.manage') then
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

revoke all on function public.delete_position(uuid) from public;
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
  if not public.has_permission('setups.manage') then
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

revoke all on function public.delete_position_group(uuid) from public;
grant execute on function public.delete_position_group(uuid) to authenticated;
