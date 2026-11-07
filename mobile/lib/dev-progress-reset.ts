import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";
import { clearBreathingSession } from "./breathing-session-storage";

export type DebugWeekNumber = 1 | 2 | 3;

type PublishedActivityRow = {
  id: string;
  weeks: { week_number: number; is_published: boolean };
};

function requireDevelopmentBuild() {
  if (!__DEV__) {
    throw new Error("Development progress tools are unavailable in production builds.");
  }
}

async function requireSignedInUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (error || !userId) {
    throw new Error("Sign in again before changing development progress.");
  }
  return userId;
}

async function getPublishedActivitiesBetween(
  firstWeek: DebugWeekNumber,
  lastWeek: DebugWeekNumber,
): Promise<PublishedActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, weeks!inner(week_number, is_published)")
    .eq("is_published", true)
    .eq("weeks.is_published", true)
    .gte("weeks.week_number", firstWeek)
    .lte("weeks.week_number", lastWeek);

  if (error) {
    throw new Error("Could not load the published curriculum. Please retry.");
  }

  return (data ?? []) as unknown as PublishedActivityRow[];
}

function requireEveryWeekHasActivities(
  rows: PublishedActivityRow[],
  firstWeek: DebugWeekNumber,
  lastWeek: DebugWeekNumber,
) {
  for (let week = firstWeek; week <= lastWeek; week += 1) {
    if (!rows.some((row) => row.weeks.week_number === week)) {
      throw new Error(`Published Week ${week} has no activities to update.`);
    }
  }
}

async function clearLocalProgress(userId: string, activityIds: string[]) {
  await Promise.all(
    activityIds.map((activityId) => clearBreathingSession(userId, activityId)),
  );

  const activityIdSet = new Set(activityIds);
  const localKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = localKeys.filter((key) => {
    const weekThreePrefix = `week-three-screen-fixture:v1:${userId}:`;
    if (key.startsWith(weekThreePrefix)) {
      return activityIdSet.has(key.slice(weekThreePrefix.length));
    }

    const practicePrefix = `module-practice:${userId}:`;
    if (!key.startsWith(practicePrefix)) return false;
    return activityIds.some((activityId) =>
      key.startsWith(`${practicePrefix}${activityId}:`)
    );
  });

  if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
}

/** Reset the selected week and every later published week. Keeping earlier
 * weeks intact creates a valid sequential test state without leaving later
 * completion records behind an incomplete prerequisite.
 */
export async function resetSignedInProgressFromWeekForDevelopment(
  firstWeek: DebugWeekNumber,
): Promise<number> {
  requireDevelopmentBuild();
  const userId = await requireSignedInUserId();
  const rows = await getPublishedActivitiesBetween(firstWeek, 3);
  if (!rows.some((row) => row.weeks.week_number === firstWeek)) {
    throw new Error(`Published Week ${firstWeek} has no activities to reset.`);
  }

  const activityIds = [...new Set(rows.map((row) => row.id))];
  await clearLocalProgress(userId, activityIds);

  const { data, error } = await supabase
    .from("progress")
    .delete()
    .eq("user_id", userId)
    .in("activity_id", activityIds)
    .select("activity_id");

  if (error) {
    throw new Error(`Could not reset progress from Week ${firstWeek}. Please retry.`);
  }

  return data?.length ?? 0;
}

/** Mark every published activity from Week 1 through the selected week as
 * complete for the active account. This intentionally bypasses activity flow
 * validation and is therefore guarded by __DEV__.
 */
export async function completeSignedInProgressThroughWeekForDevelopment(
  lastWeek: DebugWeekNumber,
): Promise<number> {
  requireDevelopmentBuild();
  const userId = await requireSignedInUserId();
  const rows = await getPublishedActivitiesBetween(1, lastWeek);
  requireEveryWeekHasActivities(rows, 1, lastWeek);

  const completedAt = new Date().toISOString();
  const records = [...new Set(rows.map((row) => row.id))].map((activityId) => ({
    user_id: userId,
    activity_id: activityId,
    status: "completed",
    current_step: "completed",
    started_at: completedAt,
    completed_at: completedAt,
  }));

  const { data, error } = await supabase
    .from("progress")
    .upsert(records, { onConflict: "user_id,activity_id" })
    .select("activity_id");

  if (error) {
    throw new Error(`Could not complete progress through Week ${lastWeek}. Please retry.`);
  }

  return data?.length ?? 0;
}

export async function resetSignedInWeekOneProgressForDevelopment(
  activityIds: string[],
): Promise<number> {
  requireDevelopmentBuild();

  const weekOneActivityIds = [...new Set(activityIds)];
  if (weekOneActivityIds.length === 0) return 0;

  const userId = await requireSignedInUserId();

  await clearLocalProgress(userId, weekOneActivityIds);

  const { data, error } = await supabase
    .from("progress")
    .delete()
    .eq("user_id", userId)
    .in("activity_id", weekOneActivityIds)
    .select("activity_id");

  if (error) {
    throw new Error("Could not reset your Week 1 progress. Please retry.");
  }

  return data?.length ?? 0;
}
