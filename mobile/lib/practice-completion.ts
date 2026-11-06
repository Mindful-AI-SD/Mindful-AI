
import type {
  PracticeConfig,
  PracticeMediaStatus,
} from "../src/components/practice-player.types";

export interface PracticeCompletionInput {
  config: PracticeConfig;
  elapsedActiveMs: number;
  mediaStatus: PracticeMediaStatus;
  hasPlayedMedia?: boolean;
  requestedFinish?: boolean;
}

function requiresMedia(config: PracticeConfig): boolean {
  return (
    config.requiresMedia === true ||
    config.media?.type === "audio" ||
    config.media?.type === "video"
  );
}

function hasValidMediaSource(config: PracticeConfig): boolean {
  const media = config.media;

  if (!media || media.type === "none") {
    return false;
  }

  if (typeof media.source === "string") {
    return media.source.trim().length > 0;
  }

  return (
    typeof media.source === "number" &&
    Number.isFinite(media.source) &&
    media.source > 0
  );
}

function isUsableMediaStatus(
  status: PracticeMediaStatus,
): boolean {
  return (
    status === "ready" ||
    status === "paused" ||
    status === "playing" ||
    status === "completed"
  );
}

export function canStartPractice(
  config: PracticeConfig,
  mediaStatus: PracticeMediaStatus,
): boolean {
  if (mediaStatus === "error") {
    return false;
  }

  if (!requiresMedia(config)) {
    return true;
  }

  return (
    hasValidMediaSource(config) &&
    isUsableMediaStatus(mediaStatus)
  );
}

export function canCompletePractice({
  config,
  elapsedActiveMs,
  mediaStatus,
  hasPlayedMedia = false,
  requestedFinish = false,

}: PracticeCompletionInput): boolean {
    if (config.completionAllowed === false) {
    return false;
  }

  if (
    !Number.isFinite(elapsedActiveMs) ||
    elapsedActiveMs < 0
  ) {
    return false;
  }

  if (!canStartPractice(config, mediaStatus)) {
    return false;
  }

  if (
    requiresMedia(config) &&
    !hasPlayedMedia
  ) {
    return false;
  }

  if (config.timing.type === "timed") {
    return (
      Number.isFinite(config.timing.durationMs) &&
      config.timing.durationMs > 0 &&
      elapsedActiveMs >= config.timing.durationMs
    );
  }

  return requestedFinish;
}
