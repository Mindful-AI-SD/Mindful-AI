import { supabase } from "./supabase";

export const WEEK_ONE_STEPS = [
  "breathing",
  "post_breathing_check_in",
  "writing",
  "intention_mirror",
  "data_self_portrait",
  "ai_gap_reflection",
  "yellowdig_draft",
  "completed",
] as const;

export type WeekOneStep = (typeof WEEK_ONE_STEPS)[number];

export type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type GeneratedIntention = {
  title: string;
  explanation: string;
};

export type ReflectionAnswers = Record<string, string>;

export type WeekOneProgress = {
  user_id: string;
  activity_id: string;
  status: ProgressStatus;
  current_step: WeekOneStep;
  writing: string | null;
  generated_intentions: GeneratedIntention[];
  reflection_answers: ReflectionAnswers;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

async function requireDraftOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) {
    throw new Error("Sign in again to access your saved writing.");
  }
}

export async function getProgressWriting(
  userId: string,
  activityId: string,
): Promise<string> {
  await requireDraftOwner(userId);
  const { data, error } = await supabase
    .from("progress")
    .select("writing")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) throw new Error("Could not load your saved writing. Please retry.");
  await requireDraftOwner(userId);
  return data?.writing ?? "";
}

export async function saveProgressWriting(
  userId: string,
  activityId: string,
  writing: string,
): Promise<void> {
  await requireDraftOwner(userId);
  // Only update writing; preserve completion and all other progress fields.
  const { data, error } = await supabase
    .from("progress")
    .upsert(
      { user_id: userId, activity_id: activityId, writing },
      { onConflict: "user_id,activity_id" },
    )
    .select("user_id")
    .single();

  if (error || !data) {
    throw new Error("Could not save your writing. Please retry.");
  }
}
