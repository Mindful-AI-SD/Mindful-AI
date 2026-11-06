
import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  DistractionTapEvent,
  PracticeSession,
} from "../src/components/practice-player.types";

interface SavedPracticeSession extends PracticeSession {
  mediaVerified: boolean;
}

function storageKey(userId: string, practiceId: string) {
  return `practice-session:${userId}:${practiceId}`;
}

function isValidDistractionEvents(
  value: unknown,
): value is DistractionTapEvent[] {
  if (!Array.isArray(value) || value.length > 300) {
    return false;
  }

  const ids = new Set<string>();

  return value.every((item) => {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return false;
    }

    const event = item as Record<string, unknown>;
    const id = event.id;
    const at = event.at;
    const label = event.label;

    if (
      typeof id !== "string" ||
      id.trim().length < 1 ||
      id.trim().length > 64 ||
      typeof at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(at) ||
      !Number.isFinite(Date.parse(at)) ||
      typeof label !== "string" ||
      label.trim().length < 1 ||
      label.trim().length > 40 ||
      ids.has(id)
    ) {
      return false;
    }

    ids.add(id);
    return true;
  });
}

export async function savePracticeSession(
  userId: string,
  session: PracticeSession,
  mediaVerified = false,
): Promise<void> {
  const saved: SavedPracticeSession = {
    ...session,
    mediaVerified,
    // Never save an active timer as actively running
    // in a way that could count background time.
    state:
      session.state === "running"
        ? "paused"
        : session.state,
    lastSavedAt: Date.now(),
  };

  await AsyncStorage.setItem(
    storageKey(userId, session.practiceId),
    JSON.stringify(saved),
  );
}

export async function loadPracticeSession(
  userId: string,
  practiceId: string,
): Promise<{
  session: PracticeSession;
  mediaVerified: boolean;
} | null> {
  const key = storageKey(userId, practiceId);
  const raw = await AsyncStorage.getItem(key);

  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as SavedPracticeSession;

    const validState = [
      "idle",
      "running",
      "paused",
      "completed",
      "exited",
    ].includes(data.state);

    if (
      data.practiceId !== practiceId ||
      !validState ||
      !Number.isFinite(data.elapsedActiveMs) ||
      data.elapsedActiveMs < 0 ||
      typeof data.completed !== "boolean" ||
      typeof data.mediaVerified !== "boolean" ||
      (data.startedAt !== null &&
        !Number.isFinite(data.startedAt)) ||
      (data.lastSavedAt !== null &&
        !Number.isFinite(data.lastSavedAt)) ||
      (data.distractionEvents !== undefined &&
        !isValidDistractionEvents(data.distractionEvents)) ||
      (data.mediaPositionSeconds !== undefined &&
        (!Number.isFinite(data.mediaPositionSeconds) ||
          data.mediaPositionSeconds < 0))
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const session: PracticeSession = {
      practiceId,
      state: data.completed ? "completed" : "paused",
      elapsedActiveMs: data.elapsedActiveMs,
      startedAt: data.startedAt,
      lastSavedAt: data.lastSavedAt,
      completed: data.completed,
      distractionEvents: data.distractionEvents ?? [],
      ...(data.mediaPositionSeconds !== undefined
        ? { mediaPositionSeconds: data.mediaPositionSeconds }
        : {}),
    };

    return {
      session,
      mediaVerified: data.mediaVerified,
    };
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearPracticeSession(
  userId: string,
  practiceId: string,
): Promise<void> {
  await AsyncStorage.removeItem(
    storageKey(userId, practiceId),
  );
}
