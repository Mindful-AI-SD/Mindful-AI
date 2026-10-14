
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

describe("Reusable practice player", () => {
  let appStateHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(
      new Date("2026-10-01T12:00:00Z")
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

  test("timed practice completes at its duration", async () => {
    const onComplete = jest.fn();

    const { result } = await renderPracticePlayer({
      durationMs: 5000,
      onComplete,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.state).toBe("completed");
    expect(result.current.remainingMs).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("pause prevents time from advancing", async () => {
    const { result } = await renderPracticePlayer({
      durationMs: 10000,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await act(async () => {
      result.current.pause();
    });

    const pausedTime = result.current.elapsedMs;

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.state).toBe("paused");
    expect(result.current.elapsedMs).toBe(pausedTime);

    await act(async () => {
      result.current.resume();
    });

    expect(result.current.state).toBe("running");
  });

  test("backgrounding pauses the practice", async () => {
    const { result } = await renderPracticePlayer({
      durationMs: 10000,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(appStateHandler).toBeDefined();

    await act(async () => {
      appStateHandler("background");
    });

    expect(result.current.state).toBe("paused");
    expect(result.current.elapsedMs).toBe(2000);
  });

  test("open-ended practice finishes manually", async () => {
    const onComplete = jest.fn();

    const { result } = await renderPracticePlayer({
      instructions: ["Walk mindfully."],
      onComplete,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await act(async () => {
      result.current.finish();
    });

    expect(result.current.state).toBe("completed");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.remainingMs).toBeNull();
    expect(result.current.instructions).toEqual([
      "Walk mindfully.",
    ]);
  });

  test("exiting early never completes practice", async () => {
    const onComplete = jest.fn();

    const { result } = await renderPracticePlayer({
      durationMs: 10000,
      onComplete,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      result.current.exit();
    });

    expect(result.current.state).toBe("exited");
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("restart resets elapsed time", async () => {
    const { result } = await renderPracticePlayer({
      durationMs: 10000,
    });

    await act(async () => {
      result.current.start();
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await act(async () => {
      result.current.restart();
    });

    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.state).toBe("running");
  });
});
