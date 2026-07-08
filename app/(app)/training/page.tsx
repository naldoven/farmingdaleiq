import { ProgressBar, SectionCard, StatusBadge } from "@/components/mobile";
import { CreateCourseForm } from "@/components/training/create-course-form";
import { PassportCard } from "@/components/training/passport-card";
import { TrainingPageTabs } from "@/components/training/training-page-tabs";
import { TrainingRoster, type RosterRow } from "@/components/training/training-roster";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { CourseAttachmentsPanel } from "@/app/(app)/training/course-attachments-panel";
import { CourseFeedbackForm } from "@/app/(app)/training/course-feedback-form";

/**
 * /training — Passports: my progress, all passports, trainer sign-offs,
 * leader stamping; admin: passport items, courses.
 * ARCHITECTURE.md "Training — Development Passports".
 *
 * Restyled to the KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md,
 * "PROGRESS lists"): the default section is a filterable roster of every
 * enrollment (TrainingRoster), with the original per-passport detail view,
 * "My Progress", and "Courses" content kept as sibling sections. Visual/
 * layout only -- same queries, actions, and permission checks as before.
 */
export default async function TrainingPage() {
  await requirePermission("training.view");
  const canManage = await hasPermission("training.manage");
  const canStamp = await hasPermission("training.stamp");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;

  const [
    { data: profiles },
    { data: passports },
    { data: items },
    { data: enrollments },
    { data: progress },
    { data: ratings },
    { data: courses },
    { data: vendors },
    { data: attachments },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase
      .from("passports")
      .select("id, kind, name, position_id, target_role_id, org_tier_id, active")
      .eq("active", true)
      .order("name"),
    supabase.from("passport_items").select("id, passport_id, type, label, sort, course_id"),
    supabase
      .from("passport_enrollments")
      .select("id, passport_id, user_id, track, started_at, stamped_at"),
    supabase.from("passport_item_progress").select("enrollment_id, item_id, completed_at"),
    supabase.from("position_ratings").select("user_id, position_id, stars").eq("is_current", true),
    supabase.from("training_courses").select("id, name, description, content, vendor_id, sort").order("sort"),
    supabase.from("vendors").select("id, name"),
    supabase.from("course_attachments").select("id, course_id, file_url, label"),
  ]);

  const people = profiles ?? [];
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const starsByUserPosition = new Map(
    (ratings ?? []).map((r) => [`${r.user_id}:${r.position_id}`, r.stars]),
  );

  const positionPassports = (passports ?? []).filter((p) => p.kind === "position");
  const leadershipPassports = (passports ?? []).filter((p) => p.kind === "leadership");

  const myEnrollments = (enrollments ?? []).filter((e) => e.user_id === currentUserId);

  // Flat roster row per enrollment, across every active passport -- the
  // KitchenIQ "Training" screen shows one scrollable list, not per-passport
  // tabs.
  const rosterRows: RosterRow[] = (enrollments ?? []).map((e) => {
    const passport = (passports ?? []).find((p) => p.id === e.passport_id);
    const passportItems = (items ?? []).filter((i) => i.passport_id === e.passport_id);
    const enrollmentProgress = (progress ?? []).filter((p) => p.enrollment_id === e.id);
    const completedItemIds = new Set(
      enrollmentProgress.filter((p) => p.completed_at !== null).map((p) => p.item_id),
    );
    const completed = passportItems.filter((i) => completedItemIds.has(i.id)).length;
    return {
      enrollmentId: e.id,
      userName: nameById.get(e.user_id) ?? "Unknown",
      passportName: passport?.name ?? "Passport",
      startedAt: e.started_at,
      completed,
      total: passportItems.length,
      stamped: e.stamped_at !== null,
    };
  });

  function buildCardProps(passport: NonNullable<typeof passports>[number]) {
    const passportItems = (items ?? []).filter((i) => i.passport_id === passport.id);
    const passportEnrollments = (enrollments ?? [])
      .filter((e) => e.passport_id === passport.id)
      .map((e) => ({
        id: e.id,
        userId: e.user_id,
        userName: nameById.get(e.user_id) ?? "Unknown",
        track: e.track,
        stampedAt: e.stamped_at,
      }));
    const progressByEnrollment: Record<string, { itemId: string; completedAt: string | null }[]> = {};
    for (const e of passportEnrollments) {
      progressByEnrollment[e.id] = (progress ?? [])
        .filter((p) => p.enrollment_id === e.id)
        .map((p) => ({ itemId: p.item_id, completedAt: p.completed_at }));
    }
    const currentStarsByUser: Record<string, number | null> = {};
    for (const e of passportEnrollments) {
      currentStarsByUser[e.userId] =
        passport.position_id !== null ? starsByUserPosition.get(`${e.userId}:${passport.position_id}`) ?? null : null;
    }

    return {
      passportId: passport.id,
      passportName: passport.name,
      kind: passport.kind as "position" | "leadership",
      items: passportItems.map((i) => ({
        id: i.id,
        type: i.type as "check" | "slider" | "photo" | "signature" | "course",
        label: i.label,
        sort: i.sort,
        course_id: i.course_id,
      })),
      enrollments: passportEnrollments,
      progress: progressByEnrollment,
      people,
      canManage,
      canStamp,
      currentUserId,
      currentStarsByUser,
    };
  }

  const myProgressContent = (
    <SectionCard title="My Progress">
      {myEnrollments.length === 0 ? (
        <p className="text-[13px] text-muted-ink">You aren&apos;t enrolled on any passports yet.</p>
      ) : (
        <div className="-mx-4 flex flex-col divide-y divide-line">
          {myEnrollments.map((e) => {
            const passport = (passports ?? []).find((p) => p.id === e.passport_id);
            const passportItems = (items ?? []).filter((i) => i.passport_id === e.passport_id);
            const myProgress = (progress ?? []).filter((p) => p.enrollment_id === e.id);
            const completedIds = new Set(myProgress.filter((p) => p.completed_at !== null).map((p) => p.item_id));
            const pct = passportItems.length > 0 ? (completedIds.size / passportItems.length) * 100 : 0;
            return (
              <div key={e.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-semibold text-ink">{passport?.name ?? "Passport"}</p>
                  <StatusBadge tone={e.stamped_at ? "success" : "warning"} dot>
                    {e.stamped_at ? "Stamped" : "In progress"}
                  </StatusBadge>
                </div>
                <ProgressBar
                  value={pct}
                  tone={e.stamped_at ? "success" : "accent"}
                  label={`${completedIds.size}/${passportItems.length} items`}
                  showLabel
                />
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const passportsContent = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-muted-ink">Position Passports</p>
        {positionPassports.map((passport) => (
          <PassportCard key={passport.id} {...buildCardProps(passport)} />
        ))}
        {positionPassports.length === 0 && (
          <p className="text-[13px] text-muted-ink">No position passports yet (created automatically per position).</p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-muted-ink">Leadership Passports</p>
        {leadershipPassports.map((passport) => (
          <PassportCard key={passport.id} {...buildCardProps(passport)} />
        ))}
        {leadershipPassports.length === 0 && <p className="text-[13px] text-muted-ink">No leadership passports yet.</p>}
      </div>
    </div>
  );

  const coursesContent = (
    <div className="flex flex-col gap-4">
      <SectionCard title={`Courses (${(courses ?? []).length})`}>
        <div className="flex flex-col gap-4">
          {(courses ?? []).map((c) => {
            const courseAttachments = (attachments ?? [])
              .filter((a) => a.course_id === c.id)
              .map((a) => ({ id: a.id, fileUrl: a.file_url, label: a.label }));
            const vendorName = c.vendor_id ? vendorNameById.get(c.vendor_id) : null;
            return (
              <div key={c.id} className="flex flex-col gap-1 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-ink">{c.name}</p>
                  {vendorName && <StatusBadge tone="neutral">{vendorName}</StatusBadge>}
                </div>
                {c.description && <p className="text-[13px] text-muted-ink">{c.description}</p>}
                {c.content && <p className="whitespace-pre-wrap text-[13px] text-ink">{c.content}</p>}
                <CourseAttachmentsPanel courseId={c.id} attachments={courseAttachments} canManage={canManage} />
                <CourseFeedbackForm courseId={c.id} />
              </div>
            );
          })}
          {(courses ?? []).length === 0 && <p className="text-[13px] text-muted-ink">No courses yet.</p>}
        </div>
      </SectionCard>
      {canManage && (
        <SectionCard title="Add a course">
          <CreateCourseForm />
        </SectionCard>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <TrainingPageTabs
        tabs={[
          { key: "progress", label: "Progress", content: <TrainingRoster rows={rosterRows} /> },
          { key: "mine", label: "My Progress", content: myProgressContent },
          { key: "passports", label: "Passports", content: passportsContent },
          { key: "courses", label: "Courses", content: coursesContent },
        ]}
      />
    </div>
  );
}
