import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadPracticeSession,
  savePracticeSession,
} from "../lib/practice-session-storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage;

describe("Week 3 distraction tap storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("saves tap events with elapsed active time and restores them paused", async () => {
    const event = {
      id: "tap-save-1",
      at: "2026-11-06T16:00:00.000Z",
      label: "Planning",
    };
    const session = {
      practiceId: "week-three-practice",
      state: "running",
      elapsedActiveMs: 8250,
      startedAt: 1793980800000,
      lastSavedAt: 1793980808250,
      completed: false,
      distractionEvents: [event],
    };

    await savePracticeSession("user-1", session, false);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [key, serialized] = storage.setItem.mock.calls[0];
    expect(key).toBe("practice-session:user-1:week-three-practice");
    const saved = JSON.parse(serialized);
    expect(saved.state).toBe("paused");
    expect(saved.completed).toBe(false);
    expect(saved.elapsedActiveMs).toBe(8250);
    expect(saved.distractionEvents).toEqual([event]);

    storage.getItem.mockResolvedValueOnce(serialized);
    const restored = await loadPracticeSession(
      "user-1",
      "week-three-practice",
    );

    expect(restored.session.state).toBe("paused");
    expect(restored.session.elapsedActiveMs).toBe(8250);
    expect(restored.session.distractionEvents).toEqual([event]);
    expect(restored.session.completed).toBe(false);
  });

  test("rejects duplicate event IDs instead of restoring a corrupted log", async () => {
    const event = {
      id: "duplicate-tap",
      at: "2026-11-06T16:00:00.000Z",
      label: "Memory",
    };
    storage.getItem.mockResolvedValueOnce(JSON.stringify({
      practiceId: "week-three-practice",
      state: "paused",
      elapsedActiveMs: 2000,
      startedAt: 1793980800000,
      lastSavedAt: 1793980802000,
      completed: false,
      distractionEvents: [event, event],
      mediaVerified: false,
    }));

    const restored = await loadPracticeSession(
      "user-1",
      "week-three-practice",
    );

    expect(restored).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(
      "practice-session:user-1:week-three-practice",
    );
  });
});
