/**
 * Shared shaping helper for rendering PassportCard from raw Supabase rows.
 * Used by both /training (position + leadership tabs) and /training/pipelines
 * (leadership only) so the two pages don't duplicate the join logic.
 */

export interface RawPassport {
  id: string;
  kind: string;
  name: string;
  position_id: string | null;
  target_role_id: string | null;
  org_tier_id: string | null;
  active: boolean;
}

export interface RawPassportItem {
  id: string;
  passport_id: string;
  type: string;
  label: string;
  sort: number;
  course_id: string | null;
}

export interface RawEnrollment {
  id: string;
  passport_id: string;
  user_id: string;
  track: string | null;
  stamped_at: string | null;
}

export interface RawProgress {
  enrollment_id: string;
  item_id: string;
  completed_at: string | null;
}

export interface RawRating {
  user_id: string | null;
  position_id: string | null;
  stars: number;
}

export function buildPassportCardProps(
  passport: RawPassport,
  all: {
    items: RawPassportItem[];
    enrollments: RawEnrollment[];
    progress: RawProgress[];
    ratings: RawRating[];
    nameById: Map<string, string>;
    people: { id: string; name: string }[];
    canManage: boolean;
    canStamp: boolean;
    currentUserId: string | null;
  },
) {
  const passportItems = all.items.filter((i) => i.passport_id === passport.id);
  const passportEnrollments = all.enrollments
    .filter((e) => e.passport_id === passport.id)
    .map((e) => ({
      id: e.id,
      userId: e.user_id,
      userName: all.nameById.get(e.user_id) ?? "Unknown",
      track: e.track,
      stampedAt: e.stamped_at,
    }));

  const progressByEnrollment: Record<string, { itemId: string; completedAt: string | null }[]> = {};
  for (const e of passportEnrollments) {
    progressByEnrollment[e.id] = all.progress
      .filter((p) => p.enrollment_id === e.id)
      .map((p) => ({ itemId: p.item_id, completedAt: p.completed_at }));
  }

  const currentStarsByUser: Record<string, number | null> = {};
  for (const e of passportEnrollments) {
    currentStarsByUser[e.userId] = passport.position_id
      ? all.ratings.find((r) => r.user_id === e.userId && r.position_id === passport.position_id)?.stars ?? null
      : null;
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
    people: all.people,
    canManage: all.canManage,
    canStamp: all.canStamp,
    currentUserId: all.currentUserId,
    currentStarsByUser,
  };
}
