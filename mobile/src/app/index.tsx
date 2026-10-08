import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";
import { WeekOneFlow } from "@/components/week-one-flow";
import { useSignedInUserId } from "@/components/auth-gate";
import { AccessibleHeading } from "@/components/accessibility";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  type CurriculumWeek,
  getPublishedWeekOne,
} from "../../lib/curriculum";
import {
  type ActivityProgress,
  getActivityProgress,
} from "../../lib/progress";
import { resetSignedInWeekOneProgressForDevelopment } from "../../lib/dev-progress-reset";

type ActiveScreen = "curriculum" | "week-one";

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
} as const;

export default function HomeScreen() {
  const userId = useSignedInUserId();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("curriculum");
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const [week, setWeek] = useState<CurriculumWeek | null>(null);
  const [progressByActivityId, setProgressByActivityId] = useState<
    Record<string, ActivityProgress>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingActivityId, setOpeningActivityId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const loadWeek = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const weekOne = await getPublishedWeekOne();
      const progress = await getActivityProgress(
        userId,
        weekOne.activities.map((activity) => activity.id),
      );
      setWeek(weekOne);
      setProgressByActivityId(
        Object.fromEntries(progress.map((item) => [item.activity_id, item])),
      );
    } catch (error) {
      setWeek(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while loading Week 1.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (activeScreen === "curriculum") void loadWeek();
    }, [activeScreen, loadWeek]),
  );

  const activeActivity = week?.activities.find(
    (activity) => activity.id === activeActivityId,
  );

  function returnToCurriculum() {
    setActiveScreen("curriculum");
    setActiveActivityId(null);
  }

  function openActivity(activityId: string) {
    if (openingActivityId) return;
    setOpeningActivityId(activityId);
    setActiveActivityId(activityId);
    setActiveScreen("week-one");
    setOpeningActivityId(null);
  }

  async function resetDevelopmentProgress() {
    if (!week || isResetting) return;
    setIsResetting(true);
    setResetMessage(null);
    try {
      const deleted = await resetSignedInWeekOneProgressForDevelopment(
        week.activities.map((activity) => activity.id),
      );
      setProgressByActivityId({});
      setResetMessage(
        deleted === 0
          ? "This account was already at Not started."
          : "Your Week 1 progress was reset to Not started.",
      );
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : "Could not reset Week 1 progress.",
      );
    } finally {
      setIsResetting(false);
    }
  }

  function confirmDevelopmentReset() {
    Alert.alert(
      "Reset your Week 1 progress?",
      "Development only: this permanently deletes this signed-in account's Week 1 progress. Other users and curriculum content are unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset my progress",
          style: "destructive",
          onPress: () => void resetDevelopmentProgress(),
        },
      ],
    );
  }

  if (activeScreen === "week-one" && activeActivity) {
    return (
      <WeekOneFlow
        key={activeActivity.id}
        activityId={activeActivity.id}
        onExit={returnToCurriculum}
        showModuleEntry
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>MINDFUL AI</ThemedText>
            <AccessibleHeading focusKey={activeScreen}>Your curriculum</AccessibleHeading>
          </View>

          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator color="#41644a" size="large" />
              <ThemedText>Loading Week 1...</ThemedText>
            </View>
          )}

          {!isLoading && errorMessage && (
            <ThemedView style={styles.messageCard}>
              <ThemedText type="subtitle">Unable to load Week 1</ThemedText>
              <ThemedText accessibilityRole="alert">{errorMessage}</ThemedText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading Week 1"
                accessibilityHint="Loads the curriculum and activities again."
                onPress={() => void loadWeek()}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <ThemedText style={styles.retryButtonText}>
                  Try again
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {!isLoading && week && (
            <>
              <ThemedView style={styles.weekCard}>
                <ThemedText style={styles.weekNumber}>
                  WEEK {week.week_number}
                </ThemedText>

                <ThemedText type="title">{week.title}</ThemedText>

                <ThemedText style={styles.theme}>{week.theme}</ThemedText>

                {week.description && (
                  <ThemedText style={styles.description}>
                    {week.description}
                  </ThemedText>
                )}
              </ThemedView>

              <View style={styles.section}>
                <ThemedText type="subtitle">Activities</ThemedText>

                {week.activities.length === 0 ? (
                  <ThemedText>
                    No published activities are available yet.
                  </ThemedText>
                ) : (
                  week.activities.map((activity) => {
                    const progress = progressByActivityId[activity.id];
                    const status = progress?.status ?? "not_started";
                    const isOpening = openingActivityId === activity.id;

                    return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${activity.title}. ${STATUS_LABELS[status]}`}
                      disabled={openingActivityId !== null}
                      key={activity.id}
                      onPress={() => openActivity(activity.id)}
                      style={({ pressed }) => [
                        styles.activityCard,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <View style={styles.activityMetadata}>
                        <ThemedText style={styles.activityType}>
                          {activity.activity_type
                            .replace("_", " ")
                            .toUpperCase()}
                        </ThemedText>

                        {activity.duration_minutes !== null && (
                          <ThemedText style={styles.duration}>
                            {activity.duration_minutes} min
                          </ThemedText>
                        )}
                      </View>

                      <ThemedText type="subtitle">
                        {activity.title}
                      </ThemedText>

                      <ThemedText style={styles.status}>
                        {isOpening ? "Opening…" : STATUS_LABELS[status]}
                      </ThemedText>

                      {activity.content && (
                        <ThemedText style={styles.description}>
                          {activity.content}
                        </ThemedText>
                      )}
                    </Pressable>
                  );})
                )}
              </View>
            </>
          )}

          {__DEV__ && week && (
            <ThemedView style={styles.developmentCard}>
              <ThemedText type="subtitle">Development tools</ThemedText>
              <ThemedText>
                Reset only this signed-in account&apos;s Week 1 progress for testing.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Development only: reset my Week 1 progress"
                accessibilityHint="Deletes this signed-in test account's Week 1 progress after confirmation."
                disabled={isResetting}
                onPress={confirmDevelopmentReset}
                style={({ pressed }) => [
                  styles.resetButton,
                  pressed && styles.buttonPressed,
                  isResetting && styles.buttonDisabled,
                ]}
              >
                <ThemedText style={styles.resetButtonText}>
                  {isResetting ? "Resetting…" : "Reset my Week 1 progress"}
                </ThemedText>
              </Pressable>
              {resetMessage && (
                <ThemedText accessibilityLiveRegion="polite">{resetMessage}</ThemedText>
              )}
            </ThemedView>
          )}

          <SignOutButton />
        </ScrollView>
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
    gap: 24,
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  centered: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 48,
  },
  messageCard: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#d5a3a3",
    borderRadius: 16,
  },
  weekCard: {
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#b9cbbd",
    borderRadius: 20,
  },
  weekNumber: {
    color: "#41644a",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  theme: {
    color: "#41644a",
    fontSize: 17,
    fontWeight: "600",
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    gap: 16,
  },
  activityCard: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#d4ddd3",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  activityMetadata: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  activityType: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  duration: {
    fontSize: 14,
    opacity: 0.7,
  },
  status: {
    color: "#41644a",
    fontSize: 15,
    fontWeight: "700",
  },
  developmentCard: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#b7791f",
    borderRadius: 16,
  },
  resetButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#8f3f3f",
  },
  resetButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  retryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#41644a",
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
