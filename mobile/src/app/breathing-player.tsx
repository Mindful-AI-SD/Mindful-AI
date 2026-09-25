import { router } from "expo-router";
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

type BreathingState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "exited";

const SESSION_DURATION_MS = 10 * 60 * 1000;

export default function BreathingPlayer() {
  const [state, setState] = useState<BreathingState>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);

  const accumulatedTimeRef = useRef(0);
  const activeStartTimeRef = useRef<number | null>(null);
  const stateRef = useRef<BreathingState>("idle");

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const backgroundColor = isDarkMode ? "#121212" : "#ffffff";

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
        return;
      }

      setElapsedTime(totalElapsed);
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
      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();

      setElapsedTime(0);
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
      accumulatedTimeRef.current = 0;
      activeStartTimeRef.current = Date.now();

      setElapsedTime(0);
      changeState("running");
    }
  }

  function exitSession() {
    changeState("exited");

    accumulatedTimeRef.current = 0;
    activeStartTimeRef.current = null;
    setElapsedTime(0);

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

    if (state === "idle" || state === "completed") {
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

  const totalSeconds = Math.ceil(remainingTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const formattedTime =
    `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: textColor }]}>
        Breathing Player
      </Text>

      <Text style={[styles.state, { color: textColor }]}>
        Current State: {state}
      </Text>

      <Text style={[styles.timer, { color: textColor }]}>
        {formattedTime}
      </Text>

      <Pressable style={styles.button} onPress={handleStart}>
        <Text style={styles.buttonText}>Start</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handlePause}>
        <Text style={styles.buttonText}>Pause</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleResume}>
        <Text style={styles.buttonText}>Resume</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleRestart}>
        <Text style={styles.buttonText}>Restart</Text>
      </Pressable>

      <Pressable style={styles.exitButton} onPress={handleExit}>
        <Text style={styles.buttonText}>Exit</Text>
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