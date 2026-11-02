import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { getActivityWeek, type SequentialWeek } from "../../lib/week-access";
import { useSignedInUserId } from "./auth-gate";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { WeekAccessGate } from "./week-access-gate";

export function ActivityRouteGate(props: { activityId: string | undefined; children: ReactNode }) {
  const userId = useSignedInUserId();
  return <ActivityRouteSession key={`${userId}:${props.activityId}`} {...props} userId={userId} />;
}
function ActivityRouteSession({ activityId, children, userId }: { activityId: string | undefined; children: ReactNode; userId: string }) {
  const [week, setWeek] = useState<SequentialWeek | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setWeek(null); setError(false);
    if (!activityId) { setError(true); return; }
    void getActivityWeek(userId, activityId).then(value => { if (!cancelled) setWeek(value); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [userId, activityId, attempt]);
  const back = () => router.replace("/");
  if (!week) return <View style={styles.content}>
    <AccessibleStatus error={error}>{error ? "This activity link could not be verified. No saved progress has been changed." : "Checking activity and prerequisites…"}</AccessibleStatus>
    {error && <Pressable accessibilityRole="button" style={styles.action} onPress={() => setAttempt(value => value + 1)}><ThemedText>Retry activity access</ThemedText></Pressable>}
    <Pressable accessibilityRole="button" style={styles.action} onPress={back}><ThemedText>Back to curriculum</ThemedText></Pressable>
  </View>;
  return <WeekAccessGate key={`${userId}:${week}`} weekNumber={week} onBack={back}>
    {week === 1 ? children : <View style={styles.content}>
      <ThemedText>This activity belongs to Week {week}. Open its saved module instead of the Week 1 breathing route.</ThemedText>
      <Pressable accessibilityRole="button" style={styles.action}
        onPress={() => router.replace({ pathname: "/", params: { week: String(week), activityId } })}>
        <ThemedText>Open saved Week {week}</ThemedText>
      </Pressable>
    </View>}
  </WeekAccessGate>;
}
const styles = StyleSheet.create({ content: { padding: 24, paddingTop: 80, gap: 16 }, action: { minHeight: 48, padding: 12, justifyContent: "center" } });
