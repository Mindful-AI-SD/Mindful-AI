import { supabase } from "./supabase";
import type { WeekOneProgress } from "./progress";

export type ProgressPatch = Partial<
  Pick<
    WeekOneProgress,
    | "status"
    | "current_step"
    | "writing"
    | "generated_intentions"
    | "reflection_answers"
    | "started_at"
    | "completed_at"
  >
>;

const columns =
  "user_id,activity_id,status,current_step,writing,generated_intentions,reflection_answers,started_at,completed_at,updated_at";
const allowed = new Set([
  "status",
  "current_step",
  "writing",
  "generated_intentions",
  "reflection_answers",
  "started_at",
  "completed_at",
]);

async function owner(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error("Sign in to access your progress.");
  }
  return data.user.id;
}

async function sameOwner(userId: string): Promise<void> {
  if (await owner() !== userId) {
    throw new Error("Your account changed. Please retry.");
  }
}

async function requireWeekOneActivity(activityId: string): Promise<void> {
  if (
    typeof activityId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      activityId,
    )
  ) {
    throw new Error("A valid activity ID is required.");
  }
  const { data, error } = await supabase.from("activities")
    .select("id,weeks!inner(week_number)")
    .eq("id", activityId).eq("weeks.week_number", 1).maybeSingle();
  if (error || !data) throw new Error("Week 1 activity is unavailable.");
}

function writablePatch(patch: ProgressPatch): ProgressPatch {
  if (
    !patch || typeof patch !== "object" || Array.isArray(patch) ||
    Object.keys(patch).some((key) => !allowed.has(key))
  ) {
    throw new Error("Unsupported progress fields.");
  }
  // Copy only own, allowed, defined properties. Ownership and updated_at can
  // never be supplied by a caller, even from untyped JavaScript/JSON.
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}

/** Returns null when the signed-in user has no row for this Week 1 activity. */
export async function loadWeekOneProgress(
  activityId: string,
): Promise<WeekOneProgress | null> {
  const userId = await owner();
  await requireWeekOneActivity(activityId);
  await sameOwner(userId);
  const { data, error } = await supabase.from("progress").select(columns)
    .eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
  if (error) throw new Error("Could not load progress. Please retry.");
  await sameOwner(userId);
  return data as WeekOneProgress | null;
}

/**
 * Partial upsert: omitted columns retain their values; new rows use DB defaults.
 * JSON fields are replaced as a whole. Completion/status consistency is enforced
 * by the existing database constraint; this helper does not implement step gating.
 */
export async function upsertWeekOneProgress(
  activityId: string,
  patch: ProgressPatch,
): Promise<WeekOneProgress> {
  const userId = await owner();
  const values = writablePatch(patch);
  await requireWeekOneActivity(activityId);
  await sameOwner(userId);
  const { data, error } = await supabase.from("progress").upsert(
    { ...values, user_id: userId, activity_id: activityId },
    { onConflict: "user_id,activity_id", defaultToNull: false },
  ).select(columns).single();
  if (error || !data) throw new Error("Could not save progress. Please retry.");
  await sameOwner(userId);
  return data as WeekOneProgress;
}
