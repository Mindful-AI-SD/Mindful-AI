
export type WeekOnePracticeId =
  | "breathing_426"
  | "mindful_walking";

export interface WeekOnePractice {
  id: WeekOnePracticeId;
  title: string;
  description: string;
  durationMs: number;
  instructions: string[];
}

export const WEEK_ONE_PRACTICES: Record<
  WeekOnePracticeId,
  WeekOnePractice
> = {
  breathing_426: {
    id: "breathing_426",
    title: "4-2-6 Breathing",
    description:
      "Follow a gentle breathing rhythm to practice mindfulness.",
    durationMs: 10 * 60 * 1000,
    instructions: [
      "Inhale gently for 4 seconds.",
      "Hold comfortably for 2 seconds.",
      "Exhale slowly for 6 seconds.",
      "Repeat at a comfortable pace. Breathe normally if needed.",
    ],
  },

  mindful_walking: {
    id: "mindful_walking",
    title: "Mindful Walking",
    description:
      "Practice noticing your surroundings and movements.",
    durationMs: 10 * 60 * 1000,
    instructions: [
      "Choose a safe, comfortable place to practice.",
      "Walk at your natural pace or remain seated.",
      "Notice how your body feels.",
      "Pay attention to sounds and your surroundings.",
      "Bring your attention back whenever it wanders.",
    ],
  },
};

export function getWeekOnePractice(
  id: WeekOnePracticeId,
): WeekOnePractice {
  return WEEK_ONE_PRACTICES[id];
}
