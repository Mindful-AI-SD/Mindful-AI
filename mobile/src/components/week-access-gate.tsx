import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { getWeekAccess, type SequentialWeek, type WeekAccessResult } from "../../lib/week-access";
import { useSignedInUserId } from "./auth-gate";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";

export function WeekAccessGate({ weekNumber, onBack, children }: {
  weekNumber: SequentialWeek; onBack: () => void; children: ReactNode;
}) {
  const userId = useSignedInUserId();
  const [access, setAccess] = useState<WeekAccessResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const version = useRef(0);
  const check = useCallback(async () => {
    const request = ++version.current;
    setChecking(true); setError(false);
    try {
      const result = await getWeekAccess(userId, weekNumber);
      if (request === version.current) setAccess(result);
    } catch { if (request === version.current) { setAccess(null); setError(true); } }
    finally { if (request === version.current) setChecking(false); }
  }, [userId, weekNumber]);
  useFocusEffect(useCallback(() => {
    void check();
    return () => { version.current++; setChecking(true); };
  }, [check]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void check();
      else { version.current++; setChecking(true); }
    });
    return () => subscription.remove();
  }, [check]);
  const visible = !checking && !error && access?.allowed;
  return <View style={styles.flex}>
    {!visible && <View style={styles.message}>
      <AccessibleStatus error={error}>{checking ? `Checking Week ${weekNumber} prerequisites…` : error ? "Could not verify saved completion. This week stays locked until access can be checked." : access?.message ?? "Week access is unavailable."}</AccessibleStatus>
      {!checking && <Pressable accessibilityRole="button" style={styles.action} onPress={() => void check()}><ThemedText>Check week access again</ThemedText></Pressable>}
      <Pressable accessibilityRole="button" style={styles.action} onPress={onBack}><ThemedText>Back to curriculum</ThemedText></Pressable>
    </View>}
    {/* Keep an already-open draft mounted but inaccessible while rechecking. */}
    {access?.allowed && <View style={[styles.flex, !visible && styles.hidden]} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? "auto" : "no-hide-descendants"}>{children}</View>}
  </View>;
}
const styles = StyleSheet.create({ flex: { flex: 1 }, hidden: { display: "none" }, message: { padding: 24, paddingTop: 80, gap: 16 }, action: { minHeight: 48, padding: 12, justifyContent: "center" } });
