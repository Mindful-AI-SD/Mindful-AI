import { supabase } from "./supabase";
import { WEEK_ONE_STEPS, type ReflectionAnswers, type WeekOneProgress, type WeekOneStep } from "./progress";

async function requireOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error("Sign in again to restore your progress.");
}

export async function getWeekOneProgress(userId: string, activityId: string): Promise<WeekOneProgress | null> {
  await requireOwner(userId);
  const { data, error } = await supabase.from("progress").select("*")
    .eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
  if (error) throw new Error("Could not load your Week 1 progress. Please retry.");
  await requireOwner(userId);
  if (data && !WEEK_ONE_STEPS.includes(data.current_step)) {
    throw new Error("Your saved step could not be opened. Please retry loading progress.");
  }
  return data;
}

export async function startWeekOne(userId: string, activityId: string): Promise<WeekOneProgress> {
  const existing = await getWeekOneProgress(userId, activityId);
  if (existing) {
    // Earlier frontend versions saved data without updating the default step.
    if (existing.status === "not_started" && existing.writing?.trim()) {
      const step = existing.generated_intentions.length === 3 ? "intention_mirror" : "writing";
      return updateStep(existing, step, {});
    }
    return existing;
  }
  await requireOwner(userId);
  const { error } = await supabase.from("progress").upsert({
    user_id: userId, activity_id: activityId, current_step: "breathing",
    status: "in_progress", started_at: new Date().toISOString(),
  }, { onConflict: "user_id,activity_id", ignoreDuplicates: true });
  if (error) throw new Error("Could not start Week 1. Please retry.");
  const progress = await getWeekOneProgress(userId, activityId);
  if (!progress) throw new Error("Could not restore Week 1 after starting. Please retry.");
  return progress;
}

async function updateStep(progress: WeekOneProgress, step: WeekOneStep, answers: ReflectionAnswers) {
  await requireOwner(progress.user_id);
  const { data, error } = await supabase.from("progress").update({
    current_step: step,
    status: step === "completed" ? "completed" : "in_progress",
    started_at: progress.started_at ?? new Date().toISOString(),
    completed_at: step === "completed" ? (progress.completed_at ?? new Date().toISOString()) : null,
    reflection_answers: { ...progress.reflection_answers, ...answers },
  }).eq("user_id", progress.user_id).eq("activity_id", progress.activity_id)
    .eq("current_step", progress.current_step).eq("updated_at", progress.updated_at)
    .select("*").maybeSingle();
  if (error) throw new Error("Could not save your Week 1 progress. Your current screen is unchanged. Please retry.");
  if (!data) throw new Error("Your progress changed while saving. Reload progress before continuing.");
  await requireOwner(progress.user_id);
  return data as WeekOneProgress;
}

const REQUIRED_ANSWERS: Partial<Record<WeekOneStep, string[]>> = {
  post_breathing_check_in: ["post_breathing_urge"],
  data_self_portrait: ["data_self_portrait_visible", "data_self_portrait_missing"],
  ai_gap_reflection: ["ai_gap_got_right", "ai_gap_missed", "ai_gap_reveals"],
  yellowdig_draft: ["yellowdig_draft"],
};

export async function saveWeekOneStep(
  userId: string, activityId: string, expectedStep: WeekOneStep,
  answers: ReflectionAnswers = {}, advance = true,
): Promise<WeekOneProgress> {
  const progress = await getWeekOneProgress(userId, activityId);
  if (!progress || progress.current_step !== expectedStep) {
    throw new Error("Your saved step changed. Reload progress before continuing.");
  }
  if (expectedStep === "completed") return progress;
  const allAnswers = { ...progress.reflection_answers, ...answers };
  if (advance) {
    if ((REQUIRED_ANSWERS[expectedStep] ?? []).some(key => !allAnswers[key]?.trim())) {
      throw new Error("Answer each question before continuing.");
    }
    if (expectedStep === "writing" &&
      (!progress.writing?.trim() || progress.generated_intentions.length !== 3)) {
      throw new Error("Save your writing and generate three intentions before continuing.");
    }
  }
  const next = advance ? WEEK_ONE_STEPS[WEEK_ONE_STEPS.indexOf(expectedStep) + 1] : expectedStep;
  return updateStep(progress, next, answers);
}

export async function returnToWriting(userId: string, activityId: string): Promise<WeekOneProgress> {
  const progress = await getWeekOneProgress(userId, activityId);
  if (!progress) throw new Error("Could not find your saved writing. Please reload progress.");
  return updateStep(progress, "writing", {});
}
