import { router } from "expo-router";
import { useState } from "react";
import {
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

export default function BreathingPlayer() {
  const [state, setState] = useState<BreathingState>("idle");
  const colorScheme = useColorScheme();

  const isDarkMode = colorScheme === "dark";

  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const backgroundColor = isDarkMode ? "#121212" : "#ffffff";

  function handleStart() {
    if (state === "idle") {
      setState("running");
    }
  }

  function handlePause() {
    if (state === "running") {
      setState("paused");
    }
  }

  function handleResume() {
    if (state === "paused") {
      setState("running");
    }
  }

  function handleRestart() {
    if (state === "running" || state === "paused") {
      setState("running");
    }
  }

  function handleComplete() {
    if (state === "running") {
      setState("completed");
    }
  }

  function handleExit() {
    if (
      state === "idle" ||
      state === "running" ||
      state === "paused" ||
      state === "completed"
    ) {
      setState("exited");

      router.replace("/");

      setTimeout(() => {
        setState("idle");
      }, 0);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: textColor }]}>
        Breathing Player
      </Text>

      <Text style={[styles.state, { color: textColor }]}>
        Current State: {state}
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

      {state === "running" && (
        <Pressable style={styles.testButton} onPress={handleComplete}>
          <Text style={styles.buttonText}>Test Completion</Text>
        </Pressable>
      )}
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

  testButton: {
    backgroundColor: "#59645b",
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