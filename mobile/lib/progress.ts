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