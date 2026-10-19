import React from "react";
jest.mock("../src/components/practice-media", () => ({ __esModule: true, default: () => null }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WeekTwoFlow } from "../src/components/week-two-flow";
import { BODY_REGIONS, loadWeekTwoArrival, saveWeekTwoArrival } from "../lib/week-two-arrival";
import { saveWeekTwoAnswers } from "../lib/week-two";
import { getSensationWords } from "../lib/sensation-lexicon";

jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("../lib/week-two-arrival", () => ({
  ...jest.requireActual("../lib/week-two-arrival"),
  loadWeekTwoArrival: jest.fn(), saveWeekTwoArrival: jest.fn(),
}));
jest.mock("../lib/week-two", () => ({
  ...jest.requireActual("../lib/week-two"),
  loadWeekTwoProgress: (...args) => require("../lib/week-two-arrival").loadWeekTwoArrival(...args).then(data => ({
    answers: {}, lexicon: null, status: "in_progress", completedAt: null, ...data,
  })),
  saveWeekTwoAnswers: jest.fn(),
}));
jest.mock("../lib/sensation-lexicon", () => ({ getSensationWords: jest.fn() }));
jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("../src/components/auth-gate", () => ({ useSignedInUserId: () => "user-a" }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children),
}));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
jest.mock("../src/components/themed-text", () => ({
  ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children),
}));
jest.mock("../src/components/themed-view", () => ({
  ThemedView: ({ children, ...props }) => require("react").createElement(require("react-native").View, props, children),
}));

beforeEach(() => { jest.clearAllMocks(); loadWeekTwoArrival.mockReset(); saveWeekTwoArrival.mockReset(); saveWeekTwoAnswers.mockReset(); getSensationWords.mockReset(); });
afterEach(async () => { await cleanup(); });

test("names every region, allows revising the single selection, and saves before Practice", async () => {
  loadWeekTwoArrival.mockResolvedValue({ region: null, step: "week_two_arrive" });
  saveWeekTwoArrival.mockResolvedValue({ region: "right_hand", step: "week_two_practice" });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole("radio", { name: "Head" })).toBeTruthy());
  for (const region of BODY_REGIONS) {
    const radio = screen.getByRole("radio", { name: region.label });
    expect(radio.props.style.minHeight).toBeGreaterThanOrEqual(48);
    expect(radio.props.accessibilityHint).toBeTruthy();
  }
  expect(screen.getByRole("button", { name: "Continue to Practice" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole("radio", { name: "Head" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Right hand" }));
  expect(screen.getByRole("radio", { name: "Head" }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("radio", { name: "Right hand" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText("Selected location: Right hand")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Continue to Practice" }));
  await waitFor(() => expect(screen.getByText("Practice")).toBeTruthy());
  expect(saveWeekTwoArrival).toHaveBeenCalledWith("user-a", "activity", "right_hand", true);
});

test("keeps the chosen region when saving fails, then retries once despite repeated taps", async () => {
  loadWeekTwoArrival.mockResolvedValue({ region: "chest", step: "week_two_arrive" });
  saveWeekTwoArrival.mockRejectedValueOnce(new Error("Could not save your location."));
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole("radio", { name: "Chest" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Continue to Practice" }));
  await waitFor(() => expect(screen.getByText("Could not save your location.")).toBeTruthy());
  expect(screen.getByRole("radio", { name: "Chest" }).props.accessibilityState.checked).toBe(true);
  let finish;
  saveWeekTwoArrival.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const retry = screen.getByRole("button", { name: "Retry and continue to Practice" });
  await fireEvent.press(retry);
  await fireEvent.press(retry);
  expect(saveWeekTwoArrival).toHaveBeenCalledTimes(2);
  await act(async () => { finish({ region: "chest", step: "week_two_practice" }); });
  await waitFor(() => expect(screen.getByText("Practice")).toBeTruthy());
});

test("reopens Practice with the saved region and allows returning to Arrive to revise it", async () => {
  loadWeekTwoArrival.mockResolvedValue({ region: "left_leg", step: "week_two_practice" });
  saveWeekTwoArrival.mockResolvedValue({ region: "left_leg", step: "week_two_arrive" });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Practice")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Revise location" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "Left leg" }).props.accessibilityState.checked).toBe(true));
  expect(saveWeekTwoArrival).toHaveBeenCalledWith("user-a", "activity", "left_leg", false);
});

test("failed loads block editing until retry restores the saved location", async () => {
  loadWeekTwoArrival.mockRejectedValueOnce(new Error("Could not load your check-in."));
  loadWeekTwoArrival.mockResolvedValueOnce({ region: "abdomen", step: "week_two_arrive" });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry loading" })).toBeTruthy());
  expect(screen.queryByRole("radio")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Retry loading" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "Abdomen" }).props.accessibilityState.checked).toBe(true));
});

test("returning to curriculum saves a revised region without advancing", async () => {
  const onExit = jest.fn();
  loadWeekTwoArrival.mockResolvedValue({ region: "chest", step: "week_two_arrive" });
  saveWeekTwoArrival.mockResolvedValue({ region: "head", step: "week_two_arrive" });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={onExit} />);
  await waitFor(() => expect(screen.getByRole("radio", { name: "Chest" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("radio", { name: "Head" }));
  await fireEvent.press(screen.getByRole("button", { name: "Back to curriculum" }));
  await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  expect(saveWeekTwoArrival).toHaveBeenCalledWith("user-a", "activity", "head", false);
});

function exploreProgress() {
  return { region: "chest", step: "week_two_explore", status: "in_progress", completedAt: null, lexicon: null,
    answers: { arrive_body_region: "chest", week_two_practice_complete: "yes", week_two_sensation_1: "weird", week_two_sensation_2: "warm", week_two_sensation_3: "tight" } };
}

function mockProgressSaving(initial) {
  let progress = initial;
  saveWeekTwoAnswers.mockImplementation(async (_user, _activity, _expected, patch, next = progress.step) => {
    const answers = { ...progress.answers, ...patch };
    progress = { ...progress, step: next, answers, lexicon: answers.week_two_lexicon ? JSON.parse(answers.week_two_lexicon) : null };
    return progress;
  });
}

test("Explore sends only three descriptions, blocks duplicate taps while waiting, and opens Notice from saved data", async () => {
  const initial = exploreProgress();
  loadWeekTwoArrival.mockResolvedValue(initial);
  mockProgressSaving(initial);
  let finish;
  getSensationWords.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Explore · Sensation Lexicon")).toBeTruthy());
  const generate = screen.getByRole("button", { name: "Generate sensation words" });
  await fireEvent.press(generate);
  await fireEvent.press(generate);
  await waitFor(() => expect(getSensationWords).toHaveBeenCalledTimes(1));
  expect(getSensationWords.mock.calls[0][0]).toEqual({ activityId: "activity", activityContext: expect.any(String), sensations: ["weird", "warm", "tight"] });
  expect(screen.getByText("Loading or saving Week 2…")).toBeTruthy();
  expect(screen.queryByText("Continue to Notice")).toBeNull();
  await act(async () => { finish({ data: { kind: "words", provider: "mock", items: [
    { original: "weird", isVague: true, suggestions: ["tingling"] },
    { original: "warm", isVague: false, suggestions: [] },
    { original: "tight", isVague: false, suggestions: [] },
  ] }, error: null }); });
  await waitFor(() => expect(screen.getByText("Suggested words: tingling")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Continue to Notice" }));
  await waitFor(() => expect(screen.getByText("Tracker ethics")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Complete Week 2" }).props.accessibilityState.disabled).toBe(true);
});

test("a support response preserves descriptions and does not offer continuation to Notice", async () => {
  const initial = exploreProgress();
  loadWeekTwoArrival.mockResolvedValue(initial);
  mockProgressSaving(initial);
  getSensationWords.mockResolvedValue({ data: { kind: "support", message: "Support response from the service", resources: [{ name: "Service resource", contact: "Service contact" }] }, error: null });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Explore · Sensation Lexicon")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Generate sensation words" }));
  await waitFor(() => expect(screen.getByText("Support response from the service")).toBeTruthy());
  expect(screen.getByLabelText("Sensation 1").props.value).toBe("weird");
  expect(screen.queryByText("Continue to Notice")).toBeNull();
  expect(screen.queryByText("Sensation Lexicon results")).toBeNull();
});

test("a failed new request keeps previously saved words for unchanged descriptions", async () => {
  const initial = exploreProgress();
  initial.lexicon = { kind: "words", provider: "mock", items: [
    { original: "weird", isVague: true, suggestions: ["tingling"] },
    { original: "warm", isVague: false, suggestions: [] },
    { original: "tight", isVague: false, suggestions: [] },
  ] };
  initial.answers.week_two_lexicon = JSON.stringify(initial.lexicon);
  loadWeekTwoArrival.mockResolvedValue(initial);
  mockProgressSaving(initial);
  getSensationWords.mockResolvedValue({ data: null, error: { code: "TIMEOUT", message: "Request timed out" } });
  const screen = await render(<WeekTwoFlow activityId="activity" onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Suggested words: tingling")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Generate sensation words" }));
  await waitFor(() => expect(screen.getByText("Request timed out")).toBeTruthy());
  expect(screen.getByText("Suggested words: tingling")).toBeTruthy();
  expect(screen.getByLabelText("Sensation 1").props.value).toBe("weird");
  expect(saveWeekTwoAnswers.mock.calls[0][3].week_two_lexicon).toBe(initial.answers.week_two_lexicon);
});
