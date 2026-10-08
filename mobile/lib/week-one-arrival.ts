import type { ReflectionAnswers } from "./progress";

export function hasArrivalRatings(answers: ReflectionAnswers): boolean {
  return /^[1-5]$/.test(answers.arrive_mood ?? "") && /^[1-5]$/.test(answers.arrive_energy ?? "");
}
