/** Read-side curriculum metadata, independent of player/session configuration. */
export type MediaSource =
  | Readonly<{ kind: "url"; url: string }>
  | Readonly<{ kind: "reference"; id: string }>;

export type MediaTranscript =
  | Readonly<{ kind: "inline"; text: string }>
  | Readonly<{ kind: "reference"; source: MediaSource }>;

export type CurriculumMedia = Readonly<{
  type: "audio" | "video";
  source: MediaSource;
  /** File duration in seconds; omit when unknown. Not a completion timer. */
  durationSeconds?: number;
  transcript?: MediaTranscript;
  attribution?: string;
  alternativeInstructions?: string;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isMediaSource(value: unknown): value is MediaSource {
  if (!record(value)) return false;
  if (value.kind === "reference") {
    return keys(value, ["kind", "id"]) && text(value.id);
  }
  if (
    value.kind !== "url" || !keys(value, ["kind", "url"]) || !text(value.url)
  ) return false;
  try {
    const url = new URL(value.url);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function isTranscript(value: unknown): value is MediaTranscript {
  if (!record(value)) return false;
  if (value.kind === "inline") {
    return keys(value, ["kind", "text"]) && text(value.text);
  }
  return value.kind === "reference" && keys(value, ["kind", "source"]) &&
    isMediaSource(value.source);
}

/** Reject malformed metadata; never fetch, resolve, upload, or echo its contents. */
export function isCurriculumMedia(value: unknown): value is CurriculumMedia {
  if (
    !record(value) ||
    !keys(value, [
      "type",
      "source",
      "durationSeconds",
      "transcript",
      "attribution",
      "alternativeInstructions",
    ])
  ) return false;
  if (
    (value.type !== "audio" && value.type !== "video") ||
    !isMediaSource(value.source)
  ) return false;
  if (
    value.durationSeconds !== undefined &&
    (typeof value.durationSeconds !== "number" ||
      !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0)
  ) return false;
  if (value.transcript !== undefined && !isTranscript(value.transcript)) {
    return false;
  }
  return ["attribution", "alternativeInstructions"].every((key) =>
    value[key] === undefined || text(value[key])
  );
}
