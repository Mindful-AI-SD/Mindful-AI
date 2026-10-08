import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccessibleHeading } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

export type ModuleBeat = Readonly<{ id: string; title: string; description: string }>;
export type FourBeats = readonly [ModuleBeat, ModuleBeat, ModuleBeat, ModuleBeat];

/** Module entry/navigation is separate from the activities' own validation and saving. */
export function FourBeatModuleShell({ title, beats, savedBeatId, savedStepLabel, onResume, onExit }: {
  title: string;
  beats: FourBeats;
  savedBeatId: string;
  savedStepLabel: string;
  onResume: () => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(() => Math.max(0, beats.findIndex(beat => beat.id === savedBeatId)));
  const beat = beats[index];
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <AccessibleHeading>{title}</AccessibleHeading>
          <ThemedText>Four beats, in order</ThemedText>
          {beats.map((item, position) => (
            <ThemedText key={item.id} accessibilityLabel={`Beat ${position + 1}: ${item.title}${position === index ? ", selected" : ""}`}>
              {`${position + 1}. ${item.title}${position === index ? " — selected" : ""}`}
            </ThemedText>
          ))}
          <View accessibilityLiveRegion="polite" style={styles.detail}>
            <ThemedText accessibilityRole="header">{`Beat ${index + 1} of 4: ${beat.title}`}</ThemedText>
            <ThemedText>{beat.description}</ThemedText>
          </View>
          <View style={styles.navigation}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={index === 0}
              accessibilityState={{ disabled: index === 0 }} style={styles.action}
              onPress={() => setIndex(value => Math.max(0, value - 1))}>
              <ThemedText>Back</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Next" disabled={index === 3}
              accessibilityState={{ disabled: index === 3 }} style={styles.action}
              onPress={() => setIndex(value => Math.min(3, value + 1))}>
              <ThemedText>Next</ThemedText>
            </Pressable>
          </View>
          <ThemedText>{`Saved step: ${savedStepLabel}`}</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Resume: ${savedStepLabel}`}
            accessibilityHint="Opens your saved activity step. Reviewing the beats does not change your progress."
            style={styles.action} onPress={onResume}>
            <ThemedText>Resume saved step</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.action} onPress={onExit}>
            <ThemedText>Back to curriculum</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { maxWidth: 720, width: "100%", alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, gap: 16 },
  detail: { gap: 12 },
  navigation: { flexDirection: "row", gap: 24 },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" },
});
