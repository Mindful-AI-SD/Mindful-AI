import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  canOpenPostBreathingCheckIn,
  getPostBreathingCheckIn,
  savePostBreathingCheckIn,
} from "../../lib/progress";
import { supabase } from "../../lib/supabase";

type UrgeAnswer = "yes" | "no" | "";

export default function PostBreathingCheckInScreen() {
  const params = useLocalSearchParams<{
    activityId?: string;
  }>();

  const activityId =
    typeof params.activityId === "string"
      ? params.activityId
      : "";

  const [userId, setUserId] = useState<string | null>(null);
  const [urge, setUrge] = useState<UrgeAnswer>("");
  const [note, setNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    async function loadCheckIn() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        if (!activityId) {
          router.replace("/");
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          router.replace("/");
          return;
        }

        const currentUserId = session.user.id;

        setUserId(currentUserId);

        const canOpen = await canOpenPostBreathingCheckIn(
          currentUserId,
          activityId,
        );

        if (!canOpen) {
          router.replace("/");
          return;
        }

        const savedCheckIn =
          await getPostBreathingCheckIn(
            currentUserId,
            activityId,
          );

        setUrge(savedCheckIn.urge);
        setNote(savedCheckIn.note);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load the check-in.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadCheckIn();
  }, [activityId]);

  async function handleContinue() {
    if (
      !userId ||
      !activityId ||
      (urge !== "yes" && urge !== "no")
    ) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await savePostBreathingCheckIn(
        userId,
        activityId,
        {
          urge,
          note,
        },
      );

      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save the check-in.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color="#41644a"
            />
            <ThemedText>
              Loading check-in...
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>
              WEEK 1
            </ThemedText>

            <ThemedText type="title">
              Post-Breathing Check-In
            </ThemedText>

            <ThemedText style={styles.description}>
              After the breathing activity, did you notice an
              urge to check your phone?
            </ThemedText>
          </View>

          <View style={styles.answerGroup}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: urge === "yes",
              }}
              onPress={() => setUrge("yes")}
              style={({ pressed }) => [
                styles.answerButton,
                urge === "yes" &&
                  styles.answerButtonSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  urge === "yes" &&
                    styles.radioOuterSelected,
                ]}
              >
                {urge === "yes" && (
                  <View style={styles.radioInner} />
                )}
              </View>

              <ThemedText style={styles.answerText}>
                Yes, I noticed an urge
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: urge === "no",
              }}
              onPress={() => setUrge("no")}
              style={({ pressed }) => [
                styles.answerButton,
                urge === "no" &&
                  styles.answerButtonSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  urge === "no" &&
                    styles.radioOuterSelected,
                ]}
              >
                {urge === "no" && (
                  <View style={styles.radioInner} />
                )}
              </View>

              <ThemedText style={styles.answerText}>
                No, I did not notice an urge
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.noteSection}>
            <ThemedText type="subtitle">
              Optional note
            </ThemedText>

            <ThemedText style={styles.description}>
              Add anything you noticed during or after the
              breathing activity.
            </ThemedText>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Write an optional note..."
              placeholderTextColor="#888888"
              multiline
              textAlignVertical="top"
              style={styles.noteInput}
            />
          </View>

          {errorMessage && (
            <ThemedText style={styles.errorText}>
              {errorMessage}
            </ThemedText>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={
              isSaving ||
              (urge !== "yes" && urge !== "no")
            }
            onPress={() => void handleContinue()}
            style={({ pressed }) => [
              styles.continueButton,
              (isSaving ||
                (urge !== "yes" && urge !== "no")) &&
                styles.continueButtonDisabled,
              pressed &&
                !isSaving &&
                styles.buttonPressed,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText
                style={styles.continueButtonText}
              >
                Continue
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },

  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 24,
    gap: 24,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },

  header: {
    gap: 12,
  },

  eyebrow: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
  },

  answerGroup: {
    gap: 12,
  },

  answerButton: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d4ddd3",
    borderRadius: 14,
  },

  answerButtonSelected: {
    borderColor: "#41644a",
  },

  radioOuter: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#8a8a8a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: "#41644a",
  },

  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#41644a",
  },

  answerText: {
    flex: 1,
    fontSize: 16,
  },

  noteSection: {
    gap: 12,
  },

  noteInput: {
    minHeight: 120,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d4ddd3",
    borderRadius: 14,
    fontSize: 16,
    color: "#000000",
    backgroundColor: "#ffffff",
  },

  errorText: {
    color: "#b42318",
    fontSize: 14,
  },

  continueButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#41644a",
  },

  continueButtonDisabled: {
    opacity: 0.45,
  },

  continueButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },

  buttonPressed: {
    opacity: 0.8,
  },
});