
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import BreathingPlayer from "../app/breathing-player";
import {
  WEEK_ONE_PRACTICES,
  type WeekOnePracticeId,
} from "../../lib/week-one-practices";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

interface WeekOnePracticeSelectorProps {
  activityId: string;
  onContinue: () => Promise<boolean>;
  onExit: () => void;
  isSaving?: boolean;
}

const PRACTICE_IDS: WeekOnePracticeId[] = [
  "breathing_426",
  "mindful_walking",
];

export function WeekOnePracticeSelector({
  activityId,
  onContinue,
  onExit,
  isSaving = false,
}: WeekOnePracticeSelectorProps) {
  const [selectedPractice, setSelectedPractice] =
    useState<WeekOnePracticeId | null>(null);

  if (selectedPractice) {
    const practice = WEEK_ONE_PRACTICES[selectedPractice];

    // Each practice has separate local session storage.
    // The original activityId remains the Week 1
    // curriculum progress identifier.
    const sessionActivityId =
      `${activityId}:practice:${selectedPractice}`;

    return (
      <BreathingPlayer
        key={sessionActivityId}
        activityId={sessionActivityId}
        practiceTitle={practice.title}
        durationMs={practice.durationMs}
        instructions={practice.instructions}
        isSaving={isSaving}
        onContinue={onContinue}
        onExit={() => setSelectedPractice(null)}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">
          Choose your practice
        </ThemedText>

        <ThemedText>
          Choose one of the two Week 1 mindfulness
          activities. Both use the same practice
          controls and require a complete session.
        </ThemedText>

        {PRACTICE_IDS.map(id => {
          const practice = WEEK_ONE_PRACTICES[id];
          const minutes =
            practice.durationMs / 60000;

          return (
            <View key={id} style={styles.card}>
              <ThemedText type="subtitle">
                {practice.title}
              </ThemedText>

              <ThemedText>
                {practice.description}
              </ThemedText>

              <ThemedText>
                Duration: {minutes} minutes
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  `Choose ${practice.title}`
                }
                accessibilityHint={
                  "Opens the selected practice. " +
                  "Selecting does not complete the activity."
                }
                style={styles.button}
                disabled={isSaving}
                onPress={() => setSelectedPractice(id)}
              >
                <ThemedText style={styles.buttonText}>
                  Choose {practice.title}
                </ThemedText>
              </Pressable>
            </View>
          );
        })}

        <Pressable
          accessibilityRole="button"
          style={styles.backButton}
          onPress={onExit}
          disabled={isSaving}
        >
          <ThemedText>
            Back to Week 1
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
    gap: 20,
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b9cbbd",
  },
  button: {
    backgroundColor: "#41644a",
    borderRadius: 10,
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    textAlign: "center",
  },
  backButton: {
    minHeight: 48,
    justifyContent: "center",
  },
});
