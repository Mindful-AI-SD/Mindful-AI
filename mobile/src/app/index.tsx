import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";
import { useSignedInUserId } from "@/components/auth-gate";
import { IntentionMirrorScreen } from "@/components/intention-mirror-screen";
import { AiGapReflectionScreen } from "@/components/ai-gap-reflection-screen";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  type CurriculumWeek,
  getPublishedWeekOne,
} from "../../lib/curriculum";
import {
  type ActivityProgress,
  completeProgressActivity,
  getActivityProgress,
  saveProgressStep,
} from "../../lib/progress";

type ActiveScreen = "curriculum" | "intention" | "gap";

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

  async function openActivity(activityId: string) {
    if (openingActivityId) return;
    setOpeningActivityId(activityId);

    try {
      const progress = progressByActivityId[activityId];
      const currentStep = progress?.current_step ?? "breathing";
      setActiveActivityId(activityId);

      if (!progress) {
        await saveProgressStep(userId, activityId, "breathing");
        router.replace({ pathname: "/breathing-player", params: { activityId } });
        return;
      }

      if (progress.status === "completed") {
        setActiveScreen("gap");
        return;
      }

      if (currentStep === "breathing") {
        router.replace({ pathname: "/breathing-player", params: { activityId } });
        return;
      }

      if (
        currentStep === "ai_gap_reflection" ||
        currentStep === "yellowdig_draft"
      ) {
        setActiveScreen("gap");
        return;
      }

      if (currentStep === "post_breathing_check_in") {
        await saveProgressStep(userId, activityId, "writing");
      }
      setActiveScreen("intention");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not open this activity.",
      );
    } finally {
      setOpeningActivityId(null);
    }
  }

  if (activeScreen === "gap" && activeActivity) {
    return (
      <AiGapReflectionScreen
        key={activeActivity.id}
        activityId={activeActivity.id}
        onBack={returnToCurriculum}
        onOpenIntention={() => setActiveScreen("intention")}
        onComplete={async () => {
          await completeProgressActivity(userId, activeActivity.id);
          returnToCurriculum();
        }}
      />
    );
  }

  if (activeScreen === "intention" && activeActivity) {
    return (
      <IntentionMirrorScreen
        key={activeActivity.id}
        activityId={activeActivity.id}
        onBack={returnToCurriculum}
        onIntentionsReady={() =>
          saveProgressStep(userId, activeActivity.id, "intention_mirror")
        }
        onOpenGap={() => {
          void saveProgressStep(userId, activeActivity.id, "ai_gap_reflection")
            .then(() => setActiveScreen("gap"))
            .catch((error) => {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Could not save your current step.",
              );
              returnToCurriculum();
            });
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>MINDFUL AI</ThemedText>
            <ThemedText type="title">Your curriculum</ThemedText>
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
              <ThemedText>{errorMessage}</ThemedText>

              <Pressable
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
                      onPress={() => void openActivity(activity.id)}
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
