import { router, useLocalSearchParams } from "expo-router";

import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { completeBreathingStep } from "../../lib/progress";
import { supabase } from "../../lib/supabase";

import {
  clearBreathingSession,
  loadBreathingSession,
  saveBreathingSession,
} from "../../lib/breathing-session-storage";

type BreathingState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

const SESSION_DURATION_MS = 10 * 60 * 1000;

export default function BreathingPlayer() {
  const params = useLocalSearchParams<{
    activityId?: string;
  }>();

  const activityId =
    typeof params.activityId === "string"
      ? params.activityId
      : "";

  const [state, setState] =
    useState<BreathingState>("idle");

  const [elapsedTime, setElapsedTime] =
    useState(0);

  const [isCompleting, setIsCompleting] =
    useState(false);

  const [isRestoring, setIsRestoring] =
    useState(true);

  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  const accumulatedTimeRef = useRef(0);

  const activeStartTimeRef = useRef<number | null>(
    null,
  );

  const sessionStartedAtRef = useRef<number | null>(
    null,
  );

  const stateRef = useRef<BreathingState>("idle");

  // Prevents completion from being handled twice.
  const completionHandledRef = useRef(false);

  // Prevents the saved session from being restored twice.
  const restorationHandledRef = useRef(false);

  const colorScheme = useColorScheme();

  const isDarkMode = colorScheme === "dark";

  const textColor = isDarkMode
    ? "#ffffff"
    : "#000000";

  const backgroundColor = isDarkMode
    ? "#121212"
    : "#ffffff";

  function changeState(newState: BreathingState) {
    stateRef.current = newState;
    setState(newState);
  }

  async function getCurrentUserId() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      throw new Error(
        "Please sign in again before continuing.",
      );
    }

    return session.user.id;
  }

  async function persistSession(
    persistedState: "running" | "paused",
    accumulatedOverride?: number,
  ) {
    if (
      !activityId ||
      sessionStartedAtRef.current === null
    ) {
      return;
    }

    try {
      const userId = await getCurrentUserId();

      const accumulatedActiveMs =
        accumulatedOverride ??
        accumulatedTimeRef.current;

      await saveBreathingSession(userId, {
        activityId,
        startedAt: sessionStartedAtRef.current,

        accumulatedActiveMs: Math.min(
          accumulatedActiveMs,
          SESSION_DURATION_MS,
        ),

        state: persistedState,

        // We never manufacture completion from
        // restored local state.
        completed: false,

        savedAt: Date.now(),
      });
    } catch (error) {
      console.error(
        "Could not save breathing session:",
        error,
      );
    }
  }

  async function clearSavedSession() {
    if (!activityId) {
      return;
    }

    try {
      const userId = await getCurrentUserId();

      await clearBreathingSession(
        userId,
        activityId,
      );
    } catch (error) {
      console.error(
        "Could not clear breathing session:",
        error,
      );
    }
  }

  useEffect(() => {
    if (restorationHandledRef.current) {
      return;
    }

    restorationHandledRef.current = true;

    async function restoreSession() {
      if (!activityId) {
        setIsRestoring(false);
        return;
      }

      try {
        const userId = await getCurrentUserId();

        const savedSession =
          await loadBreathingSession(
            userId,
            activityId,
          );

        if (!savedSession) {
          setIsRestoring(false);
          return;
        }

        /*
         * Restore conservatively.
         *
         * We ONLY restore the accumulated active
         * time that was explicitly saved.
         *
         * We do NOT add:
         *
         * Date.now() - savedSession.savedAt
         *
         * because time while the app was closed
         * must never count toward completion.
         */
        const safeAccumulatedTime =
          Math.max(
            0,
            Math.min(
              savedSession.accumulatedActiveMs,
              SESSION_DURATION_MS - 1,
            ),
          );

        accumulatedTimeRef.current =
          safeAccumulatedTime;

        sessionStartedAtRef.current =
          savedSession.startedAt;

        activeStartTimeRef.current = null;

        completionHandledRef.current = false;

        setElapsedTime(
          safeAccumulatedTime,
        );

        setErrorMessage(null);

        /*
         * Even if the session was saved as
         * "running", reopening the app restores
         * it as paused.
         *
         * The user must explicitly press Resume.
         */
        changeState("paused");

        await saveBreathingSession(userId, {
          activityId,
          startedAt:
            savedSession.startedAt,

          accumulatedActiveMs:
            safeAccumulatedTime,

          state: "paused",
          completed: false,
          savedAt: Date.now(),
        });
      } catch (error) {
        console.error(
          "Could not restore breathing session:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not restore your previous breathing session.",
        );
      } finally {
        setIsRestoring(false);
      }
    }

    void restoreSession();
  }, [activityId]);

  function getCurrentActiveTime() {
    if (activeStartTimeRef.current === null) {
      return accumulatedTimeRef.current;
    }

    const currentActiveTime =
      Date.now() - activeStartTimeRef.current;

    return (
      accumulatedTimeRef.current +
      currentActiveTime
    );
  }

  function saveCurrentActiveTime() {
    if (activeStartTimeRef.current === null) {
      return accumulatedTimeRef.current;
    }

    const currentActiveTime =
      Date.now() - activeStartTimeRef.current;

    accumulatedTimeRef.current +=
      currentActiveTime;

    activeStartTimeRef.current = null;

    setElapsedTime(
      accumulatedTimeRef.current,
    );

    return accumulatedTimeRef.current;
  }

  async function finishBreathingSession() {
    if (completionHandledRef.current) {
      return;
    }

    completionHandledRef.current = true;
    setIsCompleting(true);
    setErrorMessage(null);

    try {
      if (!activityId) {
        throw new Error(
          "This breathing activity could not be identified.",
        );
      }

      const userId =
        await getCurrentUserId();

      await completeBreathingStep(
        userId,
        activityId,
      );

      /*
       * The legitimate completion is now stored
       * in Supabase, so the local temporary timer
       * state can be removed.
       */
      await clearBreathingSession(
        userId,
        activityId,
      );

      router.replace({
        pathname:
          "/post-breathing-check-in",
        params: {
          activityId,
        },
      });
    } catch (error) {
      completionHandledRef.current =
        false;

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your breathing progress.",
      );
    } finally {
      setIsCompleting(false);
    }
  }

  useEffect(() => {
    if (
      state !== "running" ||
      isRestoring
    ) {
      return;
    }

    const updateTimer = () => {
      if (
        activeStartTimeRef.current === null
      ) {
        return;
      }

      const totalElapsed =
        getCurrentActiveTime();

      if (
        totalElapsed >=
        SESSION_DURATION_MS
      ) {
        accumulatedTimeRef.current =
          SESSION_DURATION_MS;

        activeStartTimeRef.current = null;

        setElapsedTime(
          SESSION_DURATION_MS,
        );

        changeState("completed");

        return;
      }

      setElapsedTime(totalElapsed);
    };

    updateTimer();

    const interval = setInterval(
      updateTimer,
      250,
    );

    return () =>
      clearInterval(interval);
  }, [state, isRestoring]);

  useEffect(() => {
    if (state === "completed") {
      void finishBreathingSession();
    }
  }, [state]);

  /*
   * Save approximately once per second while
   * actively running.
   *
   * If the app is killed suddenly, we may lose
   * a small amount of time, but we will never
   * invent extra breathing time.
   */
  useEffect(() => {
    if (
      state !== "running" ||
      isRestoring
    ) {
      return;
    }

    const persistenceInterval =
      setInterval(() => {
        const currentTotal =
          getCurrentActiveTime();

        void persistSession(
          "running",
          currentTotal,
        );
      }, 1000);

    return () =>
      clearInterval(
        persistenceInterval,
      );
  }, [
    state,
    isRestoring,
    activityId,
  ]);

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            (nextAppState === "background" ||
              nextAppState === "inactive") &&
            stateRef.current === "running"
          ) {
            const savedTime =
              saveCurrentActiveTime();

            changeState("paused");

            void persistSession(
              "paused",
              savedTime,
            );
          }
        },
      );

    return () => {
      subscription.remove();
    };
  }, [activityId]);

  function handleStart() {
    if (
      state !== "idle" ||
      isRestoring
    ) {
      return;
    }

    const now = Date.now();

    completionHandledRef.current = false;

    accumulatedTimeRef.current = 0;

    activeStartTimeRef.current = now;

    sessionStartedAtRef.current = now;

    setElapsedTime(0);

    setErrorMessage(null);

    changeState("running");

    void persistSession(
      "running",
      0,
    );
  }

  function handlePause() {
    if (state === "running") {
      const savedTime =
        saveCurrentActiveTime();

      changeState("paused");

      void persistSession(
        "paused",
        savedTime,
      );
    }
  }

  function handleResume() {
    if (state === "paused") {
      activeStartTimeRef.current =
        Date.now();

      setErrorMessage(null);

      changeState("running");

      void persistSession(
        "running",
        accumulatedTimeRef.current,
      );
    }
  }

  function handleRestart() {
    if (
      state === "running" ||
      state === "paused" ||
      state === "completed"
    ) {
      const now = Date.now();

      completionHandledRef.current =
        false;

      accumulatedTimeRef.current = 0;

      activeStartTimeRef.current = now;

      sessionStartedAtRef.current = now;

      setElapsedTime(0);

      setErrorMessage(null);

      changeState("running");

      void persistSession(
        "running",
        0,
      );
    }
  }

  async function exitSession() {
    completionHandledRef.current = false;

    changeState("exited");

    await clearSavedSession();

    accumulatedTimeRef.current = 0;

    activeStartTimeRef.current = null;

    sessionStartedAtRef.current = null;

    setElapsedTime(0);

    setErrorMessage(null);

    router.replace("/");

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

    if (
      state === "idle" ||
      state === "completed"
    ) {
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
          onPress: () => {
            void exitSession();
          },
        },
      ],
    );
  }

  const remainingTime = Math.max(
    0,
    SESSION_DURATION_MS - elapsedTime,
  );

  const totalSeconds = Math.ceil(
    remainingTime / 1000,
  );

  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds = totalSeconds % 60;

  const formattedTime =
    `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;

  if (isRestoring) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor },
        ]}
      >
        <Text
          style={[
            styles.title,
            { color: textColor },
          ]}
        >
          Breathing Player
        </Text>

        <View style={styles.savingRow}>
          <ActivityIndicator
            color="#41644a"
          />

          <Text
            style={{ color: textColor }}
          >
            Restoring breathing session...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: textColor },
        ]}
      >
        Breathing Player
      </Text>

      <Text
        style={[
          styles.state,
          { color: textColor },
        ]}
      >
        Current State: {state}
      </Text>

      <Text
        style={[
          styles.timer,
          { color: textColor },
        ]}
      >
        {formattedTime}
      </Text>

      {isCompleting && (
        <View style={styles.savingRow}>
          <ActivityIndicator
            color="#41644a"
          />

          <Text
            style={{ color: textColor }}
          >
            Saving breathing progress...
          </Text>
        </View>
      )}

      {errorMessage && (
        <Text style={styles.errorText}>
          {errorMessage}
        </Text>
      )}

      <Pressable
        style={styles.button}
        onPress={handleStart}
        disabled={isCompleting}
      >
        <Text style={styles.buttonText}>
          Start
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={handlePause}
        disabled={isCompleting}
      >
        <Text style={styles.buttonText}>
          Pause
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={handleResume}
        disabled={isCompleting}
      >
        <Text style={styles.buttonText}>
          Resume
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={handleRestart}
        disabled={isCompleting}
      >
        <Text style={styles.buttonText}>
          Restart
        </Text>
      </Pressable>

      <Pressable
        style={styles.exitButton}
        onPress={handleExit}
        disabled={isCompleting}
      >
        <Text style={styles.buttonText}>
          Exit
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
  },

  state: {
    fontSize: 18,
  },

  timer: {
    fontSize: 48,
    fontWeight: "700",
  },

  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  errorText: {
    color: "#b42318",
    fontSize: 14,
    maxWidth: 400,
  },

  button: {
    backgroundColor: "#41644a",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    maxWidth: 200,
  },

  exitButton: {
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