import type { FourBeats } from "../src/components/four-beat-module-shell";
import type { ReflectionAnswers, WeekOneStep } from "./progress";
import { hasArrivalRatings } from "./week-one-arrival";

export const WEEK_ONE_BEATS: FourBeats = [
  { id: "arrive", title: "Arrive", description: "Rate your mood and energy before practicing." },
  { id: "practice", title: "Practice", description: "Breathe, then notice how you feel in the post-practice check-in." },
  { id: "explore", title: "Explore", description: "Write at least 150 words in Intention Mirror and review three intentions." },
  { id: "reflection", title: "Integration reflection", description: "Reflect on your data self-portrait and what the intentions got right, missed, and revealed." },
];

export function weekOneBeatId(step: WeekOneStep, answers?: ReflectionAnswers): string {
  if (step !== "completed" && answers && !hasArrivalRatings(answers)) return "arrive";
  switch (step) {
    case "breathing": case "post_breathing_check_in": return "practice";
    case "writing": case "intention_mirror": return "explore";
    default: return "reflection";
  }
}

export function weekOneStepLabel(step: WeekOneStep, answers?: ReflectionAnswers): string {
  if (step !== "completed" && answers && !hasArrivalRatings(answers)) return "Arrive";
  return step.replaceAll("_", " ");
}
