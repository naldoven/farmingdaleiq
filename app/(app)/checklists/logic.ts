/**
 * Pure business logic for Checklists (ARCHITECTURE.md "Checklists"). Kept
 * free of Supabase/Next imports so it is unit-testable without a DB and safely
 * importable from both server actions/pages and the client run-player form.
 *
 * Schema note: `checklist_questions` (supabase/migrations/20260707000700_
 * checklists.sql) has no dedicated "holding mode" column for temperature
 * questions -- ARCHITECTURE.md says "a temperature question picks which
 * holding mode applies" (cold vs hot) but the only free-form slot on the
 * question row is the existing `choices jsonb` column (otherwise used for
 * multi_choice option lists). A question is only ever one `type`, so this
 * stream repurposes `choices` to hold `{ holding_mode: "cold" | "hot" }` for
 * temperature questions instead of adding a migration column. Documented here
 * so the choice is findable; flagged for the P2/P3 schema review in case a
 * dedicated column is preferred later.
 */

export const QUESTION_TYPES = [
  "yes_no",
  "number",
  "temperature",
  "text",
  "multi_choice",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const HOLDING_MODES = ["cold", "hot"] as const;
export type HoldingMode = (typeof HOLDING_MODES)[number];

export const SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly", "persistent"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export interface QuestionLike {
  id: string;
  type: string;
  allow_na: boolean;
  choices: unknown;
  food_item_id: string | null;
  photo_required: boolean;
}

export interface FoodItemRangeLike {
  cold_min_f: number | null;
  cold_max_f: number | null;
  hot_min_f: number | null;
  hot_max_f: number | null;
}

export interface TemperatureRange {
  min: number | null;
  max: number | null;
}

export type AnswerValue = string | number | boolean | null;

export interface AnswerInput {
  questionId: string;
  value: AnswerValue;
  isNa: boolean;
  manuallyFlagged: boolean;
  correctiveActionNote?: string | null;
  comment?: string | null;
  photoUrl?: string | null;
}

export interface EvaluatedAnswer {
  flagged: boolean;
  requiresCorrectiveAction: boolean;
}

/** Reads the holding mode a temperature question was built for (defaults to "cold"). */
export function getHoldingMode(question: Pick<QuestionLike, "choices">): HoldingMode {
  const choices = question.choices;
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    const mode = (choices as Record<string, unknown>).holding_mode;
    if (mode === "hot") return "hot";
  }
  return "cold";
}

/** Reads the multi_choice option list (empty array for any other question type). */
export function getMultiChoiceOptions(question: Pick<QuestionLike, "choices">): string[] {
  const choices = question.choices;
  if (Array.isArray(choices)) {
    return choices.filter((c): c is string => typeof c === "string");
  }
  return [];
}

/** Resolves the compliant [min, max] range for a food item under a holding mode. */
export function getTemperatureRange(
  foodItem: FoodItemRangeLike | null | undefined,
  mode: HoldingMode,
): TemperatureRange {
  if (!foodItem) return { min: null, max: null };
  return mode === "hot"
    ? { min: foodItem.hot_min_f, max: foodItem.hot_max_f }
    : { min: foodItem.cold_min_f, max: foodItem.cold_max_f };
}

export function isTemperatureOutOfRange(value: number, range: TemperatureRange): boolean {
  if (!Number.isFinite(value)) return false;
  if (range.min !== null && value < range.min) return true;
  if (range.max !== null && value > range.max) return true;
  return false;
}

/**
 * Decides whether an answer is flagged and whether it forces a corrective
 * action note before the run can complete (ARCHITECTURE.md: "An out-of-range
 * reading forces a corrective action before the checklist can proceed").
 * A user can also manually flag any answer type for follow-up ("we build it
 * for all types from day one").
 */
export function evaluateAnswer(
  question: QuestionLike,
  foodItem: FoodItemRangeLike | null | undefined,
  input: Pick<AnswerInput, "value" | "isNa" | "manuallyFlagged">,
): EvaluatedAnswer {
  if (input.isNa) {
    return { flagged: false, requiresCorrectiveAction: false };
  }

  if (question.type === "temperature") {
    const mode = getHoldingMode(question);
    const range = getTemperatureRange(foodItem, mode);
    const numeric = typeof input.value === "number" ? input.value : Number(input.value);
    const outOfRange = isTemperatureOutOfRange(numeric, range);
    return {
      flagged: outOfRange || Boolean(input.manuallyFlagged),
      requiresCorrectiveAction: outOfRange,
    };
  }

  if (question.type === "yes_no") {
    const failed = input.value === false;
    return { flagged: failed || Boolean(input.manuallyFlagged), requiresCorrectiveAction: false };
  }

  return { flagged: Boolean(input.manuallyFlagged), requiresCorrectiveAction: false };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export interface SubmissionError {
  questionId: string;
  message: string;
}

/**
 * Validates that a run's answers are complete enough to finish: every
 * question answered (or N/A'd where allowed), photo attached where required,
 * and a corrective action note present for every out-of-range temperature
 * reading.
 */
export function validateSubmission(
  questions: QuestionLike[],
  answers: Map<string, AnswerInput>,
  foodItemsById: Map<string, FoodItemRangeLike>,
): SubmissionError[] {
  const errors: SubmissionError[] = [];

  for (const question of questions) {
    const answer = answers.get(question.id);
    if (!answer) {
      errors.push({ questionId: question.id, message: "This question needs an answer." });
      continue;
    }

    if (answer.isNa) {
      if (!question.allow_na) {
        errors.push({ questionId: question.id, message: "N/A is not allowed for this question." });
      }
      continue;
    }

    if (isBlank(answer.value)) {
      errors.push({ questionId: question.id, message: "This question needs an answer." });
      continue;
    }

    if (question.photo_required && isBlank(answer.photoUrl)) {
      errors.push({ questionId: question.id, message: "A photo is required." });
    }

    const foodItem = question.food_item_id ? foodItemsById.get(question.food_item_id) : undefined;
    const evaluated = evaluateAnswer(question, foodItem, answer);
    if (evaluated.requiresCorrectiveAction && isBlank(answer.correctiveActionNote)) {
      errors.push({
        questionId: question.id,
        message: "An out-of-range reading needs a corrective action note before you can finish.",
      });
    }
  }

  return errors;
}

export interface AnswerFlagLike {
  id: string;
  flagged: boolean;
}

/**
 * Idempotent follow-up planning: only proposes a follow_ups insert for a
 * flagged answer that doesn't already have one (safe to call on every
 * completeRun attempt, including retries of an already-completed run).
 */
export function planFollowUpInserts(
  answers: AnswerFlagLike[],
  existingSourceAnswerIds: Set<string>,
): { source_answer_id: string }[] {
  return answers
    .filter((a) => a.flagged && !existingSourceAnswerIds.has(a.id))
    .map((a) => ({ source_answer_id: a.id }));
}

export interface StoreLocalNow {
  /** YYYY-MM-DD in the store's timezone. */
  date: string;
  /** HH:MM:SS (24h) in the store's timezone. */
  timeOfDay: string;
  /**
   * A Date whose LOCAL calendar fields (getDay()/getDate()) equal the
   * store-local weekday / day-of-month, so isScheduleDueOn reads store-local
   * values regardless of the server runtime's own timezone.
   */
  localDate: Date;
}

/**
 * Derives the store-local "now" from a UTC instant (FIQ-12). The checklists
 * cron must compare against stores.timezone (America/New_York), not the UTC
 * server clock: otherwise runs are flagged 'missed' up to 5 hours early and,
 * between 19:00-24:00 ET, the date/day rolls forward and schedules
 * materialize for the wrong calendar day. Pure + unit-testable.
 */
export function storeLocalNow(now: Date, timeZone: string): StoreLocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Some engines emit "24" for midnight under hour12:false; normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  const minute = get("minute");
  const second = get("second");

  return {
    date: `${year}-${month}-${day}`,
    timeOfDay: `${hour}:${minute}:${second}`,
    localDate: new Date(Number(year), Number(month) - 1, Number(day)),
  };
}

/** Normalizes a "HH:MM" or "HH:MM:SS" time-of-day string to zero-padded HH:MM:SS. */
function normalizeTimeOfDay(value: string): string {
  const [h = "00", m = "00", s = "00"] = value.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

/**
 * Whether the store-local clock is still before a schedule's start_time, i.e.
 * the run is not yet open for completion (ARCHITECTURE.md "Checklists":
 * "a start_time that blocks early completion"). Both arguments are store-local
 * times-of-day; a missing start_time means "always open". Postgres `time`
 * columns serialize as "HH:MM:SS", and storeLocalNow().timeOfDay matches, so a
 * lexicographic compare after normalization is exact.
 */
export function isBeforeStartTime(
  startTime: string | null | undefined,
  nowTimeOfDay: string,
): boolean {
  if (!startTime) return false;
  return normalizeTimeOfDay(nowTimeOfDay) < normalizeTimeOfDay(startTime);
}

export interface QuestionTokenLike {
  id: string;
  token_value?: number | null;
}

export interface AnswerStateLike {
  question_id: string;
  is_na: boolean;
}

/**
 * Sums the per-question `token_value` across the questions a run actually
 * answered (an answer row is present and it isn't N/A), so a completion event
 * can carry the real reward for the work done (ARCHITECTURE.md: a checklist
 * question "can carry its own token_value"). N/A'd and unanswered questions
 * earn nothing. The tokens consumer treats a 0 sum as "fall back to the flat
 * earning rule", so returning 0 here is intentional and safe.
 */
export function sumAnsweredTokenValue(
  questions: QuestionTokenLike[],
  answers: AnswerStateLike[],
): number {
  const answeredNonNa = new Set(answers.filter((a) => !a.is_na).map((a) => a.question_id));
  return questions.reduce((sum, q) => {
    if (!answeredNonNa.has(q.id)) return sum;
    const value = typeof q.token_value === "number" ? q.token_value : 0;
    return value > 0 ? sum + value : sum;
  }, 0);
}

/**
 * Builds the exact `checklist_complete` payload completeRun emits. Extracted as
 * a pure function so the cross-module contract test can push the REAL producer
 * shape through the REAL tokens consumer (resolveAwardsForEvents) instead of a
 * fabricated one -- the field-name drift this fixes is precisely what per-side
 * fabricated fixtures hid. Canonical keys: `user_id` (the completer, the token
 * recipient), `actor_id` (same person, recorded separately per the contract),
 * and `token_value` (summed per-question value; 0 tells the consumer to fall
 * back to the flat earning rule). Returns a plain record so it satisfies the
 * EventPayload contract at the emit boundary.
 */
export function buildChecklistCompletePayload(input: {
  runId: string;
  templateId: string;
  completedBy: string | null;
  tokenValue: number;
  flaggedCount: number;
  followUpsCreated: number;
}): Record<string, unknown> {
  return {
    runId: input.runId,
    templateId: input.templateId,
    user_id: input.completedBy,
    actor_id: input.completedBy,
    token_value: input.tokenValue,
    flaggedCount: input.flaggedCount,
    followUpsCreated: input.followUpsCreated,
  };
}

/** Short human title for a follow-up, derived from the source question prompt. */
export function buildFollowUpTitle(questionPrompt: string | null | undefined): string {
  const prompt = questionPrompt?.trim();
  return prompt ? `Follow-up: ${prompt}` : "Checklist follow-up";
}

/** Detail line for a follow-up, tying it back to the source question and template. */
export function buildFollowUpDescription(
  questionPrompt: string | null | undefined,
  templateName: string | null | undefined,
): string {
  const prompt = questionPrompt?.trim();
  const template = templateName?.trim();
  if (prompt && template) return `Follow up on "${prompt}" flagged in ${template}.`;
  if (prompt) return `Follow up on "${prompt}".`;
  if (template) return `Follow up on a flagged answer in ${template}.`;
  return "Follow up on a flagged checklist answer.";
}

/** Due timestamp for a new follow-up: a fixed window (default 24h) after completion. */
export function followUpDueAt(now: Date, hours = 24): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Builds the `follow_up_assigned` payload with the canonical event-contract
 * field names (follow_up_id, source_answer_id, run_id, title, description,
 * user_id=assignee, nullable) so the tasks system-task consumer and the
 * notification recipient extractor both resolve it.
 */
export function buildFollowUpEventPayload(input: {
  followUpId: string | null;
  sourceAnswerId: string;
  runId: string;
  title: string;
  description: string;
  assigneeId: string | null;
}): Record<string, unknown> {
  return {
    follow_up_id: input.followUpId,
    source_answer_id: input.sourceAnswerId,
    run_id: input.runId,
    title: input.title,
    description: input.description,
    user_id: input.assigneeId,
  };
}

export interface ScheduleLike {
  frequency: string;
  days_of_week: number[] | null;
  day_of_month: number | null;
}

/**
 * Whether a schedule should materialize a run for `date`. `persistent`
 * schedules are "always available" (ARCHITECTURE.md "Checklists" ->
 * "Scheduling"), so they materialize every day the same as `daily`; the run
 * itself just isn't subject to a missed/overdue alert (see
 * `app/api/cron/checklists/route.ts`). `date.getDay()` matches Postgres
 * `extract(dow from date)` (0 = Sunday .. 6 = Saturday).
 */
export function isScheduleDueOn(schedule: ScheduleLike, date: Date): boolean {
  switch (schedule.frequency) {
    case "daily":
    case "persistent":
      return true;
    case "weekly":
      return (schedule.days_of_week ?? []).includes(date.getDay());
    case "monthly":
      return schedule.day_of_month != null && date.getDate() === schedule.day_of_month;
    default:
      return false;
  }
}
