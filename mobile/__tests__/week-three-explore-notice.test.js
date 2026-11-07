import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WeekThreeExploreNotice } from "../src/components/week-three-explore-notice";
import { createWeekThreeScreenFixtureService } from "../lib/week-three-screen-fixture-service";
import { WEEK_THREE_CONTENT_FIXTURE as content, WEEK_THREE_PROGRESS_FIXTURE as progress, WEEK_THREE_SLUG_FIXTURE as slug } from "../src/components/week-three-explore-notice.fixtures";
let practiceProps;
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/themed-view", () => ({ ThemedView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
jest.mock("../src/components/practice-beat", () => ({ PracticeBeat: props => {
  practiceProps = props;
  return require("react").createElement(require("react-native").Pressable, {
    accessibilityRole: "button", accessibilityLabel: "Mock complete Week 3 Practice", onPress: props.onContinue,
  }, require("react").createElement(require("react-native").Text, null, "Week 3 audio Practice"));
} }));
const activityId = progress.activityId;
const exploreLabel = "Explore response (example field)", noticeLabel = "Notice response (example field)";
beforeEach(async () => { await AsyncStorage.clear(); practiceProps = null; });
afterEach(cleanup);
async function ready(screen, label = exploreLabel) { return await waitFor(() => screen.getByLabelText(label)); }

test("the module entry gates Explore behind the sponsor-supplied Week 3 audio without awarding completion", async () => {
  const service = createWeekThreeScreenFixtureService("a", activityId, content);
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} showModuleEntry />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Resume: Practice (sponsor recording)" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Resume: Practice (sponsor recording)" }));
  expect(screen.getByText("Week 3 audio Practice")).toBeTruthy();
  expect(practiceProps.config.media.source.url).toContain("week-3-breath-anchor.mp3");
  await fireEvent.press(screen.getByRole("button", { name: "Mock complete Week 3 Practice" }));
  await ready(screen);
  const saved = await service.loadWeekThreeProgress(slug);
  expect(saved.status).toBe("in_progress");
  expect(saved.completedAt).toBeNull();
});

test("shows the exact recorded log and saves/restores Explore and Notice without altering Practice or completion", async () => {
  const service = createWeekThreeScreenFixtureService("a", activityId, content);
  let screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} />);
  await ready(screen);
  expect(screen.getByText("Synthetic tap")).toBeTruthy();
  expect(screen.getByText("2026-10-28T16:00:00Z")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue to Notice" })).toBeDisabled();
  await fireEvent.changeText(await ready(screen), "Explore answer 😀");
  await fireEvent.press(screen.getByText("Continue to Notice"));
  await ready(screen, noticeLabel);
  await fireEvent.changeText(await ready(screen, noticeLabel), "Closing answer");
  await fireEvent.press(screen.getByText("Save reflection"));
  await waitFor(() => expect(screen.getByText("Week 3 answers and step saved on this device.")).toBeTruthy());
  await cleanup();
  screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} onExit={jest.fn()} />);
  expect((await ready(screen, noticeLabel)).props.value).toBe("Closing answer");
  await fireEvent.press(screen.getByText("Back to Explore"));
  expect((await ready(screen)).props.value).toBe("Explore answer 😀");
  const saved = await service.loadWeekThreeProgress(slug);
  expect(saved.events).toEqual(progress.events);
  expect(saved.eventsRevision).toBe(progress.eventsRevision);
  expect(saved.resumeState).toEqual(progress.resumeState);
  expect(saved.auditResult).toEqual(progress.auditResult);
  expect(saved.status).toBe("in_progress"); expect(saved.completedAt).toBeNull();
  expect(saved.answers.example_notice_response).toBe("Closing answer");
});

test("save errors retain input, reject duplicate taps, and retry the same operation", async () => {
  const real = createWeekThreeScreenFixtureService("a", activityId, content);
  let fail;
  const save = jest.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("Internal failure")); }))
    .mockImplementation(input => real.saveWeekThreeDraft(input));
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={{ ...real, saveWeekThreeDraft: save }} onExit={jest.fn()} />);
  await fireEvent.changeText(await ready(screen), "Kept after failure");
  await fireEvent.press(screen.getByText("Continue to Notice"));
  await fireEvent.press(screen.getByText("Continue to Notice"));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Saving Week 3 answers…")).toBeTruthy();
  await act(async () => fail());
  expect((await ready(screen)).props.value).toBe("Kept after failure");
  expect(screen.getByText(/Could not save Week 3/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Retry Week 3 save"));
  await ready(screen, noticeLabel);
  expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
});

test("empty logs do not invent events or AI results and over-limit answers remain visible", async () => {
  const service = { loadWeekThreeProgress: jest.fn().mockResolvedValue({ ...progress, events: [], auditResult: null }), saveWeekThreeDraft: jest.fn() };
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} />);
  await ready(screen);
  expect(screen.getByText("No recorded events. No distractions have been inferred.")).toBeTruthy();
  expect(screen.queryByText("Synthetic tap")).toBeNull();
  await fireEvent.changeText(await ready(screen), "x".repeat(2001));
  expect(screen.getByRole("button", { name: "Save answers" })).toBeDisabled();
  expect((await ready(screen)).props.value).toHaveLength(2001);
  expect(service.saveWeekThreeDraft).not.toHaveBeenCalled();
});

test("failed or missing log loads have a recovery action and do not seed replacement progress", async () => {
  const service = { loadWeekThreeProgress: jest.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(progress), saveWeekThreeDraft: jest.fn() };
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Retry loading Week 3")).toBeTruthy());
  await fireEvent.press(screen.getByText("Retry loading Week 3"));
  await ready(screen);
  expect(service.saveWeekThreeDraft).not.toHaveBeenCalled();
});

test("account and activity scopes never restore another student's answers", async () => {
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} onExit={jest.fn()} />);
  await fireEvent.changeText(await ready(screen), "Private fixture answer");
  await fireEvent.press(screen.getByText("Save answers"));
  await waitFor(() => expect(screen.getByText("Week 3 answers and step saved on this device.")).toBeTruthy());
  await screen.rerender(<WeekThreeExploreNotice userId="b" activityId={activityId} onExit={jest.fn()} />);
  expect((await ready(screen)).props.value).toBe("");
  await screen.rerender(<WeekThreeExploreNotice userId="a" activityId="different-activity" onExit={jest.fn()} />);
  expect((await ready(screen)).props.value).toBe("");
});

test("completed progress is read-only and no completion action or provider request is exposed", async () => {
  const service = { loadWeekThreeProgress: jest.fn().mockResolvedValue({ ...progress, status: "completed", completedAt: "2026-11-02T10:00:00Z" }), saveWeekThreeDraft: jest.fn() };
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} />);
  expect((await ready(screen)).props.editable).toBe(false);
  expect(screen.queryByRole("button", { name: "Complete Week 3" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
  expect(service.saveWeekThreeDraft).not.toHaveBeenCalled();
});

test("invalid saved resume data has readable recovery instead of crashing the log view", async () => {
  const service = { loadWeekThreeProgress: jest.fn().mockResolvedValue({ ...progress, resumeState: null }), saveWeekThreeDraft: jest.fn() };
  const screen = await render(<WeekThreeExploreNotice userId="a" activityId={activityId} service={service} onExit={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Retry loading Week 3")).toBeTruthy());
  expect(screen.queryByLabelText(exploreLabel)).toBeNull();
  expect(service.saveWeekThreeDraft).not.toHaveBeenCalled();
});
