import { supabase } from "./supabase";
import { isBodyRegion, readWeekTwoRecord, requireWeekTwoOwner, type BodyRegion, type WeekTwoRecord } from "./week-two-arrival";
import type { ReflectionAnswers } from "./progress";
import type { SensationLexiconData } from "./sensation-lexicon";

export const WEEK_TWO_BEATS = ["Arrive", "Practice", "Explore", "Notice"] as const;
export type WeekTwoStep = "week_two_arrive" | "week_two_practice" | "week_two_explore" | "week_two_notice" | "completed";
export type LexiconWords = Extract<SensationLexiconData, { kind: "words" }>;
export type WeekTwoProgress = {
  region: BodyRegion | null;
  step: WeekTwoStep;
  answers: ReflectionAnswers;
  lexicon: LexiconWords | null;
  status: "not_started" | "in_progress" | "completed";
  completedAt: string | null;
};
export const SENSATION_KEYS = ["week_two_sensation_1", "week_two_sensation_2", "week_two_sensation_3"] as const;
const editableKeys = new Set<string>([...SENSATION_KEYS, "week_two_lexicon", "week_two_practice_complete", "week_two_tracker_reflection", "week_two_closing_reflection"]);
export function weekTwoAnswerPatch(answers: ReflectionAnswers): ReflectionAnswers {
  return Object.fromEntries(Object.entries(answers).filter(([key]) => editableKeys.has(key)));
}

export function sensationsFrom(answers: ReflectionAnswers): [string, string, string] {
  return SENSATION_KEYS.map(key => (answers[key] ?? "").trim()) as [string, string, string];
}
export function validSensations(answers: ReflectionAnswers): boolean {
  return sensationsFrom(answers).every(value => value.length >= 2 && value.length <= 80);
}

function lexiconFrom(answers: ReflectionAnswers): LexiconWords | null {
  if (!answers.week_two_lexicon || !validSensations(answers)) return null;
  try {
    const value = JSON.parse(answers.week_two_lexicon);
    const sensations = sensationsFrom(answers);
    if (value.kind !== "words" || typeof value.provider !== "string" || !value.provider.trim() ||
        !Array.isArray(value.items) || value.items.length !== 3 ||
        !value.items.every((item: { original: unknown; isVague: unknown; suggestions: unknown }, index: number) =>
          item && item.original === sensations[index] && typeof item.isVague === "boolean" &&
          Array.isArray(item.suggestions) && (item.isVague ? item.suggestions.length >= 1 && item.suggestions.length <= 5 : item.suggestions.length === 0) &&
          item.suggestions.every(word => typeof word === "string" && word.trim().length > 0 && word.length <= 80))) return null;
    return value as LexiconWords;
  } catch { return null; }
}

export function restoreWeekTwo(record: WeekTwoRecord | null): WeekTwoProgress {
  const answers = record?.reflection_answers ?? {};
  if (typeof answers !== "object" || Array.isArray(answers) || Object.values(answers).some(value => typeof value !== "string")) {
    throw new Error("Could not read your saved Week 2 answers. Please retry.");
  }
  const region = isBodyRegion(answers.arrive_body_region) ? answers.arrive_body_region : null;
  if (answers.arrive_body_region != null && !region) throw new Error("Your saved location could not be read. Please retry loading.");
  const lexicon = lexiconFrom(answers);
  let step: WeekTwoStep = "week_two_arrive";
  if (region && record) {
    if (record.current_step === "week_two_arrive") step = "week_two_arrive";
    else if (record.current_step === "week_two_practice" || answers.week_two_practice_complete !== "yes") step = "week_two_practice";
    else if (!lexicon || record.current_step === "week_two_explore") step = "week_two_explore";
    else if (record.status === "completed" && record.completed_at &&
      answers.week_two_tracker_reflection?.trim() && answers.week_two_closing_reflection?.trim()) step = "completed";
    else step = "week_two_notice";
  }
  return { region, step, answers, lexicon, status: step === "completed" ? "completed" : record ? "in_progress" : "not_started", completedAt: step === "completed" ? record!.completed_at! : null };
}

export async function loadWeekTwoProgress(userId: string, activityId: string): Promise<WeekTwoProgress> {
  return restoreWeekTwo(await readWeekTwoRecord(userId, activityId));
}

export async function saveWeekTwoAnswers(
  userId: string, activityId: string, expectedStep: WeekTwoStep,
  patch: ReflectionAnswers, nextStep: WeekTwoStep = expectedStep,
): Promise<WeekTwoProgress> {
  if (Object.entries(patch).some(([key, value]) => !editableKeys.has(key) || typeof value !== "string" ||
      (key !== "week_two_lexicon" && value.length > 2000) || (key === "week_two_lexicon" && value.length > 8000))) {
    throw new Error("Unsupported Week 2 answers.");
  }
  const existing = await readWeekTwoRecord(userId, activityId);
  if (!existing) throw new Error("Save your body-map check-in before continuing.");
  const current = restoreWeekTwo(existing);
  if (existing.status === "completed") {
    if (nextStep === "completed") return current;
    throw new Error("Week 2 is already complete. Return to the curriculum.");
  }
  if (current.step !== expectedStep) throw new Error("Your saved step changed. Reload Week 2 before continuing.");
  const transitions: Record<WeekTwoStep, WeekTwoStep[]> = {
    week_two_arrive: ["week_two_arrive", "week_two_practice"],
    week_two_practice: ["week_two_practice", "week_two_explore"],
    week_two_explore: ["week_two_explore", "week_two_practice", "week_two_notice"],
    week_two_notice: ["week_two_notice", "week_two_explore", "completed"],
    completed: ["completed"],
  };
  if (!transitions[current.step].includes(nextStep)) throw new Error("Complete each Week 2 beat in order.");
  const answers = { ...existing.reflection_answers, ...patch };
  // Editing the student's sensations invalidates results for the previous input.
  if (SENSATION_KEYS.some(key => key in patch && patch[key] !== existing.reflection_answers[key]) && !("week_two_lexicon" in patch)) answers.week_two_lexicon = "";
  const lexicon = lexiconFrom(answers);
  if ((nextStep === "week_two_explore" || nextStep === "week_two_notice" || nextStep === "completed") && answers.week_two_practice_complete !== "yes") {
    throw new Error("Finish Practice before continuing to Explore.");
  }
  if ((nextStep === "week_two_notice" || nextStep === "completed") && !lexicon) throw new Error("Generate and save words for all three sensations before continuing.");
  if (patch.week_two_lexicon && !lexicon) throw new Error("The saved Sensation Lexicon result does not match your sensations. Please retry.");
  if (nextStep === "completed" && (!answers.week_two_tracker_reflection?.trim() || !answers.week_two_closing_reflection?.trim())) {
    throw new Error("Answer the tracker question and closing reflection before completing Week 2.");
  }
  await requireWeekTwoOwner(userId);
  const complete = nextStep === "completed";
  const { data, error } = await supabase.from("progress").update({
    reflection_answers: answers, current_step: nextStep,
    status: complete ? "completed" : "in_progress",
    completed_at: complete ? new Date().toISOString() : null,
  }).eq("user_id", userId).eq("activity_id", activityId).eq("current_step", existing.current_step).eq("updated_at", existing.updated_at)
    .select("reflection_answers,current_step,status,started_at,updated_at,completed_at").maybeSingle();
  if (error) throw new Error("Could not save Week 2. Your answers are still here. Please retry.");
  if (!data) throw new Error("Your progress changed while saving. Reload Week 2 before continuing.");
  await requireWeekTwoOwner(userId);
  return restoreWeekTwo(data);
}
