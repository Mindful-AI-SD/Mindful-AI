import AsyncStorage from "@react-native-async-storage/async-storage";

export type SavedPractice = { elapsedMs: number; position: number; completed: boolean; fallback: boolean };
export function practiceStorageKey(userId: string, activityId: string, sessionId: string) {
  return `module-practice:${userId}:${activityId}:${sessionId}`;
}
export async function readPracticeSession(key: string): Promise<SavedPractice | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 && Number.isFinite(value.position) && value.position >= 0 &&
      typeof value.completed === "boolean" && typeof value.fallback === "boolean" ? value : null;
  } catch { return null; }
}
export async function writePracticeSession(key: string, value: SavedPractice) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
export async function removePracticeSession(key: string) { await AsyncStorage.removeItem(key); }
