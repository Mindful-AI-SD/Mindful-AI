import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { GuidingQuestionsCapture } from "../src/components/guiding-questions-capture";
import { createBaselineFixtureService } from "../lib/baseline-fixture-service";
import { BASELINE_DEFINITION_FIXTURE as definition } from "../src/components/guiding-questions-preview.fixtures";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ text: "#000", backgroundElement: "#fff" }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/themed-text", () => ({ ThemedText: ({ children, ...props }) => require("react").createElement(require("react-native").Text, props, children) }));
jest.mock("../src/components/themed-view", () => ({ ThemedView: ({ children }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../src/components/accessibility", () => ({
  AccessibleHeading: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  AccessibleStatus: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
}));
beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(cleanup);
async function fields(screen) { return await waitFor(() => screen.getAllByLabelText(/^Guiding Question \d:/)); }
async function fill(screen) {
  for (const [index, field] of (await fields(screen)).entries()) await fireEvent.changeText(field, `Exact answer ${index + 1} 😀`);
}

test("new student saves incomplete drafts then all five answers and restores after remount without other-account data", async () => {
  let screen = await render(<GuidingQuestionsCapture userId="student-a" onBack={jest.fn()} />);
  expect((await fields(screen)).every(field => field.props.value === "")).toBe(true);
  await fireEvent.changeText((await fields(screen))[0], "Partial draft");
  expect(screen.getByRole("button", { name: "Submit original baseline" })).toBeDisabled();
  await fireEvent.press(screen.getByText("Save baseline draft"));
  await waitFor(() => expect(screen.getByText("Baseline draft saved on this device.")).toBeTruthy());
  await cleanup();
  screen = await render(<GuidingQuestionsCapture userId="student-a" onBack={jest.fn()} />);
  expect((await fields(screen))[0].props.value).toBe("Partial draft");
  await fill(screen);
  await fireEvent.press(screen.getByText("Save baseline draft"));
  await waitFor(() => expect(screen.getByText("Baseline draft saved on this device.")).toBeTruthy());
  await cleanup();
  screen = await render(<GuidingQuestionsCapture userId="student-a" onBack={jest.fn()} />);
  expect((await fields(screen)).map(field => field.props.value)).toEqual(Array.from({ length: 5 }, (_, i) => `Exact answer ${i + 1} 😀`));
  await screen.rerender(<GuidingQuestionsCapture userId="student-b" onBack={jest.fn()} />);
  expect((await fields(screen)).every(field => field.props.value === "")).toBe(true);
});

test("failed saves keep every answer and retry the identical operation; loading and duplicate-tap guards work", async () => {
  const real = createBaselineFixtureService("student", definition);
  let release;
  const save = jest.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { release = () => reject(Object.assign(new Error("Internal storage failure"), { code: 22 })); }))
    .mockImplementation(input => real.saveBaselineDraft(input));
  const service = { ...real, saveBaselineDraft: save };
  const screen = await render(<GuidingQuestionsCapture userId="student" service={service} onBack={jest.fn()} />);
  await fill(screen);
  await fireEvent.press(screen.getByText("Save baseline draft"));
  await fireEvent.press(screen.getByText("Save baseline draft"));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Saving baseline…")).toBeTruthy();
  await act(async () => release());
  expect(screen.getByText(/Could not save your baseline/)).toBeTruthy();
  expect(screen.queryByText("Internal storage failure")).toBeNull();
  expect((await fields(screen)).map(field => field.props.value)).toEqual(Array.from({ length: 5 }, (_, i) => `Exact answer ${i + 1} 😀`));
  await fireEvent.press(screen.getByText("Retry baseline save"));
  await waitFor(() => expect(screen.getByText("Baseline draft saved on this device.")).toBeTruthy());
  expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
});

test("submission freezes the original through restart and new operations cannot overwrite it", async () => {
  const service = createBaselineFixtureService("student", definition);
  let screen = await render(<GuidingQuestionsCapture userId="student" service={service} onBack={jest.fn()} />);
  await fill(screen);
  await fireEvent.press(screen.getByText("Submit original baseline"));
  await waitFor(() => expect(screen.getByText(/Original baseline submitted/)).toBeTruthy());
  const original = await service.loadOriginalBaseline();
  await cleanup();
  screen = await render(<GuidingQuestionsCapture userId="student" service={service} onBack={jest.fn()} />);
  expect((await fields(screen)).every(field => !field.props.editable)).toBe(true);
  expect(screen.queryByText("Submit original baseline")).toBeNull();
  await expect(service.submitBaseline({ operationId: "00000000-0000-4000-8000-000000000009", expectedRevision: 1,
    definitionId: definition.definitionId, definitionVersion: 1, answers: { q1: "Replacement" } })).rejects.toMatchObject({ code: "BASELINE_IMMUTABLE" });
  await expect(service.saveBaselineDraft({ operationId: "00000000-0000-4000-8000-000000000010", expectedRevision: 1,
    definitionId: definition.definitionId, definitionVersion: 1, answers: { q1: "Replacement" } })).rejects.toMatchObject({ code: "BASELINE_IMMUTABLE" });
  expect(await service.loadOriginalBaseline()).toEqual(original);
});

test("load failure is retryable", async () => {
  const real = createBaselineFixtureService("student", definition);
  const load = jest.fn().mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(null);
  const screen = await render(<GuidingQuestionsCapture userId="student" service={{ ...real, loadBaseline: load }} onBack={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("Retry loading baseline")).toBeTruthy());
  await fireEvent.press(screen.getByText("Retry loading baseline"));
  expect(await fields(screen)).toHaveLength(5);
});

test("late previous-account responses cannot populate another account", async () => {
  let resolveOld;
  const real = createBaselineFixtureService("old", definition);
  const previous = { ...real, loadBaseline: () => new Promise(resolve => { resolveOld = resolve; }) };
  const screen = await render(<GuidingQuestionsCapture userId="old" service={previous} onBack={jest.fn()} />);
  await screen.rerender(<GuidingQuestionsCapture userId="new" onBack={jest.fn()} />);
  expect((await fields(screen)).every(field => field.props.value === "")).toBe(true);
  await act(async () => resolveOld({ contractVersion: "sprint3-storage/v1", definitionId: definition.definitionId,
    definitionVersion: 1, status: "draft", revision: 1, submittedAt: null, answers: { q1: "Private old account" } }));
  expect((await fields(screen)).every(field => field.props.value === "")).toBe(true);
});

test("lost committed submit response replays the same operation without replacing the original", async () => {
  const real = createBaselineFixtureService("student", definition);
  const submit = jest.fn().mockImplementationOnce(async request => { await real.submitBaseline(request); throw new Error("Reply lost"); })
    .mockImplementation(request => real.submitBaseline(request));
  const screen = await render(<GuidingQuestionsCapture userId="student" service={{ ...real, submitBaseline: submit }} onBack={jest.fn()} />);
  await fill(screen);
  await fireEvent.press(screen.getByText("Submit original baseline"));
  await waitFor(() => expect(screen.getByText("Retry baseline save")).toBeTruthy());
  const first = await real.loadOriginalBaseline();
  await fireEvent.press(screen.getByText("Retry baseline save"));
  await waitFor(() => expect(screen.getByText(/Original baseline submitted/)).toBeTruthy());
  expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
  expect(await real.loadOriginalBaseline()).toEqual(first);
});
