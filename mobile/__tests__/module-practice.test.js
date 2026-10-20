import { modulePractice, decodeModuleContent, practiceSessionId } from "../lib/module-practice";
import { practiceStorageKey } from "../lib/practice-session";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

function content(weekNumber, media) {
  return JSON.stringify({ weekNumber, title: "Test module", contentSource: { kind: "sponsor", reference: "test fixture" },
    beats: ["arrive", "practice", "explore", "notice"].map(id => ({ id, title: id[0].toUpperCase() + id.slice(1), description: "Supplied guidance", ...(id === "practice" && media ? { media } : {}) })) });
}
test("both weeks consume their configured media without using file duration as a timer", () => {
  for (const [weekNumber, type] of [[1, "audio"], [2, "video"]]) {
    const media = { type, source: { kind: "url", url: `https://example.test/${type}` }, durationSeconds: 300,
      transcript: { kind: "inline", text: "Supplied transcript" }, alternativeInstructions: "Supplied alternative" };
    const config = modulePractice(weekNumber, content(weekNumber, media), 10);
    expect(config.media).toEqual(media);
    expect(config.durationMs).toBeUndefined();
    expect(config.instructions).toBe("Supplied guidance");
    expect(config.legacyBreathing).toBeUndefined();
  }
});
test("existing plain content keeps the breathing timer and Week 2 unguided experience", () => {
  expect(modulePractice(1).legacyBreathing).toBe(true);
  expect(modulePractice(2).durationMs).toBeUndefined();
  expect(modulePractice(2, content(2), 5).durationMs).toBe(300000);
});
test("malformed, mismatched, or unsafe configuration cannot silently start another practice", () => {
  expect(modulePractice(1, content(2)).unavailable).toBeTruthy();
  expect(modulePractice(2, "{broken").unavailable).toBeTruthy();
  expect(modulePractice(2, content(2, { type: "video", source: { kind: "url", url: "http://example.test/media" } })).unavailable).toBeTruthy();
  expect(decodeModuleContent("Plain guidance", 1)).toBeUndefined();
});
test("restored sessions are separated by owner, activity, and configuration", () => {
  const config = modulePractice(2);
  const key = practiceStorageKey("a", "activity", practiceSessionId(config));
  expect(practiceStorageKey("b", "activity", practiceSessionId(config))).not.toBe(key);
  expect(practiceStorageKey("a", "other", practiceSessionId(config))).not.toBe(key);
  expect(practiceStorageKey("a", "activity", practiceSessionId({ ...config, durationMs: 1000 }))).not.toBe(key);
});
