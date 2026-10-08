import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { useSignedInUserId } from "@/components/auth-gate";
import {
  clearBreathingSession,
  loadBreathingSession,
  saveBreathingSession,
} from "../../lib/breathing-session-storage";
import { saveProgressStep } from "../../lib/progress";

type BreathingState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

const SESSION_DURATION_MS = 10 * 60 * 1000;
const PERSIST_INTERVAL_MS = 5 * 1000;

export default function BreathingPlayer({
  activityId: providedActivityId,
  onContinue,
  onExit,
  isSaving = false,
}: {
  activityId?: string;
  onContinue?: () => Promise<boolean> | boolean | void;
  onExit?: () => void;
  isSaving?: boolean;
} = {}) {
  const { activityId: routeActivityId } = useLocalSearchParams<{ activityId?: string }>();
  const activityId = providedActivityId ?? routeActivityId;
  const userId = useSignedInUserId();
  const [state, setState] = useState<BreathingState>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRestoring, setIsRestoring] = useState(Boolean(activityId));
  const [storageError, setStorageError] = useState<string | null>(null);

  const accumulatedTimeRef = useRef(0);
  const activeStartTimeRef = useRef<number | null>(null);
  const stateRef = useRef<BreathingState>("idle");
  const savedCompletionRef = useRef(false);
  const sessionStartedAtRef = useRef(Date.now());
  const persistedBucketRef = useRef(0);
  const advancingRef = useRef(false);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const backgroundColor = isDarkMode ? "#121212" : "#ffffff";

  function changeState(newState: BreathingState) {
    stateRef.current = newState;
    setState(newState);
  }

  function queueStorage(operation: () => Promise<void>): Promise<boolean> {
    const pending = persistenceQueueRef.current.then(operation);
    persistenceQueueRef.current = pending.catch(() => undefined);
    return pending.then(() => true).catch(() => {
      if (mountedRef.current) {
        setStorageError("Could not save this breathing session on this device.");
      }
      return false;
    });
  }

  function persistSession(
    nextState: "running" | "paused",
    completed = false,
    accumulatedActiveMs = accumulatedTimeRef.current,
  ) {
    if (!activityId) return Promise.resolve(true);
    return queueStorage(() => saveBreathingSession(userId, {
      activityId,
      startedAt: sessionStartedAtRef.current,
      accumulatedActiveMs,
      state: nextState,
      completed,
      savedAt: Date.now(),
    }));
  }

  function clearPersistedSession() {
    if (!activityId) return Promise.resolve(true);
    return queueStorage(() => clearBreathingSession(userId, activityId));
  }

  function saveCurrentActiveTime() {
    if (activeStartTimeRef.current === null) {
      return accumulatedTimeRef.current;
    }

    const currentActiveTime =
      Date.now() - activeStartTimeRef.current;

    accumulatedTimeRef.current = Math.min(
      SESSION_DURATION_MS,
      accumulatedTimeRef.current + currentActiveTime,
    );
    activeStartTimeRef.current = null;

    setElapsedTime(accumulatedTimeRef.current);
    return accumulatedTimeRef.current;
  }

  async function saveCompletedBreathingStep() {
    if (!activityId || savedCompletionRef.current) return;
    savedCompletionRef.current = true;

    try {
      await saveProgressStep(userId, activityId, "post_breathing_check_in");
      await clearPersistedSession();
    } catch (error) {
      savedCompletionRef.current = false;
      Alert.alert(
        "Unable to save progress",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    accumulatedTimeRef.current = 0;
    activeStartTimeRef.current = null;
    savedCompletionRef.current = false;
    persistedBucketRef.current = 0;
    setElapsedTime(0);
    changeState("idle");
    setStorageError(null);

    if (!activityId) {
      setIsRestoring(false);
      return () => { mountedRef.current = false; };
    }

    setIsRestoring(true);
    void loadBreathingSession(userId, activityId).then((session) => {
      if (cancelled || !session) return;
      const restoredElapsed = Math.min(
        SESSION_DURATION_MS,
        Math.max(0, session.accumulatedActiveMs),
      );
      sessionStartedAtRef.current = session.startedAt;
      accumulatedTimeRef.current = restoredElapsed;
      persistedBucketRef.current = Math.floor(restoredElapsed / PERSIST_INTERVAL_MS);
      setElapsedTime(restoredElapsed);
      changeState(session.completed ? "completed" : "paused");
    }).catch(() => {
      if (!cancelled) setStorageError("Could not restore this breathing session.");
    }).finally(() => {
      if (!cancelled) setIsRestoring(false);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [userId, activityId]);

  useEffect(() => {
    if (state !== "running") {
      return;
    }

    const updateTimer = () => {
      if (activeStartTimeRef.current === null) {
        return;
      }

      const currentActiveTime =
        Date.now() - activeStartTimeRef.current;

      const totalElapsed =
        accumulatedTimeRef.current + currentActiveTime;

      if (totalElapsed >= SESSION_DURATION_MS) {
        accumulatedTimeRef.current = SESSION_DURATION_MS;
        activeStartTimeRef.current = null;

        setElapsedTime(SESSION_DURATION_MS);
        changeState("completed");
        void persistSession("paused", true, SESSION_DURATION_MS);
        if (!onContinue) void saveCompletedBreathingStep();
        return;
      }

      setElapsedTime(totalElapsed);
      const bucket = Math.floor(totalElapsed / PERSIST_INTERVAL_MS);
      if (bucket > persistedBucketRef.current) {
        persistedBucketRef.current = bucket;
        void persistSession("running", false, totalElapsed);
      }
    };

    updateTimer();

    const interval = setInterval(updateTimer, 250);

    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (
          (nextAppState === "background" ||
            nextAppState === "inactive") &&
          stateRef.current === "running"
        ) {
          const totalElapsed = saveCurrentActiveTime();
          changeState("paused");
          void persistSession("paused", false, totalElapsed);
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  function handleStart() {
    if (state === "idle" && !isRestoring) {
      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();
      sessionStartedAtRef.current = Date.now();
      persistedBucketRef.current = 0;

      setElapsedTime(0);
      setStorageError(null);
      changeState("running");
      void persistSession("running");
    }
  }

  function handlePause() {
    if (state === "running") {
      const totalElapsed = saveCurrentActiveTime();
      changeState("paused");
      void persistSession("paused", false, totalElapsed);
    }
  }

  function handleResume() {
    if (state === "paused") {
      activeStartTimeRef.current = Date.now();
      changeState("running");
      void persistSession("running");
    }
  }

  function handleRestart() {
    if (
      state === "running" ||
      state === "paused" ||
      state === "completed"
    ) {
      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();
      sessionStartedAtRef.current = Date.now();
      persistedBucketRef.current = 0;
      savedCompletionRef.current = false;

      setElapsedTime(0);
      setStorageError(null);
      changeState("running");
      void persistSession("running", false, 0);
    }
  }

  async function exitSession() {
    changeState("exited");

    accumulatedTimeRef.current = 0;
    activeStartTimeRef.current = null;
    setElapsedTime(0);
    await clearPersistedSession();

    if (onExit) onExit();
    else router.replace("/");

    setTimeout(() => {
      changeState("idle");
    }, 0);
  }

  function handleExit() {
    if (
      state !== "idle" &&
      state !== "running" &&
      state !== "paused" &&
      state !== "completed"
    ) {
      return;
    }

    if (state === "idle" || state === "completed") {
      void exitSession();
      return;
    }

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Exit breathing session? Your current progress will be discarded.",
      );

      if (confirmed) {
        void exitSession();
      }

      return;
    }

    Alert.alert(
      "Exit breathing session?",
      "Your current progress will be discarded.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => void exitSession(),
        },
      ],
    );
  }

  async function handleContinue() {
    if (!onContinue || advancingRef.current) return;
    advancingRef.current = true;
    try {
      const advanced = await onContinue();
      if (advanced !== false) await clearPersistedSession();
    } finally {
      advancingRef.current = false;
    }
  }

  const remainingTime = Math.max(
    0,
    SESSION_DURATION_MS - elapsedTime,
  );

  const totalSeconds = Math.ceil(remainingTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const formattedTime =
    `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: textColor }]}>
        {onContinue ? "Practice · Mindful breathing" : "Breathing Player"}
      </Text>

      <Text accessibilityLiveRegion="polite" style={[styles.state, { color: textColor }]}>
        Current State: {state}
      </Text>

      {isRestoring && (
        <Text accessibilityLiveRegion="polite" style={[styles.state, { color: textColor }]}>
          Restoring saved session…
        </Text>
      )}

      {storageError && (
        <Text accessibilityRole="alert" style={styles.errorText}>{storageError}</Text>
      )}

      <Text accessibilityRole="timer" accessibilityLabel={`${minutes} minutes and ${seconds} seconds remaining`}
        style={[styles.timer, { color: textColor }]}>
        {formattedTime}
      </Text>

      <Pressable style={styles.button} onPress={handleStart} accessibilityRole="button"
        accessibilityLabel="Start breathing session" accessibilityHint="Starts the ten-minute timer."
        disabled={state !== "idle" || isRestoring}
        accessibilityState={{ disabled: state !== "idle" || isRestoring, busy: isRestoring }}>
        <Text style={styles.buttonText}>Start</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handlePause} accessibilityRole="button"
        accessibilityLabel="Pause breathing session" accessibilityHint="Pauses the timer and keeps your elapsed time."
        disabled={state !== "running"} accessibilityState={{ disabled: state !== "running" }}>
        <Text style={styles.buttonText}>Pause</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleResume} accessibilityRole="button"
        accessibilityLabel="Resume breathing session" accessibilityHint="Continues your paused timer."
        disabled={state !== "paused"} accessibilityState={{ disabled: state !== "paused" }}>
        <Text style={styles.buttonText}>Resume</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleRestart} accessibilityRole="button"
        accessibilityLabel="Restart breathing session" accessibilityHint="Starts again with a full ten-minute timer."
        disabled={state === "idle" || state === "exited"}
        accessibilityState={{ disabled: state === "idle" || state === "exited" }}>
        <Text style={styles.buttonText}>Restart</Text>
      </Pressable>

      <Pressable style={styles.exitButton} onPress={handleExit} accessibilityRole="button"
        accessibilityLabel="Exit breathing session" accessibilityHint="Returns to Week 1. You will be asked before discarding an active session.">
        <Text style={styles.buttonText}>Exit</Text>
      </Pressable>
      {state === "completed" && onContinue && (
        <Pressable style={styles.button} accessibilityRole="button" disabled={isSaving}
          accessibilityState={{ disabled: isSaving, busy: isSaving }} onPress={() => void handleContinue()}>
          <Text style={styles.buttonText}>Continue to check-in</Text>
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
    maxWidth: 200,
  },

  exitButton: {
    minHeight: 48,
    minWidth: 48,
    backgroundColor: "#41644a",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    maxWidth: 200,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
