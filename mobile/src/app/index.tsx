import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WeekOneFlow } from "@/components/week-one-flow";
import { WeekTwoFlow } from "@/components/week-two-flow";
import { GuidingQuestionsCapture } from "@/components/guiding-questions-capture";
import { WeekAccessGate } from "@/components/week-access-gate";
import { WeekThreeExploreNotice } from "@/components/week-three-explore-notice";
import { getWeekAccess, type SequentialWeek, type WeekAccessResult } from "../../lib/week-access";
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

type ActiveScreen = "curriculum" | "week-one" | "guiding-questions";

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ week?: string; activityId?: string }>();
  const userId = useSignedInUserId();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("curriculum");
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const [week, setWeek] = useState<CurriculumWeek | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<SequentialWeek>(params.week === "2" ? 2 : params.week === "3" ? 3 : 1);
  const [weekAccess, setWeekAccess] = useState<Partial<Record<SequentialWeek, WeekAccessResult>>>({});
  const opening = useRef(false);
  const loadVersion = useRef(0);
  const [progressByActivityId, setProgressByActivityId] = useState<
    Record<string, ActivityProgress>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openingActivityId, setOpeningActivityId] = useState<string | null>(null);
  const activeScreenRef = useRef(activeScreen);
  activeScreenRef.current = activeScreen;
  const loadedLink = useRef<string | null>(null);
  const linkSignature = JSON.stringify([selectedWeek, params.week, params.activityId]);

  useEffect(() => {
    if (params.week && ["1", "2", "3"].includes(params.week)) setSelectedWeek(Number(params.week) as SequentialWeek);
    setActiveScreen("curriculum"); setActiveActivityId(null);
  }, [params.week, params.activityId]);

  const loadWeek = useCallback(async () => {
    loadedLink.current = linkSignature;
    const current = ++loadVersion.current;
    setIsLoading(true);
    setErrorMessage(null);
    setWeek(null); setWeekAccess({}); setProgressByActivityId({});

    try {
      if ((params.week !== undefined && !["1", "2", "3"].includes(params.week)) ||
        (params.activityId !== undefined && (typeof params.activityId !== "string" || !params.week))) throw new Error("This week link is invalid. Open a week from the curriculum.");
      const results = await Promise.all(([1, 2, 3] as const).map(async number => {
        try { return await getWeekAccess(userId, number); }
        catch { return { weekNumber: number, allowed: false, requiredWeek: null, message: `Could not verify Week ${number} access. Retry loading saved completion.` } satisfies WeekAccessResult; }
      }));
      if (loadVersion.current !== current) return;
      const access = Object.fromEntries(results.map(result => [result.weekNumber, result]));
      setWeekAccess(access);
      if (!access[selectedWeek]?.allowed) return;
      const weekOne = await getPublishedWeek(selectedWeek);
      const progress = selectedWeek === 3 ? [] : await getActivityProgress(
        userId,
        weekOne.activities.map((activity) => activity.id),
      );
      if (loadVersion.current !== current) return;
      setWeek(weekOne);
      setProgressByActivityId(
        Object.fromEntries(progress.map((item) => [item.activity_id, item])),
      );
      if (params.activityId) {
        if (!weekOne.activities.some(activity => activity.id === params.activityId)) throw new Error("This activity does not belong to the selected published week.");
        setActiveActivityId(params.activityId); setActiveScreen("week-one");
      }
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
  }, [userId, selectedWeek, params.week, params.activityId, linkSignature]);

  useFocusEffect(
    useCallback(() => {
      // The child gate rechecks an open activity on focus without throwing away
      // its unsaved fields. A changed resume URL still loads its own target.
      if (activeScreenRef.current === "curriculum" || loadedLink.current !== linkSignature) void loadWeek();
      return () => { loadVersion.current++; };
    }, [loadWeek, linkSignature]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (activeScreen !== "curriculum") return;
      if (state === "active") void loadWeek();
      else { loadVersion.current++; setIsLoading(true); setWeekAccess({}); }
    });
    return () => subscription.remove();
  }, [activeScreen, loadWeek]);

  const activeActivity = week?.activities.find(
    (activity) => activity.id === activeActivityId,
  );

  function returnToCurriculum() {
    setActiveScreen("curriculum");
    setActiveActivityId(null);
    if (params.activityId) router.setParams({ activityId: undefined });
    else void loadWeek();
  }

  async function openActivity(activityId: string) {
    if (opening.current || isLoading) return;
    opening.current = true;
    setOpeningActivityId(activityId);
    const request = loadVersion.current;
    try {
      const access = await getWeekAccess(userId, selectedWeek);
      if (loadVersion.current !== request) return;
      setWeekAccess(current => ({ ...current, [selectedWeek]: access }));
      if (!access.allowed) { setWeek(null); return; }
      // Resume links are checked again after URL restoration, not trusted as grants.
      router.setParams({ week: String(selectedWeek), activityId });
    } catch { if (loadVersion.current === request) { setWeek(null); setErrorMessage("Could not verify saved completion. Retry before opening this activity."); } }
    finally { opening.current = false; setOpeningActivityId(null); }
  }

  if (activeScreen === "guiding-questions") {
    return <GuidingQuestionsCapture userId={userId} onBack={returnToCurriculum} />;
  }

  if (activeScreen === "week-one" && activeActivity) {
    if (week?.week_number === 3) {
      return <WeekAccessGate key={`${userId}:3`} weekNumber={3} onBack={returnToCurriculum}>
        <WeekThreeExploreNotice userId={userId} activityId={activeActivity.id} onExit={returnToCurriculum} showModuleEntry />
      </WeekAccessGate>;
    }
    if (week?.week_number === 2) {
      return <WeekAccessGate key={`${userId}:2:${activeActivity.id}`} weekNumber={2} onBack={returnToCurriculum}><WeekTwoFlow activityId={activeActivity.id} onExit={returnToCurriculum} practiceConfig={week.practice} /></WeekAccessGate>;
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
            {([1, 2, 3] as const).map(number => (
              <Pressable key={number} accessibilityRole="radio" accessibilityLabel={`Week ${number}`}
                accessibilityState={{ checked: selectedWeek === number }} aria-checked={selectedWeek === number}
                accessibilityHint={isLoading ? "Checking saved prerequisites." : weekAccess[number]?.message}
                style={[styles.weekChoice, selectedWeek === number && styles.weekChoiceActive]} onPress={() => {
                  if (selectedWeek === number) return;
                  loadVersion.current++;
                  setWeek(null);
                  setProgressByActivityId({});
                  setIsLoading(true);
                  setErrorMessage(null);
                  setSelectedWeek(number);
                  router.setParams({ week: String(number), activityId: undefined });
                }}>
                <ThemedText style={[styles.weekChoiceText, selectedWeek === number && styles.weekChoiceTextActive]}>{`Week ${number}`}</ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={styles.section}>
            {([1, 2, 3] as const).map(number => <ThemedText key={number}>{isLoading ? `Week ${number}: Checking prerequisites…` : `Week ${number}: ${weekAccess[number]?.allowed ? "Available" : "Locked"}. ${weekAccess[number]?.message ?? "Access has not been verified."}`}</ThemedText>)}
          </View>
          {!isLoading && !errorMessage && !weekAccess[selectedWeek]?.allowed && <ThemedView style={styles.messageCard}>
            <AccessibleHeading>{`Week ${selectedWeek} locked`}</AccessibleHeading>
            <ThemedText>{weekAccess[selectedWeek]?.message ?? "Could not verify saved completion."}</ThemedText>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => void loadWeek()}><ThemedText style={styles.retryButtonText}>Check prerequisites again</ThemedText></Pressable>
          </ThemedView>}

          {selectedWeek === 1 && <Pressable accessibilityRole="button"
            accessibilityLabel="Open saved Guiding Questions"
            accessibilityHint="Opens five answer fields with account-scoped saved fixture progress on this device."
            style={styles.retryButton} onPress={() => setActiveScreen("guiding-questions")}>
            <ThemedText style={styles.retryButtonText}>Guiding Questions · Saved fixture</ThemedText>
          </Pressable>}

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
              <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => router.replace("/")}>
                <ThemedText style={styles.retryButtonText}>Back to curriculum</ThemedText>
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
