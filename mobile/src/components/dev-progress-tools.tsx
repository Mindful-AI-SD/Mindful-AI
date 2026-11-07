import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import {
  completeSignedInProgressThroughWeekForDevelopment,
  type DebugWeekNumber,
  resetSignedInProgressFromWeekForDevelopment,
} from "../../lib/dev-progress-reset";

type PendingAction = `reset-${DebugWeekNumber}` | `complete-${DebugWeekNumber}`;

export function DevProgressTools() {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!__DEV__) return null;

  function runReset(week: DebugWeekNumber) {
    Alert.alert(
      `Reset from Week ${week}?`,
      `This deletes saved progress for Week ${week} and every later published week on this account. Earlier weeks stay unchanged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset progress",
          style: "destructive",
          onPress: () => void perform(`reset-${week}`, async () => {
            const count = await resetSignedInProgressFromWeekForDevelopment(week);
            return `Reset ${count} saved activit${count === 1 ? "y" : "ies"} from Week ${week}.`;
          }),
        },
      ],
    );
  }

  function runComplete(week: DebugWeekNumber) {
    Alert.alert(
      `Complete through Week ${week}?`,
      `This marks every published activity in Weeks 1–${week} complete on this account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete progress",
          onPress: () => void perform(`complete-${week}`, async () => {
            const count = await completeSignedInProgressThroughWeekForDevelopment(week);
            return `Marked ${count} activit${count === 1 ? "y" : "ies"} complete through Week ${week}.`;
          }),
        },
      ],
    );
  }

  async function perform(action: PendingAction, operation: () => Promise<string>) {
    setPendingAction(action);
    setMessage(null);
    try {
      setMessage(await operation());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change development progress.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle">Progress debug tools</ThemedText>
      <ThemedText>
        Development builds only. Resetting a week also resets every later week so prerequisite state stays consistent.
      </ThemedText>

      {([1, 2, 3] as const).map((week) => (
        <View key={week} style={styles.weekCard}>
          <ThemedText type="smallBold">Week {week}</ThemedText>
          <View style={styles.actions}>
            <DebugButton
              label={`Reset from Week ${week}`}
              destructive
              disabled={pendingAction !== null}
              busy={pendingAction === `reset-${week}`}
              onPress={() => runReset(week)}
            />
            <DebugButton
              label={`Complete through Week ${week}`}
              disabled={pendingAction !== null}
              busy={pendingAction === `complete-${week}`}
              onPress={() => runComplete(week)}
            />
          </View>
        </View>
      ))}

      {message ? (
        <ThemedText accessibilityRole="alert" style={styles.message}>{message}</ThemedText>
      ) : null}
    </View>
  );
}

function DebugButton({
  label,
  destructive = false,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        destructive ? styles.destructiveAction : styles.completeAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : (
        <ThemedText style={styles.actionText}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  weekCard: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#8EA4A1",
    borderRadius: 16,
    padding: 14,
  },
  actions: { gap: 10 },
  action: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  destructiveAction: { backgroundColor: "#8A3B35" },
  completeAction: { backgroundColor: "#41644A" },
  actionText: { color: "#ffffff", fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
  message: { borderRadius: 12, padding: 12, backgroundColor: "#DDE9E1" },
});
