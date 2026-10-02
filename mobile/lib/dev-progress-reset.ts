import { supabase } from "./supabase";
import { clearBreathingSession } from "./breathing-session-storage";

export async function resetSignedInWeekOneProgressForDevelopment(
  activityIds: string[],
): Promise<number> {
  if (!__DEV__) {
    throw new Error("The progress reset is unavailable in production builds.");
  }

  const weekOneActivityIds = [...new Set(activityIds)];
  if (weekOneActivityIds.length === 0) return 0;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (sessionError || !userId) {
    throw new Error("Sign in again before resetting development progress.");
  }

  await Promise.all(
    weekOneActivityIds.map((activityId) => clearBreathingSession(userId, activityId)),
  );

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
