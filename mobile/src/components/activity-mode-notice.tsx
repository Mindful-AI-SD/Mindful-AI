import { Pressable, StyleSheet, View } from "react-native";
import type { ActivityModeState } from "@/hooks/use-activity-mode";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";

// What a student sees about the activity's mode before they begin. Student
// writing stays editable and saved whatever this shows.
export function ActivityModeNotice({ mode }: { mode: ActivityModeState }) {
  if (mode.status === "loading") {
    return <AccessibleStatus>Checking this activity…</AccessibleStatus>;
  }
  if (mode.status === "error" || mode.status === "unavailable") {
    return (
      <View style={styles.section}>
        <AccessibleStatus error>{mode.message}</AccessibleStatus>
        <ThemedText>Your writing is still saved.</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Checks again whether this activity is available."
          style={styles.action}
          onPress={mode.retry}
        >
          <ThemedText>Try again</ThemedText>
        </Pressable>
      </View>
    );
  }
  const labels = mode.mode.labels;
  if (!labels) return null;
  return (
    <View style={styles.section} accessibilityLabel={labels.disclosure} accessible>
      <ThemedText type="smallBold">{labels.modeTitle}</ThemedText>
      <ThemedText>{labels.modeDescription}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center" },
});
