import React from "react";
import {
  act,
  cleanup,
  render,
  waitFor,
} from "@testing-library/react-native";
import { AppState, Text } from "react-native";

import { usePracticePlayer } from "../src/hooks/use-practice-player";

async function renderPracticePlayer(options) {
  const result = { current: null };

  function TestComponent() {
    result.current = usePracticePlayer(options);
    return <Text>Practice Player Test</Text>;
  }

  const screen = await render(<TestComponent />);

  await waitFor(() => {
    expect(result.current).not.toBeNull();
  });

  return {
    ...screen,
    result,
  };
}

describe("Practice background behavior", () => {
  let appStateHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(
      new Date("2026-11-06T12:00:00Z"),
    );

    appStateHandler = undefined;

    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, handler) => {
        appStateHandler = handler;
        return { remove: jest.fn() };
      });
  });

  afterEach(async () => {
    await act(async () => {
      cleanup();
    });

    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test(
    "backgrounding pauses instead of completing after the timer duration",
    async () => {
      const onComplete = jest.fn();

      const { result } = await renderPracticePlayer({
        durationMs: 10000,
        pauseOnBackground: true,
        onComplete,
      });

      expect(appStateHandler).toBeDefined();

      await act(async () => {
        result.current.start();
      });

      expect(result.current.state).toBe("running");

      const startedAt = Date.now();

      await act(async () => {
        jest.setSystemTime(startedAt + 11000);
        appStateHandler("background");
      });

      expect(result.current.state).toBe("paused");
      expect(result.current.elapsedMs).toBe(10000);
      expect(onComplete).not.toHaveBeenCalled();
    },
  );
});