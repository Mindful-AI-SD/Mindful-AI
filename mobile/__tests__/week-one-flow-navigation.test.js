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
    reflection_answers: reflectionAnswers,
    generated_intentions: [],
  };
}

describe("WeekOneFlow breathing navigation", () => {
  beforeEach(() => {
    mockedStart.mockReset();
    mockedSave.mockReset();
  });

  afterEach(async () => {
    await cleanup();
  });

  test("moves from breathing into the integrated post-breathing check-in", async () => {
    mockedStart.mockResolvedValue(progress("breathing"));
    mockedSave.mockResolvedValue(progress("post_breathing_check_in"));

    const screen = await render(
      <WeekOneFlow activityId="activity-1" onExit={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Finish breathing")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("Finish breathing"));

    await waitFor(() => {
      expect(
        screen.getByText("Did you notice an urge to check your phone?"),
      ).toBeTruthy();
    });
    expect(mockedSave).toHaveBeenCalledWith(
      "user-1",
      "activity-1",
      "breathing",
      {},
      true,
    );
  });

  test("opens saved writing progress in the intention mirror", async () => {
    mockedStart.mockResolvedValue(progress("writing"));

    const screen = await render(
      <WeekOneFlow activityId="activity-1" onExit={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Intention Mirror")).toBeTruthy();
    });
  });

  test("saves without advancing before returning to the curriculum", async () => {
    const onExit = jest.fn();
    mockedStart.mockResolvedValue(progress("post_breathing_check_in", {
      post_breathing_urge: "no",
      post_breathing_note: "Stayed focused.",
    }));
    mockedSave.mockResolvedValue(progress("post_breathing_check_in", {
      post_breathing_urge: "no",
      post_breathing_note: "Stayed focused.",
    }));

    const screen = await render(
      <WeekOneFlow activityId="activity-1" onExit={onExit} />,
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText("What did you notice?").props.value,
      ).toBe("Stayed focused.");
    });
    await fireEvent.press(screen.getByText("Save and return to Week 1"));

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith(
      "user-1",
      "activity-1",
      "post_breathing_check_in",
      {
        post_breathing_urge: "no",
        post_breathing_note: "Stayed focused.",
      },
      false,
    );
  });

  test("requires a choice, submits its note, and blocks repeated taps", async () => {
    let finishSave;
    mockedStart.mockResolvedValue(progress("post_breathing_check_in"));
    mockedSave.mockImplementation(
      () => new Promise(resolve => { finishSave = resolve; }),
    );

    const screen = await render(
      <WeekOneFlow activityId="activity-1" onExit={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Choose Yes or No to continue.")).toBeTruthy();
    });
    expect(screen.getByRole("button", {
      name: "Save and continue",
    }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByText("Yes"));
    await fireEvent.changeText(
      screen.getByLabelText("What did you notice?"),
      "I reached for my phone.",
    );
    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Save and continue",
      }).props.accessibilityState.disabled).toBe(false);
    });

    const continueButton = screen.getByRole("button", {
      name: "Save and continue",
    });
    await fireEvent.press(continueButton);
    await fireEvent.press(continueButton);

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith(
      "user-1",
      "activity-1",
      "post_breathing_check_in",
      {
        post_breathing_urge: "yes",
        post_breathing_note: "I reached for my phone.",
      },
      true,
    );

    await act(async () => {
      finishSave(progress("writing"));
      await Promise.resolve();
    });
  });
});
