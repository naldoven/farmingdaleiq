-- RLS: enable on every table in public, with a default-deny policy.
-- PLAN.md P0 #2: "RLS enabled on every table with a default-deny policy."
--
-- This runs last (highest timestamp) so it automatically covers every table
-- created above without hand-listing ~50 table names. The policy is
-- PERMISSIVE (the default), not RESTRICTIVE, with `using (false)`: Postgres
-- OR's multiple permissive policies together, so when a later stream (P1)
-- adds its own permissive policy granting real access, the combined
-- behavior is simply that policy's condition — `false OR condition`. If this
-- were a restrictive policy it would AND with every other policy and block
-- everything forever, which is NOT what we want here.
--
-- The has_permission() function itself and the auth trigger are exempt:
-- they are functions, not tables.

do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t.tablename);
    execute format('drop policy if exists default_deny on public.%I;', t.tablename);
    execute format(
      'create policy default_deny on public.%I for all using (false) with check (false);',
      t.tablename
    );
  end loop;
end $$;
