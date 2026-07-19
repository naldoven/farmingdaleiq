-- TR3 (audit iter 1, HIGH): graduating a trainee from the Station Grid did
-- three UNGUARDED writes in sequence -- flip trainee_enrollments.status to
-- 'graduated', emit graduation_ready, insert graduation_audits. An interrupt
-- after the status flip left the trainee 'graduated' with NO audit row, and
-- because the flip is conditional on status='active', a re-run never
-- re-entered the block: the trainee was stuck graduated, unrecoverable.
--
-- Fix: move the status flip + audit insert into one SECURITY DEFINER function
-- so they commit together or not at all. The function is idempotent and
-- self-healing:
--   * active            -> flip to graduated + create the audit (fresh grad).
--   * graduated, no audit -> create the missing audit (recovery path for a
--                            pre-fix partial run). Reports graduated=false so
--                            the caller does not re-emit graduation_ready.
--   * graduated + audit  -> no-op.
--   * pip / other        -> no-op (not a graduation path).
-- A row lock on the enrollment serializes two concurrent last-station scores:
-- the first graduates + audits and commits; the rest observe 'graduated' with
-- the audit already present. The caller now invokes this on EVERY completed
-- roadmap (not only when status='active'), which is what makes the recovery
-- path reachable.
--
-- Audit due date is computed here (graduated_on + 30) instead of being passed
-- in, so the recovery path re-derives the correct original 30-day window from
-- the stored graduation date. This mirrors auditDueDate() in
-- app/(app)/training/graduates/logic.ts (GRADUATION_AUDIT_DELAY_DAYS = 30).
--
-- Idempotent migration: create or replace the function.

create or replace function public.graduate_trainee(p_enrollment_id uuid)
returns table(graduated boolean, audit_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_graduated_on date;
  v_has_audit boolean;
  v_did_graduate boolean := false;
  v_did_create_audit boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Scoring the last station (the caller) is gated by training.stamp; managers
  -- (training.manage) may also drive the grid. Either may finalize graduation.
  if not (public.has_permission('training.stamp') or public.has_permission('training.manage')) then
    raise exception 'Missing permission: training.stamp';
  end if;

  -- Lock the enrollment so two last-station scores can't both graduate and
  -- both insert an audit: the first runs to completion and commits, the rest
  -- block here, then observe status='graduated' with the audit already there.
  select status, graduated_on
    into v_status, v_graduated_on
  from public.trainee_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  if v_status = 'active' then
    update public.trainee_enrollments
      set status = 'graduated',
          graduated_on = coalesce(graduated_on, current_date)
    where id = p_enrollment_id
    returning graduated_on into v_graduated_on;
    v_did_graduate := true;
  elsif v_status <> 'graduated' then
    -- 'pip' or any non-graduation status: leave it alone.
    graduated := false;
    audit_created := false;
    return next;
    return;
  end if;

  -- Ensure exactly one audit row. Covers the recovery case where a pre-fix
  -- partial run flipped status to graduated but never inserted the audit.
  select exists (
    select 1 from public.graduation_audits where enrollment_id = p_enrollment_id
  ) into v_has_audit;

  if not v_has_audit then
    insert into public.graduation_audits (enrollment_id, due_on)
    values (p_enrollment_id, coalesce(v_graduated_on, current_date) + 30);
    v_did_create_audit := true;
  end if;

  graduated := v_did_graduate;
  audit_created := v_did_create_audit;
  return next;
end;
$$;

revoke all on function public.graduate_trainee(uuid) from public;
grant execute on function public.graduate_trainee(uuid) to authenticated;
