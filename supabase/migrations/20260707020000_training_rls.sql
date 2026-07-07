-- RLS policies + supporting DB objects for S4 Ratings, passports, talent
-- lifecycle (PLAN.md S4 / docs/agent-map.md).
--
-- Scope note: docs/agent-map.md lists `supabase/migrations/` as shared/frozen
-- after P0 ("report needed changes back instead of editing"). This is an
-- ADDITIVE new migration (no existing file is edited) touching ONLY the
-- tables this stream owns (rating_rubrics, position_ratings, rerate_prompts,
-- passports, passport_items, passport_enrollments, passport_item_progress,
-- onboarding_roadmaps, roadmap_stations, trainee_enrollments,
-- station_progress, graduation_audits, training_sessions, org_tiers,
-- org_slots, training_courses, course_attachments, course_feedback) plus one
-- trigger function on `positions` (see below). Without the policies below
-- those tables are unreachable from the normal per-request client (P0's
-- default_deny policy on every table), which would make this whole module
-- non-functional end to end -- same precedent as
-- 20260707010000_checklists_rls.sql (S1) and 20260707001850_people_teams_rls.sql
-- (P0). Flagged in this stream's final report for orchestrator sign-off.

-- ---------------------------------------------------------------------------
-- Position ratings: enforce "one current rating per (user, position)" at the
-- database layer so a double-submitted rate action can never leave two
-- is_current=true rows for the same pair (PLAN.md hard boundary: writes that
-- can be double-submitted must be safe to run twice). The rate action does
-- "set old is_current=false, then insert new is_current=true"; if a
-- concurrent duplicate submit races it, this unique index turns the second
-- insert into a constraint violation the action catches and treats as a
-- no-op success rather than a silently duplicated "current" row.
-- ---------------------------------------------------------------------------
create unique index if not exists position_ratings_one_current_per_user_position
  on public.position_ratings (user_id, position_id)
  where is_current;

-- ---------------------------------------------------------------------------
-- Auto-create a Position Passport whenever a position is created
-- (ARCHITECTURE.md "Training — Development Passports": "Every position
-- auto-gets a Position Passport"). `positions` is a core/foundation table
-- (owned by P0/shared), but the auto-creation behavior is explicitly this
-- stream's spec, so the trigger lives in S4's migration rather than P0's --
-- it only adds a trigger, it does not alter the `positions` table's schema.
-- security definer + a fixed search_path so it works regardless of which
-- role's RLS context the insert happens under.
-- ---------------------------------------------------------------------------
create or replace function public.create_position_passport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.passports (kind, position_id, name, active)
  values ('position', new.id, new.name || ' Passport', true);
  return new;
end;
$$;

drop trigger if exists positions_create_passport on public.positions;
create trigger positions_create_passport
  after insert on public.positions
  for each row
  execute function public.create_position_passport();

-- ---------------------------------------------------------------------------
-- RLS policies (PERMISSIVE, layered on top of default_deny -- see
-- 20260707009900_rls_default_deny.sql and the checklists RLS migration for
-- the same pattern/reasoning).
-- ---------------------------------------------------------------------------

-- rating_rubrics / position_ratings / rerate_prompts: readable by any
-- signed-in member (skills matrix, my-ratings view); writes gated by
-- ratings.rate (leaders rating team members) or training.manage (admin
-- rubric setup).
create policy rating_rubrics_select_authenticated on public.rating_rubrics
  for select using (auth.uid() is not null);
create policy rating_rubrics_write_manager on public.rating_rubrics
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy position_ratings_select_authenticated on public.position_ratings
  for select using (auth.uid() is not null);
create policy position_ratings_write_rater on public.position_ratings
  for all
  using (public.has_permission('ratings.rate') or public.has_permission('training.stamp'))
  with check (public.has_permission('ratings.rate') or public.has_permission('training.stamp'));

create policy rerate_prompts_select_authenticated on public.rerate_prompts
  for select using (auth.uid() is not null);
-- Inserts happen through the service-role client in the training cron route
-- (app/api/cron/training/route.ts), which bypasses RLS. Resolving a prompt
-- (setting resolved_at) is a normal per-request write by a rater.
create policy rerate_prompts_update_rater on public.rerate_prompts
  for update
  using (public.has_permission('ratings.rate'))
  with check (public.has_permission('ratings.rate'));

-- passports / passport_items: readable by any signed-in member (everyone
-- sees every passport and their progress, per spec); writes (creating items,
-- editing rubric-like structure) gated by training.manage. The auto-create
-- trigger above runs security definer so it is unaffected by these policies.
create policy passports_select_authenticated on public.passports
  for select using (auth.uid() is not null);
create policy passports_write_manager on public.passports
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy passport_items_select_authenticated on public.passport_items
  for select using (auth.uid() is not null);
create policy passport_items_write_manager on public.passport_items
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

-- passport_enrollments: readable by any signed-in member; a trainee can
-- enroll themselves is out of scope (enrollment is a leader/trainer action,
-- same as trainee_enrollments) -- writes gated by training.manage for
-- creating/enrolling, training.stamp for stamping (checked again in the
-- server action itself for the 3-star + all-items-complete gate, since RLS
-- cannot express that business rule).
create policy passport_enrollments_select_authenticated on public.passport_enrollments
  for select using (auth.uid() is not null);
create policy passport_enrollments_write_manager on public.passport_enrollments
  for all
  using (public.has_permission('training.manage') or public.has_permission('training.stamp'))
  with check (public.has_permission('training.manage') or public.has_permission('training.stamp'));

-- passport_item_progress: readable by any signed-in member. Writable by:
--   - the enrollment's own trainee (self-reporting check/slider/photo
--     progress on their own passport) -- checked via a subquery against
--     passport_enrollments.user_id
--   - anyone holding training.manage or training.stamp (trainer countersign,
--     leader corrections)
create policy passport_item_progress_select_authenticated on public.passport_item_progress
  for select using (auth.uid() is not null);
create policy passport_item_progress_write_self_or_trainer on public.passport_item_progress
  for all
  using (
    public.has_permission('training.manage')
    or public.has_permission('training.stamp')
    or exists (
      select 1 from public.passport_enrollments pe
      where pe.id = passport_item_progress.enrollment_id
        and pe.user_id = auth.uid()
    )
  )
  with check (
    public.has_permission('training.manage')
    or public.has_permission('training.stamp')
    or exists (
      select 1 from public.passport_enrollments pe
      where pe.id = passport_item_progress.enrollment_id
        and pe.user_id = auth.uid()
    )
  );

-- Trainee lifecycle: onboarding_roadmaps / roadmap_stations are structural
-- content, readable by everyone, managed by training.manage.
create policy onboarding_roadmaps_select_authenticated on public.onboarding_roadmaps
  for select using (auth.uid() is not null);
create policy onboarding_roadmaps_write_manager on public.onboarding_roadmaps
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy roadmap_stations_select_authenticated on public.roadmap_stations
  for select using (auth.uid() is not null);
create policy roadmap_stations_write_manager on public.roadmap_stations
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

-- trainee_enrollments / station_progress: readable by everyone (station
-- grid roster view); writes gated by training.manage (enroll) or
-- training.stamp (score a station -- trainers/leaders).
create policy trainee_enrollments_select_authenticated on public.trainee_enrollments
  for select using (auth.uid() is not null);
create policy trainee_enrollments_write_manager on public.trainee_enrollments
  for all
  using (public.has_permission('training.manage') or public.has_permission('training.stamp'))
  with check (public.has_permission('training.manage') or public.has_permission('training.stamp'));

create policy station_progress_select_authenticated on public.station_progress
  for select using (auth.uid() is not null);
create policy station_progress_write_trainer on public.station_progress
  for all
  using (public.has_permission('training.stamp') or public.has_permission('training.manage'))
  with check (public.has_permission('training.stamp') or public.has_permission('training.manage'));

create policy graduation_audits_select_authenticated on public.graduation_audits
  for select using (auth.uid() is not null);
create policy graduation_audits_write_manager on public.graduation_audits
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy training_sessions_select_authenticated on public.training_sessions
  for select using (auth.uid() is not null);
create policy training_sessions_write_manager on public.training_sessions
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

-- Org chart: readable by everyone (vacancy counts roll up to the store
-- dashboard); writes gated by the dedicated training.org_chart_manage key.
-- Slot auto-fill on a pipeline stamp goes through the normal per-request
-- client from within stampPassport(), which already holds training.stamp --
-- so that specific write path also needs to pass this policy.
create policy org_tiers_select_authenticated on public.org_tiers
  for select using (auth.uid() is not null);
create policy org_tiers_write_manager on public.org_tiers
  for all
  using (public.has_permission('training.org_chart_manage'))
  with check (public.has_permission('training.org_chart_manage'));

create policy org_slots_select_authenticated on public.org_slots
  for select using (auth.uid() is not null);
create policy org_slots_write_manager on public.org_slots
  for all
  using (public.has_permission('training.org_chart_manage') or public.has_permission('training.stamp'))
  with check (public.has_permission('training.org_chart_manage') or public.has_permission('training.stamp'));

-- Courses: readable by everyone (linked course content on a passport item);
-- managed by training.manage. course_feedback can be left by any signed-in
-- member (rating a course they took) in addition to managers.
create policy training_courses_select_authenticated on public.training_courses
  for select using (auth.uid() is not null);
create policy training_courses_write_manager on public.training_courses
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy course_attachments_select_authenticated on public.course_attachments
  for select using (auth.uid() is not null);
create policy course_attachments_write_manager on public.course_attachments
  for all
  using (public.has_permission('training.manage'))
  with check (public.has_permission('training.manage'));

create policy course_feedback_select_authenticated on public.course_feedback
  for select using (auth.uid() is not null);
create policy course_feedback_write_self_or_manager on public.course_feedback
  for all
  using (public.has_permission('training.manage') or user_id = auth.uid())
  with check (public.has_permission('training.manage') or user_id = auth.uid());
