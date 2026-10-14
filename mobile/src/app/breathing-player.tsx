
import { router, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { useSignedInUserId } from "@/components/auth-gate";
import { usePracticePlayer } from "@/hooks/use-practice-player";
import type {
  PracticePlayerState,
  PracticeSession,
} from "@/components/practice-player.types";

import {
  clearBreathingSession,
  loadBreathingSession,
  saveBreathingSession,
} from "../../lib/breathing-session-storage";
import { saveProgressStep } from "../../lib/progress";

const SESSION_DURATION_MS = 10 * 60 * 1000;
const PERSIST_INTERVAL_MS = 5 * 1000;

interface BreathingPlayerProps {
  activityId?: string;
  onContinue?: () => Promise<boolean> | boolean | void;
  onExit?: () => void;
  isSaving?: boolean;
  durationMs?: number;
  instructions?: string[];
  practiceTitle?: string;
}

export default function BreathingPlayer({
  activityId: providedActivityId,
  onContinue,
  onExit,
  isSaving = false,
  durationMs = SESSION_DURATION_MS,
  instructions = [],
  practiceTitle,
}: BreathingPlayerProps = {}) {
  const { activityId: routeActivityId } =
    useLocalSearchParams<{ activityId?: string }>();

  const activityId =
    providedActivityId ?? routeActivityId;

  const userId = useSignedInUserId();

  const [isRestoring, setIsRestoring] =
    useState(Boolean(activityId));

  const [storageError, setStorageError] =
    useState<string | null>(null);

  const sessionStartedAtRef = useRef(Date.now());
  const persistedBucketRef = useRef(0);
  const savedCompletionRef = useRef(false);
  const advancingRef = useRef(false);
  const mountedRef = useRef(true);
  const restoringRef = useRef(Boolean(activityId));

  const persistenceQueueRef =
    useRef<Promise<void>>(Promise.resolve());

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const backgroundColor =
    isDarkMode ? "#121212" : "#ffffff";

  const title =
    practiceTitle ??
    (onContinue
      ? "Practice · Mindful breathing"
      : "Breathing Player");

  const actionLabel = practiceTitle ?? "breathing session";

  const queueStorage = useCallback(
    (operation: () => Promise<void>): Promise<boolean> => {
      const pending =
        persistenceQueueRef.current.then(operation);

      persistenceQueueRef.current =
        pending.catch(() => undefined);

      return pending
        .then(() => true)
        .catch(() => {
          if (mountedRef.current) {
            setStorageError(
              "Could not save this breathing session on this device.",
            );
          }
          return false;
        });
    },
    [],
  );

  const persistSession = useCallback(
    (
      nextState: "running" | "paused",
      completed = false,
      accumulatedActiveMs = 0,
    ) => {
      if (!activityId) return Promise.resolve(true);

      return queueStorage(() =>
        saveBreathingSession(userId, {
          activityId,
          startedAt: sessionStartedAtRef.current,
          accumulatedActiveMs,
          state: nextState,
          completed,
          savedAt: Date.now(),
        }),
      );
    },
    [activityId, userId, queueStorage],
  );

  const clearPersistedSession = useCallback(() => {
    if (!activityId) return Promise.resolve(true);

    return queueStorage(() =>
      clearBreathingSession(userId, activityId),
    );
  }, [activityId, userId, queueStorage]);

  const saveCompletedBreathingStep =
    useCallback(async () => {
      if (!activityId || savedCompletionRef.current) {
        return;
      }

      savedCompletionRef.current = true;

      try {
        await saveProgressStep(
          userId,
          activityId,
          "post_breathing_check_in",
        );

        const cleared =
          await clearPersistedSession();

        if (!cleared) {
          throw new Error(
            "Progress saved, but local session clearing failed.",
          );
        }
      } catch (error) {
        savedCompletionRef.current = false;

        Alert.alert(
          "Unable to save progress",
          error instanceof Error
            ? error.message
            : "Please try again.",
        );
      }
    }, [
      activityId,
      userId,
      clearPersistedSession,
    ]);

  const handlePlayerStateChange = useCallback(
    (nextState: PracticePlayerState, elapsed: number) => {
      if (restoringRef.current) return;

      if (nextState === "running") {
        if (elapsed === 0) {
          sessionStartedAtRef.current = Date.now();
          persistedBucketRef.current = 0;
          savedCompletionRef.current = false;
        }

        setStorageError(null);
        void persistSession("running", false, elapsed);
      }

      if (nextState === "paused") {
        void persistSession("paused", false, elapsed);
      }

      if (nextState === "completed") {
        void persistSession("paused", true, elapsed);
      }
    },
    [persistSession],
  );

  const handleTick = useCallback(
    (elapsed: number) => {
      if (restoringRef.current) return;

      const bucket =
        Math.floor(elapsed / PERSIST_INTERVAL_MS);

      if (bucket > persistedBucketRef.current) {
        persistedBucketRef.current = bucket;
        void persistSession("running", false, elapsed);
      }
    },
    [persistSession],
  );

  const handlePlayerComplete = useCallback(() => {
    if (!onContinue) {
      void saveCompletedBreathingStep();
    }
  }, [onContinue, saveCompletedBreathingStep]);

  const player = usePracticePlayer({
    durationMs,
    instructions,
    pauseOnBackground: true,
    allowManualFinish: false,
    onComplete: handlePlayerComplete,
    onStateChange: handlePlayerStateChange,
    onTick: handleTick,
  });

  const {
    state,
    remainingMs,
    start,
    pause,
    resume,
    restart,
    exit,
    restore,
  } = player;

  useEffect(() => {
    mountedRef.current = true;
    restoringRef.current = true;

    let cancelled = false;

    savedCompletionRef.current = false;
    persistedBucketRef.current = 0;
    persistenceQueueRef.current = Promise.resolve();
    setStorageError(null);

    if (!activityId) {
      restore(null);
      restoringRef.current = false;
      setIsRestoring(false);

      return () => {
        cancelled = true;
        mountedRef.current = false;
      };
    }

    setIsRestoring(true);

    void loadBreathingSession(userId, activityId)
      .then(session => {
        if (cancelled) return;

        if (!session) {
          restore(null);
          return;
        }

        sessionStartedAtRef.current =
          session.startedAt;

        const restoredElapsed = Math.min(
          durationMs,
          Math.max(0, session.accumulatedActiveMs),
        );

        persistedBucketRef.current = Math.floor(
          restoredElapsed / PERSIST_INTERVAL_MS,
        );

        // A completed session must have full active time.
        // Never trust a completion flag on a short session.
        const validCompletion =
          session.completed &&
          restoredElapsed >= durationMs;

        const practiceSession: PracticeSession = {
          practiceId: activityId,
          state: validCompletion
            ? "completed"
            : "paused",
          elapsedActiveMs: restoredElapsed,
          startedAt: session.startedAt,
          lastSavedAt: session.savedAt,
          completed: validCompletion,
        };

        restore(practiceSession);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageError(
            "Could not restore this breathing session.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          restoringRef.current = false;
          setIsRestoring(false);
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [userId, activityId, durationMs, restore]);

  const handleStart = () => {
    if (isRestoring || state !== "idle") return;

    sessionStartedAtRef.current = Date.now();
    persistedBucketRef.current = 0;
    savedCompletionRef.current = false;
    start();
  };

  const handleRestart = () => {
    if (isRestoring) return;

    sessionStartedAtRef.current = Date.now();
    persistedBucketRef.current = 0;
    savedCompletionRef.current = false;
    restart();
  };

  const exitSession = async () => {
    exit();

    const cleared =
      await clearPersistedSession();

    if (!cleared) return;

    if (onExit) {
      onExit();
    } else {
      router.replace("/");
    }
  };

  const handleExit = () => {
    if (isRestoring || state === "exited") return;

    if (
      state === "idle" ||
      state === "completed"
    ) {
      void exitSession();
      return;
    }

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Exit practice? Your current progress will be discarded.",
      );
      if (confirmed) void exitSession();
      return;
    }

    Alert.alert(
      "Exit practice?",
      "Your current progress will be discarded.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => void exitSession(),
        },
      ],
    );
  };

  const handleContinue = async () => {
    if (
      !onContinue ||
      advancingRef.current ||
      state !== "completed" ||
      isRestoring ||
      isSaving
    ) {
      return;
    }

    advancingRef.current = true;

    try {
      const advanced = await onContinue();

      if (advanced !== false) {
        await clearPersistedSession();
      }
    } catch (error) {
      Alert.alert(
        "Unable to continue",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      advancingRef.current = false;
    }
  };

  const totalSeconds =
    Math.ceil((remainingMs ?? 0) / 1000);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const formattedTime =
    `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <View
      style={[styles.container, { backgroundColor }]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: textColor }]}
      >
        {title}
      </Text>

      <Text
        accessibilityLiveRegion="polite"
        style={[styles.state, { color: textColor }]}
      >
        Current State: {state}
      </Text>

      {isRestoring && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.state, { color: textColor }]}
        >
          Restoring saved session…
        </Text>
      )}

      {storageError && (
        <Text
          accessibilityRole="alert"
          style={styles.errorText}
        >
          {storageError}
        </Text>
      )}

      {instructions.map((instruction, index) => (
        <Text
          key={index}
          style={[styles.instruction, { color: textColor }]}
        >
          {instruction}
        </Text>
      ))}

      <Text
        accessibilityRole="timer"
        accessibilityLabel={
          `${minutes} minutes and ${seconds} seconds remaining`
        }
        style={[styles.timer, { color: textColor }]}
      >
        {formattedTime}
      </Text>

      <Pressable
        style={styles.button}
        onPress={handleStart}
        accessibilityRole="button"
        accessibilityLabel={`Start ${actionLabel}`}
        accessibilityHint="Starts the practice timer."
        disabled={state !== "idle" || isRestoring}
        accessibilityState={{
          disabled: state !== "idle" || isRestoring,
          busy: isRestoring,
        }}
      >
        <Text style={styles.buttonText}>Start</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={pause}
        accessibilityRole="button"
        accessibilityLabel={`Pause ${actionLabel}`}
        accessibilityHint="Pauses the timer and keeps elapsed time."
        disabled={state !== "running" || isRestoring}
        accessibilityState={{
          disabled: state !== "running" || isRestoring,
        }}
      >
        <Text style={styles.buttonText}>Pause</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={resume}
        accessibilityRole="button"
        accessibilityLabel={`Resume ${actionLabel}`}
        accessibilityHint="Continues the paused timer."
        disabled={state !== "paused" || isRestoring}
        accessibilityState={{
          disabled: state !== "paused" || isRestoring,
        }}
      >
        <Text style={styles.buttonText}>Resume</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={handleRestart}
        accessibilityRole="button"
        accessibilityLabel={`Restart ${actionLabel}`}
        accessibilityHint="Starts a fresh practice timer."
        disabled={
          isRestoring ||
          state === "idle" ||
          state === "exited"
        }
        accessibilityState={{
          disabled:
            isRestoring ||
            state === "idle" ||
            state === "exited",
        }}
      >
        <Text style={styles.buttonText}>Restart</Text>
      </Pressable>

      <Pressable
        style={styles.exitButton}
        onPress={handleExit}
        accessibilityRole="button"
        accessibilityLabel={`Exit ${actionLabel}`}
        accessibilityHint="Exits this practice. Active time is discarded after confirmation."
        disabled={isRestoring || state === "exited"}
        accessibilityState={{
          disabled: isRestoring || state === "exited",
        }}
      >
        <Text style={styles.buttonText}>Exit</Text>
      </Pressable>

      {state === "completed" && onContinue && (
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          disabled={isSaving || advancingRef.current}
          accessibilityState={{
            disabled: isSaving || advancingRef.current,
            busy: isSaving || advancingRef.current,
          }}
          onPress={() => void handleContinue()}
        >
          <Text style={styles.buttonText}>
            Continue to check-in
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: Platform.OS === "web" ? 88 : 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  state: {
    fontSize: 18,
  },
  instruction: {
    fontSize: 16,
    lineHeight: 24,
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
  },
  timer: {
    fontSize: 48,
    fontWeight: "700",
  },
  button: {
    minHeight: 48,
    minWidth: 48,
    backgroundColor: "#41644a",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    maxWidth: 240,
  },
  exitButton: {
    minHeight: 48,
    minWidth: 48,
    backgroundColor: "#41644a",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    maxWidth: 240,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
