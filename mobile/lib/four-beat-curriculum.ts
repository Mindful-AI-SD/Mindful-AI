import { type CurriculumMedia, isCurriculumMedia } from "./curriculum-media";

/** Overview IDs are independent of legacy activity steps and database row IDs. */
export const BEAT_IDS = ["arrive", "practice", "explore", "notice"] as const;
export type BeatId = (typeof BEAT_IDS)[number];
export const BEAT_TITLES = {
  arrive: "Arrive",
  practice: "Practice",
  explore: "Explore",
  notice: "Notice",
} as const;

export type ModuleBeat<Id extends BeatId = BeatId> = Readonly<{
  id: Id;
  title: (typeof BEAT_TITLES)[Id];
  description: string;
  media?: CurriculumMedia;
}>;

/** Tuple positions enforce the canonical order, not merely a count of four. */
export type FourBeats = readonly [
  ModuleBeat<"arrive">,
  ModuleBeat<"practice">,
  ModuleBeat<"explore">,
  ModuleBeat<"notice">,
];

export type WeekContent = Readonly<{
  weekNumber: number;
  title: string;
  beats: FourBeats;
  contentSource:
    | Readonly<
      { kind: "existing-implementation" | "sponsor"; reference: string }
    >
    | Readonly<{ kind: "missing-sponsor-content"; reason: string }>;
}>;

/** Proposed logical answer payload; this is NOT the existing progress row. */
export type BeatAnswers = Readonly<Record<string, string>>;
export type WeekBeatAnswers = Readonly<Partial<Record<BeatId, BeatAnswers>>>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate authored/sample JSON without importing React, Expo, or Supabase. */
export function isWeekContent(value: unknown): value is WeekContent {
  if (
    !record(value) || !Number.isInteger(value.weekNumber) ||
    typeof value.weekNumber !== "number" || value.weekNumber < 1 ||
    value.weekNumber > 8 || !text(value.title) ||
    !Array.isArray(value.beats) || value.beats.length !== 4 ||
    !record(value.contentSource)
  ) return false;
  const beats = value.beats;
  const source = value.contentSource;
  const missing = source.kind === "missing-sponsor-content";
  if (
    missing
      ? !text(source.reason)
      : (source.kind !== "existing-implementation" &&
        source.kind !== "sponsor") || !text(source.reference)
  ) {
    return false;
  }
  return BEAT_IDS.every((id, index) => {
    const beat = beats[index];
    return record(beat) && beat.id === id && beat.title === BEAT_TITLES[id] &&
      (missing ? beat.description === "" : text(beat.description)) &&
      (beat.media === undefined || isCurriculumMedia(beat.media));
  });
}

/** Missing beat = no answers yet; an empty map/string does not imply completion. */
export function isWeekBeatAnswers(value: unknown): value is WeekBeatAnswers {
  return record(value) &&
    Object.entries(value).every(([id, answers]) =>
      BEAT_IDS.some((beat) => beat === id) && record(answers) &&
      Object.entries(answers).every(([key, answer]) =>
        text(key) && typeof answer === "string"
      )
    );
}

/** Read-only boundary for decoded curriculum configuration; never writes storage. */
export function parseWeekContent(value: unknown): WeekContent {
  if (!isWeekContent(value)) {
    throw new Error("The curriculum configuration is invalid.");
  }
  return value;
}
