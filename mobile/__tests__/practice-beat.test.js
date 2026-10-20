import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { PracticeBeat } from "../src/components/practice-beat";
import { Linking } from "react-native";
import { practiceSessionId } from "../lib/module-practice";
import { practiceStorageKey } from "../lib/practice-session";
let mockMediaProps;
let mockUserId = "user-a";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../src/components/auth-gate", () => ({ useSignedInUserId: () => mockUserId }));
jest.mock("../src/app/breathing-player", () => ({ __esModule: true, default: () => require("react").createElement(require("react-native").Text, null, "Legacy timer") }));
jest.mock("../src/components/practice-media", () => ({ __esModule: true, default: props => {
  mockMediaProps = props; return require("react").createElement(require("react-native").Text, null, "Media adapter");
} }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/accessibility", () => ({ AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children) }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/themed-view", () => ({ ThemedView: ({ children, ...props }) => require("react").createElement(require("react-native").View, props, children) }));
const config = { id: "test-practice", title: "Configured practice", instructions: "Supplied guidance", media: {
  type: "audio", source: { kind: "url", url: "https://example.test/practice.mp3" },
  transcript: { kind: "inline", text: "Supplied transcript" }, alternativeInstructions: "Supplied text alternative",
} };
beforeEach(async () => { await AsyncStorage.clear(); jest.useFakeTimers(); mockMediaProps = null; mockUserId = "user-a"; });
afterEach(async () => { await cleanup(); jest.useRealTimers(); });

test("retry after restoring uses the latest playback position rather than the opening snapshot", async () => {
  await AsyncStorage.setItem(practiceStorageKey("user-a", "activity", practiceSessionId(config)),
    JSON.stringify({ elapsedMs: 1000, position: 8, completed: false, fallback: false }));
  const screen = await render(<PracticeBeat config={config} weekNumber={1} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(mockMediaProps?.position).toBe(8));
  await act(async () => { mockMediaProps.onStatus("playing", 8); });
  await act(async () => { mockMediaProps.onStatus("error", 24); });
  await fireEvent.press(screen.getByText("Retry media"));
  expect(mockMediaProps.position).toBe(24);
});

test("failed transcript links can be retried without blocking completed Practice", async () => {
  const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce(undefined);
  const linked = { ...config, media: { ...config.media, transcript: { kind: "external", source: { kind: "url", url: "https://example.test/transcript" } } } };
  try {
    const screen = await render(<PracticeBeat config={linked} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
    await waitFor(() => expect(mockMediaProps).toBeTruthy());
    await fireEvent.press(screen.getByText("Open transcript"));
    await waitFor(() => expect(screen.getByText(/Could not open the transcript/)).toBeTruthy());
    await act(async () => { mockMediaProps.onStatus("playing", 0); });
    await act(async () => { mockMediaProps.onStatus("completed", 20); });
    expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText("Retry saving Practice")).toBeNull();
    await fireEvent.press(screen.getByText("Open transcript"));
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not open the transcript/)).toBeNull();
  } finally { open.mockRestore(); }
});

test("media loads, errors without advancing, retries at its saved position, and submits completion once", async () => {
  let finish;
  const onContinue = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const screen = await render(<PracticeBeat config={config} weekNumber={1} activityId="activity" onContinue={onContinue} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Loading Practice media…")).toBeTruthy());
  expect(screen.getByText("Supplied transcript")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(true);
  await act(async () => { mockMediaProps.onStatus("error", 12); });
  expect(screen.getByText(/Playback error/)).toBeTruthy();
  expect(onContinue).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Retry media"));
  expect(mockMediaProps.position).toBe(12);
  await act(async () => { mockMediaProps.onStatus("ready", 12); mockMediaProps.onStatus("playing", 12); });
  await act(async () => { mockMediaProps.onStatus("completed", 20); });
  const button = screen.getByRole("button", { name: "Continue to Explore" });
  await fireEvent.press(button); await fireEvent.press(button);
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  await act(async () => { finish(false); });
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(false);
});

test("a loading timeout keeps the student on Practice with a retry action", async () => {
  const next = jest.fn();
  const screen = await render(<PracticeBeat config={config} weekNumber={2} activityId="activity" onContinue={next} onExit={jest.fn()} />);
  await waitFor(() => expect(mockMediaProps).toBeTruthy());
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(screen.getByText("Retry media")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(true);
  expect(next).not.toHaveBeenCalled();
});

test("failed media without supplied text offers retry and curriculum navigation", async () => {
  const exit = jest.fn();
  const noAlternative = { ...config, media: { ...config.media, alternativeInstructions: undefined } };
  const screen = await render(<PracticeBeat config={noAlternative} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={exit} />);
  await waitFor(() => expect(mockMediaProps).toBeTruthy());
  await act(async () => { mockMediaProps.onStatus("error", 3); });
  expect(screen.getByText("Playback error. Your position is saved. Retry media or return to the curriculum.")).toBeTruthy();
  expect(screen.queryByText("Use text alternative")).toBeNull();
  await fireEvent.press(screen.getByText("Back to curriculum"));
  await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
});

test("unavailable references show supplied text, and interrupted text practice restores paused for its owner", async () => {
  const missing = { ...config, media: { ...config.media, source: { kind: "reference", id: "pending-asset" } } };
  let screen = await render(<PracticeBeat config={missing} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/configured media is unavailable/)).toBeTruthy());
  expect(mockMediaProps).toBeNull();
  await fireEvent.press(screen.getByText("Use text alternative"));
  await fireEvent.press(screen.getByText("Start practice"));
  await act(async () => { jest.advanceTimersByTime(1000); });
  await fireEvent.press(screen.getByText("Pause practice"));
  await cleanup();
  screen = await render(<PracticeBeat config={missing} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Resume practice")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByText("Resume practice"));
  await fireEvent.press(screen.getByText("Finish practice"));
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(false);
  await cleanup();
  mockUserId = "user-b";
  screen = await render(<PracticeBeat config={missing} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/configured media is unavailable/)).toBeTruthy());
  expect(screen.queryByText("Resume practice")).toBeNull();
});

test("timed guidance cannot finish or advance before its configured duration", async () => {
  const screen = await render(<PracticeBeat config={{ id: "timed", title: "Timed practice", instructions: "Supplied timer guidance", durationMs: 2000 }}
    weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Start practice")).toBeTruthy());
  await fireEvent.press(screen.getByText("Start practice"));
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.queryByText("Finish practice")).toBeNull();
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(true);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole("button", { name: "Continue to Explore" }).props.accessibilityState.disabled).toBe(false);
});

test("opening and leaving an untouched Practice does not create a paused attempt", async () => {
  const plain = { id: "unguided", title: "Unguided practice", instructions: "Supplied guidance" };
  let screen = await render(<PracticeBeat config={plain} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Start practice")).toBeTruthy());
  await cleanup();
  screen = await render(<PracticeBeat config={plain} weekNumber={2} activityId="activity" onContinue={jest.fn()} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Start practice")).toBeTruthy());
  expect(screen.queryByText("Resume practice")).toBeNull();
});
