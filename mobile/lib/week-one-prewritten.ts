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
export const WEEK_ONE_PREWRITTEN_PROMPT_KEYS = [
  "week_one_prewritten_prompt_1",
  "week_one_prewritten_prompt_2",
  "week_one_prewritten_prompt_3",
  "week_one_prewritten_prompt_4",
] as const;
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

export function hasWeekOnePrewrittenReflection(answers: Answers): boolean {
  return WEEK_ONE_PREWRITTEN_PROMPT_KEYS.every((key) =>
    Boolean(answers?.[key]?.trim())
  );
}
