import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DevProgressTools } from "@/components/dev-progress-tools";
import { SignOutButton } from "@/components/sign-out-button";

export default function SettingsScreen() {
  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ThemedText style={styles.backText}>Back</ThemedText>
            </Pressable>

            <ThemedText type="title">Settings</ThemedText>
            <ThemedText>
              Manage app options and access development previews.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle">Demo tools</ThemedText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open instructor preview"
              accessibilityHint="Opens the instructor progress screen using demonstration data."
              onPress={() => router.push("/settings/instructor")}
              style={styles.card}
            >
              <ThemedText type="smallBold">
                Instructor preview
              </ThemedText>
              <ThemedText>
                Review the instructor progress interface with test data.
              </ThemedText>
            </Pressable>

            <ThemedText style={styles.note}>
              This preview is for development and sponsor demonstrations. Real
              instructor access will require role-based authorization.
            </ThemedText>
          </View>

          {__DEV__ ? <DevProgressTools /> : null}

          <View style={styles.section}>
            <ThemedText type="subtitle">Account</ThemedText>
            <SignOutButton />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 28,
  },
  header: {
    gap: 12,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderColor: "#8EA4A1",
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  note: {
    opacity: 0.72,
    lineHeight: 20,
  },
});
