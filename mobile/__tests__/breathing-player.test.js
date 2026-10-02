import React from "react";
import { Alert, AppState } from "react-native";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import BreathingPlayer from "../src/app/breathing-player";
import {
  clearBreathingSession,
  loadBreathingSession,
  saveBreathingSession,
} from "../lib/breathing-session-storage";

jest.mock("@/components/auth-gate", () => ({
  useSignedInUserId: () => "user-1",
}));

jest.mock("../lib/progress", () => ({
  saveProgressStep: jest.fn(),
}));

jest.mock("../lib/breathing-session-storage", () => ({
  clearBreathingSession: jest.fn(),
  loadBreathingSession: jest.fn(),
  saveBreathingSession: jest.fn(),
}));

const mockedClear = clearBreathingSession;
const mockedLoad = loadBreathingSession;
const mockedSave = saveBreathingSession;

let appStateHandler;

function persistedSession(overrides = {}) {
  return {
    activityId: "activity-1",
    startedAt: Date.now() - 5000,
    accumulatedActiveMs: 5000,
    state: "paused",
    completed: false,
    savedAt: Date.now(),
    ...overrides,
  };
}

async function renderReadyPlayer(props = {}) {
  const screen = await render(
    <BreathingPlayer activityId="activity-1" {...props} />,
  );

  await waitFor(() => {
    expect(screen.queryByText("Restoring saved session…")).toBeNull();
  });

  return screen;
}

describe("BreathingPlayer persistence and navigation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));

    mockedLoad.mockResolvedValue(null);
    mockedSave.mockResolvedValue(undefined);
    mockedClear.mockResolvedValue(undefined);

    appStateHandler = undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(
      (_eventName, listener) => {
        appStateHandler = listener;
        return { remove: jest.fn() };
      },
    );
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(async () => {
    await cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("starts, pauses, resumes, and persists when backgrounded", async () => {
    const screen = await renderReadyPlayer();

    await fireEvent.press(screen.getByText("Start"));
    await waitFor(() => {
      expect(screen.getByText("Current State: running")).toBeTruthy();
    });

    await act(() => {
      jest.setSystemTime(Date.now() + 6000);
      appStateHandler("background");
    });

    expect(screen.getByText("Current State: paused")).toBeTruthy();
    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          activityId: "activity-1",
          accumulatedActiveMs: 6000,
          state: "paused",
          completed: false,
        }),
      );
    });

    await fireEvent.press(screen.getByText("Resume"));
    await waitFor(() => {
      expect(screen.getByText("Current State: running")).toBeTruthy();
    });
  });

  test("restores a running saved session as paused", async () => {
    mockedLoad.mockResolvedValue(
      persistedSession({ state: "running" }),
    );

    const screen = await renderReadyPlayer();

    expect(screen.getByText("Current State: paused")).toBeTruthy();
    expect(screen.getByText("9:55")).toBeTruthy();
  });

  test("a completed session advances once and then clears storage", async () => {
    mockedLoad.mockResolvedValue(
      persistedSession({
        accumulatedActiveMs: 600000,
        completed: true,
      }),
    );

    let finishAdvance;
    const onContinue = jest.fn(
      () => new Promise(resolve => { finishAdvance = resolve; }),
    );
    const screen = await renderReadyPlayer({ onContinue });

    expect(screen.getByText("Current State: completed")).toBeTruthy();
    const continueButton = screen.getByText("Continue to check-in");

    await fireEvent.press(continueButton);
    await fireEvent.press(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishAdvance(true);
      await Promise.resolve();
    });

    expect(mockedClear).toHaveBeenCalledWith("user-1", "activity-1");
  });

  test("confirmed early exit clears storage without advancing", async () => {
    const onExit = jest.fn();
    const onContinue = jest.fn();
    const screen = await renderReadyPlayer({ onContinue, onExit });

    await fireEvent.press(screen.getByText("Start"));
    await fireEvent.press(screen.getByText("Exit"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    const buttons = Alert.alert.mock.calls[0][2];
    const exitButton = buttons.find(button => button.text === "Exit");

    await act(async () => {
      exitButton.onPress();
      await Promise.resolve();
    });

    expect(mockedClear).toHaveBeenCalledWith("user-1", "activity-1");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
