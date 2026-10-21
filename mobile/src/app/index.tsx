import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WeekOneFlow } from "@/components/week-one-flow";
import { WeekTwoFlow } from "@/components/week-two-flow";
import { useSignedInUserId } from "@/components/auth-gate";
import { AccessibleHeading } from "@/components/accessibility";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  type CurriculumWeek,
  getPublishedWeek,
} from "../../lib/curriculum";
import {
  type ActivityProgress,
  getActivityProgress,
} from "../../lib/progress";

type ActiveScreen = "curriculum" | "week-one";

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const userId = useSignedInUserId();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("curriculum");
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const [week, setWeek] = useState<CurriculumWeek | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<1 | 2>(1);
  const loadVersion = useRef(0);
  const [progressByActivityId, setProgressByActivityId] = useState<
    Record<string, ActivityProgress>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingActivityId, setOpeningActivityId] = useState<string | null>(null);

  const loadWeek = useCallback(async () => {
    const current = ++loadVersion.current;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const weekOne = await getPublishedWeek(selectedWeek);
      const progress = await getActivityProgress(
        userId,
        weekOne.activities.map((activity) => activity.id),
      );
      if (loadVersion.current !== current) return;
      setWeek(weekOne);
      setProgressByActivityId(
        Object.fromEntries(progress.map((item) => [item.activity_id, item])),
      );
    } catch (error) {
      if (loadVersion.current !== current) return;
      setWeek(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Could not load Week ${selectedWeek}. Please retry.`,
      );
    } finally {
      if (loadVersion.current === current) setIsLoading(false);
    }
  }, [userId, selectedWeek]);

  useFocusEffect(
    useCallback(() => {
      if (activeScreen === "curriculum") void loadWeek();
      return () => { loadVersion.current++; };
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

  if (activeScreen === "week-one" && activeActivity) {
    if (week?.week_number === 2) {
      return <WeekTwoFlow key={activeActivity.id} activityId={activeActivity.id} onExit={returnToCurriculum} practiceConfig={week.practice} />;
    }
    return (
      <WeekOneFlow
        key={activeActivity.id}
        activityId={activeActivity.id}
        onExit={returnToCurriculum}
        showModuleEntry
        practiceConfig={week?.practice}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>MINDFUL AI</ThemedText>
            <View style={styles.headerRow}><ThemedText style={styles.heroHeading} accessibilityRole="header">A moment for yourself.</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push("/settings" as never)} style={styles.settingsButton}><ThemedText style={styles.settingsIcon}>⚙</ThemedText></Pressable></View>
            <ThemedText style={styles.headerSubtitle}>Take your time. Your practice is here when you need it.</ThemedText>
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="Curriculum week" style={styles.weekSelector}>
            {([1, 2] as const).map(number => (
              <Pressable key={number} accessibilityRole="radio" accessibilityLabel={`Week ${number}`}
                accessibilityState={{ checked: selectedWeek === number }} aria-checked={selectedWeek === number}
                style={[styles.weekChoice, selectedWeek === number && styles.weekChoiceActive]} onPress={() => {
                  if (selectedWeek === number) return;
                  loadVersion.current++;
                  setWeek(null);
                  setProgressByActivityId({});
                  setIsLoading(true);
                  setErrorMessage(null);
                  setSelectedWeek(number);
                }}>
                <ThemedText style={[styles.weekChoiceText, selectedWeek === number && styles.weekChoiceTextActive]}>{`Week ${number}`}</ThemedText>
              </Pressable>
            ))}
          </View>

          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator color="#41644a" size="large" />
              <ThemedText>{`Loading Week ${selectedWeek}...`}</ThemedText>
            </View>
          )}

          {!isLoading && errorMessage && (
            <ThemedView style={styles.messageCard}>
              <ThemedText type="subtitle">{`Unable to load Week ${selectedWeek}`}</ThemedText>
              <ThemedText accessibilityRole="alert">{errorMessage}</ThemedText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry loading Week ${selectedWeek}`}
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

                <ThemedText style={styles.weekTitle}>{week.title}</ThemedText>

                <ThemedText style={styles.theme}>{week.theme}</ThemedText>

                {week.description && (
                  <ThemedText style={styles.description}>
                    {week.description}
                  </ThemedText>
                )}
              </ThemedView>

              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Your activities</ThemedText>

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

                      <ThemedText style={styles.activityTitle}>{activity.title}</ThemedText>

                      <View style={styles.activityFooter}><ThemedText style={styles.status}>{isOpening ? "Opening…" : STATUS_LABELS[status]}</ThemedText><View style={styles.continuePill}><ThemedText style={styles.continueText}>{status === "completed" ? "Review  →" : status === "in_progress" ? "Continue  →" : "Start  →"}</ThemedText></View></View>

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

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F6F2" }, safeArea: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", gap: 22, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 90 },
  header: { gap: 8 }, eyebrow: { color: "#747B9A", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heroHeading: { color: "#252731", fontSize: 29, lineHeight: 35, fontWeight: "700", flex: 1 },
  settingsButton: { width: 44, height: 44, backgroundColor: "#EAE9E5", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  settingsIcon: { fontSize: 23, color: "#333640" },
  headerSubtitle: { fontSize: 15, lineHeight: 22, color: "#686B76" },
  weekSelector: { flexDirection: "row", gap: 4, padding: 4, backgroundColor: "#EAE9E5", borderRadius: 26, alignSelf: "flex-start" },
  weekChoice: { minHeight: 44, minWidth: 112, paddingHorizontal: 20, justifyContent: "center", alignItems: "center", borderRadius: 23 },
  weekChoiceActive: { backgroundColor: "#242630" }, weekChoiceText: { color: "#4B4E57", fontWeight: "600", fontSize: 15 }, weekChoiceTextActive: { color: "#FFFFFF" },
  centered: { alignItems: "center", gap: 16, paddingVertical: 48 },
  messageCard: { gap: 16, padding: 20, borderWidth: 1, borderColor: "#D5A3A3", borderRadius: 20 },
  weekCard: { gap: 10, padding: 24, backgroundColor: "#C4C7E0", borderRadius: 28 },
  weekNumber: { color: "#41455D", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  weekTitle: { color: "#262936", fontSize: 29, lineHeight: 35, fontWeight: "700" },
  theme: { color: "#454A65", fontSize: 15, lineHeight: 22, fontWeight: "600" },
  description: { color: "#5A5F6B", fontSize: 14, lineHeight: 21 },
  section: { gap: 12 }, sectionTitle: { fontSize: 22, fontWeight: "700", color: "#252731", marginBottom: 2 },
  activityCard: { gap: 12, padding: 22, borderRadius: 24, backgroundColor: "#FFFFFF" },
  activityMetadata: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  activityType: { color: "#657B6D", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  duration: { color: "#777B85", fontSize: 12 },
  activityTitle: { color: "#252731", fontSize: 20, lineHeight: 26, fontWeight: "700" },
  activityFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  status: { color: "#536E60", fontSize: 13, fontWeight: "600" },
  continuePill: { backgroundColor: "#B9D6C3", paddingHorizontal: 17, paddingVertical: 11, borderRadius: 22 },
  continueText: { color: "#273D31", fontSize: 13, fontWeight: "700" },
  retryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#41644A" },
  retryButtonText: { color: "#FFFFFF", fontWeight: "700" }, buttonPressed: { opacity: 0.8 },
});
