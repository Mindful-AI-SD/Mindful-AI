import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  type CurriculumWeek,
  getPublishedWeekOne,
} from "../../lib/curriculum";

export default function HomeScreen() {
  const [week, setWeek] = useState<CurriculumWeek | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadWeek = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const weekOne = await getPublishedWeekOne();
      setWeek(weekOne);
    } catch (error) {
      setWeek(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unknown error occurred while loading Week 1.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.eyebrow}>MINDFUL AI</ThemedText>
            <ThemedText type="title">Your curriculum</ThemedText>
          </View>

          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator color="#41644a" size="large" />
              <ThemedText>Loading Week 1...</ThemedText>
            </View>
          )}

          {!isLoading && errorMessage && (
            <ThemedView style={styles.messageCard}>
              <ThemedText type="subtitle">Unable to load Week 1</ThemedText>
              <ThemedText>{errorMessage}</ThemedText>

              <Pressable
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

                <ThemedText type="title">{week.title}</ThemedText>

                <ThemedText style={styles.theme}>{week.theme}</ThemedText>

                {week.description && (
                  <ThemedText style={styles.description}>
                    {week.description}
                  </ThemedText>
                )}
              </ThemedView>

              <View style={styles.section}>
                <ThemedText type="subtitle">Activities</ThemedText>

                {week.activities.length === 0 ? (
                  <ThemedText>
                    No published activities are available yet.
                  </ThemedText>
                ) : (
                  week.activities.map((activity) => (
                    <ThemedView key={activity.id} style={styles.activityCard}>
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

                      <ThemedText type="subtitle">
                        {activity.title}
                      </ThemedText>

                      {activity.content && (
                        <ThemedText style={styles.description}>
                          {activity.content}
                        </ThemedText>
                      )}
                    </ThemedView>
                  ))
                )}
              </View>
            </>
          )}

          <SignOutButton />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: 24,
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  centered: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 48,
  },
  messageCard: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#d5a3a3",
    borderRadius: 16,
  },
  weekCard: {
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#b9cbbd",
    borderRadius: 20,
  },
  weekNumber: {
    color: "#41644a",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  theme: {
    color: "#41644a",
    fontSize: 17,
    fontWeight: "600",
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    gap: 16,
  },
  activityCard: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#d4ddd3",
    borderRadius: 16,
  },
  activityMetadata: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  activityType: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  duration: {
    fontSize: 14,
    opacity: 0.7,
  },
  retryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#41644a",
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});