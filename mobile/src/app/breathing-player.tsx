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
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCompleting, setIsCompleting] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  const accumulatedTimeRef = useRef(0);
  const activeStartTimeRef = useRef<number | null>(
    null,
  );
  const stateRef = useRef<BreathingState>("idle");

  // Prevents the completion logic from running more than once.
  const completionHandledRef = useRef(false);

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

  function saveCurrentActiveTime() {
    if (activeStartTimeRef.current === null) {
      return;
    }

    const currentActiveTime =
      Date.now() - activeStartTimeRef.current;

    accumulatedTimeRef.current += currentActiveTime;
    activeStartTimeRef.current = null;

    setElapsedTime(accumulatedTimeRef.current);
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

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        throw new Error(
          "Please sign in again before continuing.",
        );
      }

      await completeBreathingStep(
        session.user.id,
        activityId,
      );

      router.replace({
        pathname: "/post-breathing-check-in",
        params: {
          activityId,
        },
      });
    } catch (error) {
      completionHandledRef.current = false;

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
        accumulatedTimeRef.current +
        currentActiveTime;

      if (totalElapsed >= SESSION_DURATION_MS) {
        accumulatedTimeRef.current =
          SESSION_DURATION_MS;

        activeStartTimeRef.current = null;

        setElapsedTime(SESSION_DURATION_MS);
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

    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    if (state === "completed") {
      void finishBreathingSession();
    }
  }, [state]);

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
            saveCurrentActiveTime();
            changeState("paused");
          }
        },
      );

    return () => {
      subscription.remove();
    };
  }, []);

  function handleStart() {
    if (state === "idle") {
      completionHandledRef.current = false;

      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();

      setElapsedTime(0);
      setErrorMessage(null);
      changeState("running");
    }
  }

  function handlePause() {
    if (state === "running") {
      saveCurrentActiveTime();
      changeState("paused");
    }
  }

  function handleResume() {
    if (state === "paused") {
      activeStartTimeRef.current = Date.now();
      changeState("running");
    }
  }

  function handleRestart() {
    if (
      state === "running" ||
      state === "paused" ||
      state === "completed"
    ) {
      completionHandledRef.current = false;

      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();

      setElapsedTime(0);
      setErrorMessage(null);
      changeState("running");
    }
  }

  function exitSession() {
    completionHandledRef.current = false;

    changeState("exited");

    accumulatedTimeRef.current = 0;
    activeStartTimeRef.current = null;

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
      exitSession();
      return;
    }

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Exit breathing session? Your current progress will be discarded.",
      );

      if (confirmed) {
        exitSession();
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
          onPress: exitSession,
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

          <Text style={{ color: textColor }}>
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