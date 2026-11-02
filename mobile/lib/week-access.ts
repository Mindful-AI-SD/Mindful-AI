import { getPublishedWeek } from "./curriculum";
import { getActivityProgress } from "./progress";
import { supabase } from "./supabase";

export type SequentialWeek = 1 | 2 | 3;
export type WeekAccessResult = {
  weekNumber: SequentialWeek;
  allowed: boolean;
  requiredWeek: 1 | 2 | null;
  message: string;
};

async function requireOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !userId || data.session?.user.id !== userId) throw new Error("Sign in again to check week access.");
}

/** Shared frontend navigation result. Always reads saved server state; never
 * writes completion, uses local fixture baselines, or grants backend authority.
 * A week is satisfied only when every published activity has a saved completed
 * status AND timestamp. Missing/empty curriculum cannot establish completion.
 */
export async function getWeekAccess(userId: string, weekNumber: SequentialWeek): Promise<WeekAccessResult> {
  if (![1, 2, 3].includes(weekNumber)) throw new Error("This week link is invalid.");
  await requireOwner(userId);
  for (let earlier = 1; earlier < weekNumber; earlier++) {
    const requiredWeek = earlier as 1 | 2;
    const week = await getPublishedWeek(requiredWeek);
    const ids = week.activities.map(activity => activity.id);
    const progress = await getActivityProgress(userId, ids);
    await requireOwner(userId);
    if (!ids.length || !ids.every(id => progress.some(item => item.activity_id === id &&
      item.status === "completed" && !!item.completed_at && Number.isFinite(Date.parse(item.completed_at))))) {
      return { weekNumber, allowed: false, requiredWeek, message: `Complete Week ${requiredWeek} before opening Week ${weekNumber}.` };
    }
  }
  await requireOwner(userId);
  return { weekNumber, allowed: true, requiredWeek: null, message: `Week ${weekNumber} is available.` };
}

/** Resolve a legacy activity deep link to its published parent before gating it.
 * Never trust an activity ID paired with a caller-supplied week number.
 */
export async function getActivityWeek(userId: string, activityId: string): Promise<SequentialWeek> {
  await requireOwner(userId);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(activityId)) throw new Error("This activity link is invalid.");
  const { data, error } = await supabase.from("activities")
    .select("id, weeks!inner(week_number, is_published)").eq("id", activityId).eq("is_published", true).maybeSingle();
  await requireOwner(userId);
  const row = data as unknown as { id: string; weeks: { week_number: number; is_published: boolean } } | null;
  if (error || !row || row.id !== activityId || !row.weeks?.is_published || ![1, 2, 3].includes(row.weeks.week_number)) throw new Error("This published activity is unavailable.");
  return row.weeks.week_number as SequentialWeek;
}
