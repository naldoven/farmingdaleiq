-- Guest Recovery: the store phone number shown to app (Spotlight) guests moves
-- from a Vercel environment variable to a setting a manager can change.
--
-- The settings function gains a fourth argument with a default, so the version
-- of the app that is still running (which sends three) keeps working. Until the
-- new app is live, saving settings from the old one would clear the number;
-- nothing is stored yet, so there is nothing to lose.

alter table public.guest_recovery_settings
  add column if not exists store_phone text
    check (store_phone is null or char_length(store_phone) between 7 and 30);

drop function if exists public.save_guest_recovery_settings(int, uuid, uuid);

-- Managers set the expiry, the overseer, the backup and the store phone number.
-- Both people must be able to work the list. Applies to new recoveries only.
-- Returns 'saved' or 'bad_person'. An empty phone number clears it.
create or replace function public.save_guest_recovery_settings(
  p_expiry_days int,
  p_overseer uuid,
  p_backup uuid,
  p_store_phone text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(btrim(p_store_phone), '');
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.manage') then
    raise exception 'You do not have permission to change these settings' using errcode = '42501';
  end if;
  if p_expiry_days is null or p_expiry_days not between 7 and 365 then
    raise exception 'Expiry must be between 7 and 365 days' using errcode = '22023';
  end if;
  if v_phone is not null and (char_length(v_phone) not between 7 and 30 or v_phone !~ '^[0-9()+.\s-]+$') then
    raise exception 'Enter the store phone number with digits, spaces, dashes and parentheses' using errcode = '22023';
  end if;
  if (p_overseer is not null and not public.guest_recovery_can_work(p_overseer))
     or (p_backup is not null and not public.guest_recovery_can_work(p_backup)) then
    return 'bad_person';
  end if;

  update public.guest_recovery_settings
  set expiry_days = p_expiry_days,
      -- Naming a different overseer starts them "on": the old person's day off
      -- must not silence the new one.
      overseer_off = case when overseer_id is distinct from p_overseer then false else overseer_off end,
      overseer_id = p_overseer,
      backup_id = p_backup,
      store_phone = v_phone,
      updated_by = auth.uid(),
      updated_at = now()
  where id;
  return 'saved';
end;
$$;

revoke all on function public.save_guest_recovery_settings(int, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.save_guest_recovery_settings(int, uuid, uuid, text) to authenticated;
