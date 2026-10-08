import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { hasArrivalRatings } from "../../lib/week-one-arrival";
import type { ReflectionAnswers } from "../../lib/progress";

export function WeekOneArrive({ savedAnswers, busy, onSave, onExit }: {
  savedAnswers: ReflectionAnswers;
  busy: boolean;
  onSave: (answers: ReflectionAnswers) => Promise<boolean>;
  onExit: () => void;
}) {
  const [answers, setAnswers] = useState(savedAnswers);
  const valid = hasArrivalRatings(answers);
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <AccessibleHeading>Arrive</AccessibleHeading>
          <ThemedText>Take a moment to notice your mood and energy before practicing.</ThemedText>
          {[
            { key: "arrive_mood", label: "Mood", scale: "1 = very low mood; 5 = very positive mood" },
            { key: "arrive_energy", label: "Energy", scale: "1 = very low energy; 5 = very high energy" },
          ].map(rating => (
            <View key={rating.key} style={styles.section}>
              <ThemedText accessibilityRole="header">{rating.label}</ThemedText>
              <ThemedText>{rating.scale}</ThemedText>
              <View accessibilityRole="radiogroup" accessibilityLabel={rating.label} style={styles.ratings}>
                {[1, 2, 3, 4, 5].map(value => (
                  <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${rating.label}: ${value} of 5`}
                    accessibilityState={{ checked: answers[rating.key] === String(value), disabled: busy }}
                    aria-checked={answers[rating.key] === String(value)} disabled={busy}
                    style={styles.action} onPress={() => setAnswers(current => ({ ...current, [rating.key]: String(value) }))}>
                    <ThemedText>{`${value}${answers[rating.key] === String(value) ? " ✓" : ""}`}</ThemedText>
                  </Pressable>
                ))}
              </View>
              {answers[rating.key] && <AccessibleStatus>{`${rating.label} selected: ${answers[rating.key]} of 5`}</AccessibleStatus>}
            </View>
          ))}
          {!valid && <ThemedText>Choose both ratings to continue.</ThemedText>}
          <Pressable accessibilityRole="button" disabled={!valid || busy}
            accessibilityState={{ disabled: !valid || busy, busy }} style={styles.action}
            onPress={() => void onSave(answers)}>
            <ThemedText>Continue to Practice</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
            onPress={() => void onSave(answers).then(saved => { if (saved) onExit(); })}>
            <ThemedText>Save and return to Week 1</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, section: { gap: 12 }, ratings: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, gap: 24 },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center", borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12 },
});
