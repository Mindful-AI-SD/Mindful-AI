import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import { WeekOneFlow } from "../src/components/week-one-flow";
import {
  saveWeekOneArrival,
  saveWeekOneStep,
  startWeekOne,
} from "../lib/week-one";

jest.mock("../src/components/auth-gate", () => ({
  useSignedInUserId: () => "user-1",
}));

jest.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ text: "#000", backgroundElement: "#fff" }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  },
}));

jest.mock("../src/components/accessibility", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    AccessibleHeading: ({ children }) => React.createElement(Text, null, children),
    AccessibleStatus: ({ children }) => React.createElement(Text, null, children),
  };
});

jest.mock("../src/components/themed-text", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    ThemedText: ({ children, ...props }) => React.createElement(Text, props, children),
  };
});

jest.mock("../src/components/themed-view", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ThemedView: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

jest.mock("../src/components/intention-mirror-screen", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    IntentionMirrorScreen: () => React.createElement(Text, null, "Intention Mirror"),
  };
});

jest.mock("../src/components/ai-gap-reflection-screen", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    AiGapReflectionScreen: () => React.createElement(Text, null, "AI Gap Reflection"),
  };
});

jest.mock("../src/app/breathing-player", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ onContinue }) => React.createElement(
      Pressable,
      { accessibilityRole: "button", onPress: () => onContinue() },
      React.createElement(Text, null, "Finish breathing"),
    ),
  };
});

jest.mock("../lib/week-one", () => ({
  returnToWriting: jest.fn(),
  saveWeekOneArrival: jest.fn(),
  saveWeekOneStep: jest.fn(),
  startWeekOne: jest.fn(),
}));

const mockedStart = startWeekOne;
const mockedSave = saveWeekOneStep;

function progress(currentStep, reflectionAnswers = {}) {
  return {
    user_id: "user-1",
    activity_id: "activity-1",
    status: currentStep === "completed" ? "completed" : "in_progress",
    current_step: currentStep,
    reflection_answers: { arrive_mood: "3", arrive_energy: "4", ...reflectionAnswers },
    generated_intentions: [],
  };
}

describe("four-beat module entry", () => {
  beforeEach(() => { mockedStart.mockReset(); mockedSave.mockReset(); });
  afterEach(async () => { await cleanup(); });
  test("shows four beats, bounds Next/Back, and resumes the saved writing step", async () => {
    mockedStart.mockResolvedValue(progress("writing"));
    const screen = await render(<WeekOneFlow activityId="activity-1" onExit={jest.fn()} showModuleEntry />);
    await waitFor(() => expect(screen.getByText("Beat 3 of 4: Explore")).toBeTruthy());
    for (const label of ["1. Arrive", "2. Practice", "3. Explore — selected", "4. Integration reflection"]) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Beat 1 of 4: Arrive")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true);
    for (let n = 0; n < 3; n++) await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Beat 4 of 4: Integration reflection")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).props.accessibilityState.disabled).toBe(true);
    expect(mockedSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Resume: writing" }));
    expect(screen.getByText("Intention Mirror")).toBeTruthy();
  });
  test("reopening restores the persisted step, not the last overview selection", async () => {
    mockedStart.mockResolvedValue(progress("ai_gap_reflection"));
    let screen = await render(<WeekOneFlow activityId="activity-1" onExit={jest.fn()} showModuleEntry />);
    await waitFor(() => expect(screen.getByText("Beat 4 of 4: Integration reflection")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await cleanup();
    screen = await render(<WeekOneFlow activityId="activity-1" onExit={jest.fn()} showModuleEntry />);
    await waitFor(() => expect(screen.getByText("Beat 4 of 4: Integration reflection")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Resume: ai gap reflection" }));
    expect(screen.getByText("AI Gap Reflection")).toBeTruthy();
  });
});
