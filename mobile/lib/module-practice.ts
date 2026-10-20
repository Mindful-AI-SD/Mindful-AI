import { parseWeekContent, type WeekContent } from "./four-beat-curriculum";
import type { CurriculumMedia } from "./curriculum-media";

export type ModulePractice = Readonly<{
  id: string; title: string; instructions: string;
  durationMs?: number; media?: CurriculumMedia;
  legacyBreathing?: boolean; unavailable?: string;
}>;

/** Published week.description may carry the shared WeekContent JSON contract. */
export function decodeModuleContent(description: string | null, weekNumber: number): WeekContent | undefined {
  if (!description?.trim().startsWith("{")) return undefined;
  const content = parseWeekContent(JSON.parse(description));
  if (content.weekNumber !== weekNumber) throw new Error("Practice content belongs to another week.");
  return content;
}

export function modulePractice(weekNumber: 1 | 2, description: string | null = null, durationMinutes?: number | null): ModulePractice {
  try {
    const module = decodeModuleContent(description, weekNumber);
    if (module) {
      const beat = module.beats[1];
      if (module.contentSource.kind === "missing-sponsor-content") {
        return { id: `week-${weekNumber}-practice`, title: "Practice", instructions: "", unavailable: "Practice guidance is pending." };
      }
      return { id: `week-${weekNumber}-practice`, title: beat.title, instructions: beat.description, media: beat.media,
        durationMs: !beat.media && durationMinutes && durationMinutes > 0 ? durationMinutes * 60000 : undefined };
    }
    return weekNumber === 1
      ? { id: "week-1-breathing", title: "Mindful breathing", instructions: "", durationMs: 600000, legacyBreathing: true }
      : { id: "week-2-body-awareness", title: "Body awareness", instructions: "Take a quiet moment to notice sensations in your body without judging them. When you are ready, describe what you noticed in Explore." };
  } catch {
    return { id: `week-${weekNumber}-practice`, title: "Practice", instructions: "", unavailable: "Practice configuration could not be read. Return to the curriculum and retry." };
  }
}

export function practiceSessionId(config: ModulePractice): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(config)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${config.id}:${(hash >>> 0).toString(16)}`;
}
