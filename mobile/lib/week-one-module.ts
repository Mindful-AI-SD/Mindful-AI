import type { BeatId, FourBeats, WeekContent } from "./four-beat-curriculum";
import type { ReflectionAnswers, WeekOneStep } from "./progress";
import { hasArrivalRatings } from "./week-one-arrival";

export const WEEK_ONE_BEATS: FourBeats = [
  {
    id: "arrive",
    title: "Arrive",
    description: "Rate your mood and energy before practicing.",
  },
  {
    id: "practice",
    title: "Practice",
    description:
      "Breathe, then notice how you feel in the post-practice check-in.",
  },
  {
    id: "explore",
    title: "Explore",
    description:
      "Write at least 150 words in Intention Mirror and review three intentions.",
  },
  {
    id: "notice",
    title: "Notice",
    description:
      "Reflect on your data self-portrait and what the intentions got right, missed, and revealed. Save your reflections to complete Week 1.",
  },
];

export const WEEK_ONE_CONTENT: WeekContent = {
  weekNumber: 1,
  title: "Week 1",
  beats: WEEK_ONE_BEATS,
  contentSource: {
    kind: "existing-implementation",
    reference:
      "mobile/lib/week-one-module.ts (existing Week 1 overview descriptions)",
  },
};

export type WeekOneOverviewStep = WeekOneStep | "yellowdig_draft";

// Keep every persisted WeekOneStep unchanged. This is an overview projection,
// not a progress conversion or a new set of completion/navigation rules.
export const WEEK_ONE_STEP_BEATS = {
  breathing: "practice",
  post_breathing_check_in: "practice",
  writing: "explore",
  intention_mirror: "explore",
  data_self_portrait: "notice",
  ai_gap_reflection: "notice",
  yellowdig_draft: "notice",
  completed: "notice",
} as const satisfies Record<WeekOneOverviewStep, BeatId>;

export function weekOneBeatId(
  step: WeekOneOverviewStep,
  answers?: ReflectionAnswers,
): BeatId {
  if (step !== "completed" && answers && !hasArrivalRatings(answers)) {
    return "arrive";
  }
  return WEEK_ONE_STEP_BEATS[step];
}

export function weekOneStepLabel(
  step: WeekOneOverviewStep,
  answers?: ReflectionAnswers,
): string {
  if (step !== "completed" && answers && !hasArrivalRatings(answers)) {
    return "Arrive";
  }
  return step.replaceAll("_", " ");
}
