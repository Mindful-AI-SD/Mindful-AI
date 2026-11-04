import {
  isWeekOnePrewritten,
  readPrewrittenRecord,
  type PrewrittenRecord,
  type WeekOnePrewritten,
} from "./prewritten-content";

// Week 1 keeps prewritten work in its own reflection_answers keys. The student's
// words stay separate from the fixed content, and neither touches
// generated_intentions, so changing modes cannot overwrite saved work. The saved
// result carries the content version it came from.
export const WEEK_ONE_PREWRITTEN_RESULT_KEY = "week_one_prewritten_result";
export const WEEK_ONE_PREWRITTEN_INTENTION_KEY = "week_one_prewritten_intention";
// Which path the student took most recently, when both exist after a mode change.
export const WEEK_ONE_EXPLORE_SOURCE_KEY = "week_one_explore_source";
// Includes the version, so answers never attach to different wording in a new pack.
export function weekOnePromptKey(contentVersion: string, index: number): string {
  return `week_one_prewritten_${contentVersion}_prompt_${index + 1}`;
}
export const MAX_PREWRITTEN_INTENTION_CHARACTERS = 500;

type Answers = Record<string, string> | null | undefined;

export function readWeekOnePrewritten(
  answers: Answers,
): PrewrittenRecord<WeekOnePrewritten> | null {
  const saved = answers?.[WEEK_ONE_PREWRITTEN_RESULT_KEY];
  if (!saved) return null;
  try {
    return readPrewrittenRecord(JSON.parse(saved), isWeekOnePrewritten);
  } catch {
    return null;
  }
}

export function hasWeekOnePrewrittenIntention(answers: Answers): boolean {
  return readWeekOnePrewritten(answers) !== null &&
    Boolean(answers?.[WEEK_ONE_PREWRITTEN_INTENTION_KEY]?.trim());
}

// True when the student's latest Explore result is a prewritten choice. Generated
// intentions from an earlier mode stay saved but do not decide the path.
export function isWeekOnePrewrittenPath(
  answers: Answers,
  generatedIntentionCount: number,
): boolean {
  if (!hasWeekOnePrewrittenIntention(answers)) return false;
  return generatedIntentionCount !== 3 ||
    answers?.[WEEK_ONE_EXPLORE_SOURCE_KEY] === "prewritten";
}

// Every prompt in the saved content version must be answered.
export function hasWeekOnePrewrittenReflection(answers: Answers): boolean {
  const record = readWeekOnePrewritten(answers);
  return record !== null && record.result.reflectionPrompts.every((_, index) =>
    Boolean(answers?.[weekOnePromptKey(record.contentVersion, index)]?.trim())
  );
}
