import AsyncStorage from "@react-native-async-storage/async-storage";

export type PersistedBreathingSession = {
  activityId: string;
  startedAt: number;
  accumulatedActiveMs: number;
  state: "running" | "paused";
  completed: boolean;
  savedAt: number;
};

function getStorageKey(userId: string, activityId: string) {
  return `breathing-session:${userId}:${activityId}`;
}

export async function saveBreathingSession(
  userId: string,
  session: PersistedBreathingSession,
) {
  const key = getStorageKey(userId, session.activityId);

  await AsyncStorage.setItem(
    key,
    JSON.stringify(session),
  );
}

export async function loadBreathingSession(
  userId: string,
  activityId: string,
): Promise<PersistedBreathingSession | null> {
  const key = getStorageKey(userId, activityId);

  const savedSession =
    await AsyncStorage.getItem(key);

  if (!savedSession) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        savedSession,
      ) as PersistedBreathingSession;

    if (
      parsed.activityId !== activityId ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.accumulatedActiveMs !== "number" ||
      typeof parsed.completed !== "boolean" ||
      typeof parsed.savedAt !== "number" ||
      (parsed.state !== "running" &&
        parsed.state !== "paused")
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearBreathingSession(
  userId: string,
  activityId: string,
) {
  const key = getStorageKey(userId, activityId);

  await AsyncStorage.removeItem(key);
}