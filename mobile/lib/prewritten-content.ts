// The non-AI path's content as it arrives from the server, plus the checks used
// on it. Pure: no network, no Supabase, no React. The content itself lives on the
// server (supabase/functions/_shared/prewritten/prewrittenContent.ts).

export type PrewrittenLabels = {
  modeTitle: string;
  modeDescription: string;
  disclosure: string;
  responseScreen: string;
  resultFooter: string;
};

export type WeekOnePrewritten = {
  instruction: string;
  examples: string[];
  reflectionPrompts: string[];
};

export type VocabularyGroup = { area: string; words: string[] };

export type WeekTwoPrewritten = {
  vocabulary: VocabularyGroup[];
  reflectionPrompts: string[];
};

export type PrewrittenRecord<Result> = {
  provider: "prewritten";
  contentVersion: string;
  labels: PrewrittenLabels;
  result: Result;
};

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Fields, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => actual.includes(key));
}

function isCopy(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 400;
}

function isCopyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isCopy);
}

const LABEL_KEYS = [
  "modeTitle",
  "modeDescription",
  "disclosure",
  "responseScreen",
  "resultFooter",
];

export function isPrewrittenLabels(value: unknown): value is PrewrittenLabels {
  return isFields(value) && hasOnlyKeys(value, LABEL_KEYS) &&
    LABEL_KEYS.every((key) => isCopy(value[key]));
}

export function isContentVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

export function isWeekOnePrewritten(value: unknown): value is WeekOnePrewritten {
  return isFields(value) &&
    hasOnlyKeys(value, ["instruction", "examples", "reflectionPrompts"]) &&
    isCopy(value.instruction) && isCopyList(value.examples) &&
    isCopyList(value.reflectionPrompts);
}

export function isWeekTwoPrewritten(value: unknown): value is WeekTwoPrewritten {
  return isFields(value) &&
    hasOnlyKeys(value, ["vocabulary", "reflectionPrompts"]) &&
    Array.isArray(value.vocabulary) && value.vocabulary.length > 0 &&
    value.vocabulary.every((group) =>
      isFields(group) && hasOnlyKeys(group, ["area", "words"]) &&
      isCopy(group.area) && isCopyList(group.words)
    ) && isCopyList(value.reflectionPrompts);
}

// Reads a saved or received record, so a corrupted saved value is treated as
// missing rather than shown as approved content.
export function readPrewrittenRecord<Result>(
  value: unknown,
  isResult: (result: unknown) => result is Result,
): PrewrittenRecord<Result> | null {
  if (
    !isFields(value) ||
    !hasOnlyKeys(value, ["provider", "contentVersion", "labels", "result"]) ||
    value.provider !== "prewritten" || !isContentVersion(value.contentVersion) ||
    !isPrewrittenLabels(value.labels) || !isResult(value.result)
  ) return null;
  return {
    provider: "prewritten",
    contentVersion: value.contentVersion,
    labels: value.labels,
    result: value.result,
  };
}

// How a generated result identifies its source to a student. Test data must never
// look like live AI output, and an unknown source claims nothing.
export function generatedSourceLabel(provider: string | undefined): string | null {
  if (provider === "claude") {
    return "AI-generated with Claude. These are possibilities, not facts about you.";
  }
  if (provider === "mock") return "Test data, not AI output.";
  return null;
}
