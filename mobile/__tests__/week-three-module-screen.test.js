import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WeekThreeModule } from "../src/components/week-three-module";
import { newWeekThreeModule, NOTICE_PROMPT, validateModuleGates } from "../lib/week-three-module";
import { WeekThreeRequestError } from "../lib/week-three-module-service";
jest.mock("../lib/week-three-module-service", () => ({ createWeekThreeModuleService: jest.fn(), WeekThreeRequestError: class extends Error { constructor(message, definitive = false) { super(message); this.definitive = definitive; } } }));
jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/themed-view", () => ({ ThemedView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/accessibility", () => ({ AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children), AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children) }));
jest.mock("../src/components/practice-beat", () => ({ PracticeBeat: props => require("react").createElement(require("react-native").Pressable,
  { accessibilityRole: "button", accessibilityLabel: `Test complete ${props.config.id.startsWith("week3-two-minute-sit-v1") ? "week3-two-minute-sit-v1" : props.config.id}`, onPress: props.onContinue }, require("react").createElement(require("react-native").Text, null, props.config.title)) }));
const clone = value => JSON.parse(JSON.stringify(value));
function memory(initial = newWeekThreeModule()) {
  let current = { data: clone(initial), updatedAt: null, operationId: null };
  let revision = 0;
  const service = {
    load: jest.fn(async () => clone(current)), legacyPreview: jest.fn(async () => null), available: jest.fn(async () => true), categorize: jest.fn(),
    save: jest.fn(async (data, expected, id) => { validateModuleGates(data); expect(expected.updatedAt).toBe(current.updatedAt); current = { data: clone(data), updatedAt: String(++revision), operationId: id }; return clone(current); }),
  };
  return { service, saved: () => clone(current.data) };
}
const props = service => ({ userId: "student-a", activityId: "00000000-0000-4000-8000-000000000003", service, onExit: jest.fn() });
async function press(screen, name) { await fireEvent.press(await waitFor(() => screen.getByRole("button", { name, exact: true }))); }
async function ready(screen, name) { return waitFor(() => screen.getByLabelText(name)); }
async function settled(screen) { await waitFor(() => expect(screen.queryByText("Saving or checking Week 3…")).toBeNull()); }
afterEach(cleanup);
test("four beats save and restore at Day 3, preserve backward answers, and complete only after the sit and reflection", async () => {
  const store = memory();
  let screen = await render(<WeekThreeModule {...props(store.service)} />);
  await ready(screen, "Focus rating 3");
  expect(screen.getByRole("button", { name: "Continue to Practice" })).toBeDisabled();
  await fireEvent.press(screen.getByLabelText("Focus rating 3"));
  await press(screen, "Continue to Practice"); await settled(screen);
  await press(screen, "Test complete week-3-breath-anchor-v1"); await settled(screen);
  for (const day of [1, 2]) {
    await fireEvent.changeText(await ready(screen, "Topic or trigger"), `Exact day ${day} entry 😀`);
    await press(screen, "Save audit entry"); await settled(screen);
    await press(screen, `Complete Day ${day}`); await settled(screen);
  }
  await cleanup(); screen = await render(<WeekThreeModule {...props(store.service)} />);
  await ready(screen, "Topic or trigger");
  expect(screen.getByText("Day 3: What pulled your attention?")).toBeTruthy();
  await press(screen, "No distraction noticed on Day 3"); await settled(screen);
  await press(screen, "Use prewritten version"); await settled(screen);
  expect(store.service.available).not.toHaveBeenCalled(); expect(store.service.categorize).not.toHaveBeenCalled();
  for (const day of [1, 2]) await fireEvent.press(screen.getByLabelText(`Planning for Exact day ${day} entry 😀`));
  await press(screen, "Review category summary"); await settled(screen);
  expect(screen.getByText("Planning: 2 of 2 entries · 100.0%")).toBeTruthy();
  await press(screen, "Open attention ethics card"); await settled(screen);
  expect(screen.getByRole("button", { name: "Continue to Notice the gap" })).toBeDisabled();
  await press(screen, "Test complete week3-two-minute-sit-v1"); await settled(screen);
  await press(screen, "Continue to Notice the gap"); await settled(screen);
  expect(screen.getByRole("button", { name: "Complete Week 3" })).toBeDisabled();
  await fireEvent.changeText(await ready(screen, NOTICE_PROMPT), "  Chosen, not automatic.  ");
  await press(screen, "Back to ethics card"); await settled(screen);
  await press(screen, "Continue to Notice the gap"); await settled(screen);
  expect(screen.getByLabelText(NOTICE_PROMPT).props.value).toBe("  Chosen, not automatic.  ");
  await press(screen, "Complete Week 3"); await settled(screen);
  expect(store.saved().step).toBe("completed"); expect(store.saved().notice_reflection).toBe("  Chosen, not automatic.  ");
  await cleanup(); screen = await render(<WeekThreeModule {...props(store.service)} />);
  expect((await ready(screen, NOTICE_PROMPT)).props.editable).toBe(false);
  expect(screen.getByText("Week 3 complete")).toBeTruthy();
});
function inExplore() {
  const data = newWeekThreeModule();
  return { ...data, step: "explore", arrival_focus: 2, practice_started_at: "2026-11-09T08:00:00Z", practice_completed_at: "2026-11-09T08:15:00Z", audit_start_date: "2026-11-09T08:15:00Z" };
}
test("save failure keeps exact raw text visible and retries the same operation without duplicate entries", async () => {
  const store = memory(inExplore());
  store.service.save.mockRejectedValueOnce(new Error("Could not save. Your input is still here."));
  const screen = await render(<WeekThreeModule {...props(store.service)} />);
  await fireEvent.changeText(await ready(screen, "Topic or trigger"), "  My exact entry  ");
  await press(screen, "Save audit entry");
  await waitFor(() => expect(screen.getByText("Could not save. Your input is still here.")).toBeTruthy());
  expect(store.saved().entries).toHaveLength(0);
  expect(screen.getByText("  My exact entry  ")).toBeTruthy();
  await press(screen, "Retry Week 3 save"); await settled(screen);
  expect(store.service.save.mock.calls[0][2]).toBe(store.service.save.mock.calls[1][2]);
  expect(store.saved().entries).toHaveLength(1); expect(store.saved().entries[0].topic_trigger).toBe("  My exact entry  ");
});
test("live AI delay rejects duplicate taps; provider failure keeps entries and never silently switches modes", async () => {
  const data = inExplore(); data.mode = "live_ai";
  data.days = data.days.map(day => ({ ...day, day_complete: true, no_distraction_noticed: day.day !== 1 }));
  data.entries = [{ id: "00000000-0000-4000-8000-000000000001", audit_day: 1, source: "practice", topic_trigger: "My deadline", app_content_type: "", duration_minutes: null, occurred_at: "2026-11-09T08:15:00Z", student_category: null, ai_category: null, ai_confirmed: false }];
  const store = memory(data); let reject;
  store.service.categorize.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const screen = await render(<WeekThreeModule {...props(store.service)} />);
  await ready(screen, "Topic or trigger");
  await press(screen, "Request AI category proposals");
  await waitFor(() => expect(store.service.categorize).toHaveBeenCalledTimes(1));
  await press(screen, "Retry categorization request");
  expect(store.service.categorize).toHaveBeenCalledTimes(1);
  await act(async () => reject(new WeekThreeRequestError("Timed out. Entries remain saved.", true)));
  await settled(screen);
  expect(store.saved().mode).toBe("live_ai"); expect(store.saved().entries[0].topic_trigger).toBe("My deadline");
  expect(screen.getByText("Timed out. Entries remain saved.")).toBeTruthy();
  await press(screen, "Use prewritten version"); await settled(screen);
  expect(store.saved().mode).toBe("prewritten"); expect(store.saved().entries[0].topic_trigger).toBe("My deadline");
  expect(store.service.categorize).toHaveBeenCalledTimes(1);
});
test("failed loads are retryable and do not seed replacement data", async () => {
  const store = memory(); store.service.load.mockRejectedValueOnce(new Error("Offline"));
  const screen = await render(<WeekThreeModule {...props(store.service)} />);
  await press(screen, "Retry loading Week 3");
  await ready(screen, "Focus rating 1"); expect(store.service.save).not.toHaveBeenCalled();
});
