
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import type {
  PracticePlayerState,
  PracticeSession,
} from "../components/practice-player.types";

export interface PracticePlayerOptions {
  durationMs?: number;
  instructions?: string[];
  pauseOnBackground?: boolean;
  allowManualFinish?: boolean;
  onComplete?: () => void;
  onStateChange?: (
    state: PracticePlayerState,
    elapsedMs: number,
  ) => void;
  onTick?: (elapsedMs: number) => void;
}

export interface PracticePlayerControls {
  state: PracticePlayerState;
  elapsedMs: number;
  remainingMs: number | null;
  instructions: string[];
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  finish: () => void;
  exit: () => void;
  restore: (session: PracticeSession | null) => void;
}

export function usePracticePlayer(
  options: PracticePlayerOptions,
  restoredSession?: PracticeSession | null,
): PracticePlayerControls {
  const {
    durationMs,
    instructions = [],
    pauseOnBackground = true,
    allowManualFinish = durationMs === undefined,
    onComplete,
    onStateChange,
    onTick,
  } = options;

  const validDuration =
    durationMs !== undefined &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? durationMs
      : null;

  const clampElapsed = useCallback(
    (value: number) => {
      const safe = Number.isFinite(value)
        ? Math.max(0, value)
        : 0;

      return validDuration === null
        ? safe
        : Math.min(safe, validDuration);
    },
    [validDuration],
  );

  const initialElapsed = clampElapsed(
    restoredSession?.elapsedActiveMs ?? 0,
  );

  const initialState: PracticePlayerState =
    restoredSession
      ? restoredSession.completed
        ? "completed"
        : "paused"
      : "idle";

  const [state, setState] =
    useState<PracticePlayerState>(initialState);

  const [elapsedMs, setElapsedMs] =
    useState(initialElapsed);

  // Explicit type prevents TypeScript from narrowing
  // the ref to only idle, paused, and completed.
  const stateRef = useRef<PracticePlayerState>(
    initialState,
  );

  const accumulatedRef = useRef(initialElapsed);
  const activeStartRef = useRef<number | null>(null);

  const completionNotifiedRef = useRef(
    restoredSession?.completed ?? false,
  );

  const callbacksRef = useRef({
    onComplete,
    onStateChange,
    onTick,
  });

  callbacksRef.current = {
    onComplete,
    onStateChange,
    onTick,
  };

  const updateState = useCallback(
    (
      next: PracticePlayerState,
      elapsed: number,
      notify = true,
    ) => {
      stateRef.current = next;
      setState(next);
      setElapsedMs(elapsed);

      if (notify) {
        callbacksRef.current.onStateChange?.(
          next,
          elapsed,
        );
      }
    },
    [],
  );

  const captureElapsed = useCallback(() => {
    if (activeStartRef.current !== null) {
      accumulatedRef.current += Math.max(
        0,
        Date.now() - activeStartRef.current,
      );

      activeStartRef.current = null;
    }

    accumulatedRef.current = clampElapsed(
      accumulatedRef.current,
    );

    setElapsedMs(accumulatedRef.current);

    return accumulatedRef.current;
  }, [clampElapsed]);

  const complete = useCallback(() => {
    if (
      stateRef.current !== "running" &&
      stateRef.current !== "paused"
    ) {
      return;
    }

    const elapsed = captureElapsed();

    updateState("completed", elapsed);

    if (!completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      callbacksRef.current.onComplete?.();
    }
  }, [captureElapsed, updateState]);

  const start = useCallback(() => {
    if (stateRef.current !== "idle") return;

    accumulatedRef.current = 0;
    activeStartRef.current = Date.now();
    completionNotifiedRef.current = false;

    updateState("running", 0);
  }, [updateState]);

  const pause = useCallback(() => {
    if (stateRef.current !== "running") return;

    const elapsed = captureElapsed();

    if (
      validDuration !== null &&
      elapsed >= validDuration
    ) {
      complete();
      return;
    }

    updateState("paused", elapsed);
  }, [
    captureElapsed,
    complete,
    updateState,
    validDuration,
  ]);

  const resume = useCallback(() => {
    if (stateRef.current !== "paused") return;

    if (
      validDuration !== null &&
      accumulatedRef.current >= validDuration
    ) {
      complete();
      return;
    }

    activeStartRef.current = Date.now();

    updateState(
      "running",
      accumulatedRef.current,
    );
  }, [
    complete,
    updateState,
    validDuration,
  ]);

  const restart = useCallback(() => {
    if (
      stateRef.current !== "running" &&
      stateRef.current !== "paused" &&
      stateRef.current !== "completed"
    ) {
      return;
    }

    accumulatedRef.current = 0;
    activeStartRef.current = Date.now();
    completionNotifiedRef.current = false;

    updateState("running", 0);
  }, [updateState]);

  const finish = useCallback(() => {
    if (!allowManualFinish) return;

    complete();
  }, [allowManualFinish, complete]);

  const exit = useCallback(() => {
    if (stateRef.current === "exited") return;

    activeStartRef.current = null;
    accumulatedRef.current = 0;

    updateState("exited", 0);
  }, [updateState]);

  const restore = useCallback(
    (session: PracticeSession | null) => {
      activeStartRef.current = null;

      const elapsed = clampElapsed(
        session?.elapsedActiveMs ?? 0,
      );

      accumulatedRef.current = elapsed;

      completionNotifiedRef.current =
        session?.completed ?? false;

      const restoredState: PracticePlayerState =
        !session
          ? "idle"
          : session.completed
            ? "completed"
            : "paused";

      updateState(
        restoredState,
        elapsed,
        false,
      );
    },
    [clampElapsed, updateState],
  );

  useEffect(() => {
    if (state !== "running") return;

    const interval = setInterval(() => {
      if (
        stateRef.current !== "running" ||
        activeStartRef.current === null
      ) {
        return;
      }

      const elapsed = clampElapsed(
        accumulatedRef.current +
          Math.max(
            0,
            Date.now() - activeStartRef.current,
          ),
      );

      if (
        validDuration !== null &&
        elapsed >= validDuration
      ) {
        complete();
      } else {
        setElapsedMs(elapsed);
        callbacksRef.current.onTick?.(elapsed);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [
    state,
    validDuration,
    clampElapsed,
    complete,
  ]);

  useEffect(() => {
    if (!pauseOnBackground) return;

    const subscription = AppState.addEventListener(
      "change",
      nextState => {
        if (
          nextState !== "active" &&
          stateRef.current === "running"
        ) {
          const elapsed = captureElapsed();

          if (
            validDuration !== null &&
            elapsed >= validDuration
          ) {
            complete();
          } else {
            updateState("paused", elapsed);
          }
        }
      },
    );

    return () => subscription.remove();
  }, [
    pauseOnBackground,
    captureElapsed,
    updateState,
    complete,
    validDuration,
  ]);

  return {
    state,
    elapsedMs,
    remainingMs:
      validDuration === null
        ? null
        : Math.max(0, validDuration - elapsedMs),
    instructions,
    start,
    pause,
    resume,
    restart,
    finish,
    exit,
    restore,
  };
}
