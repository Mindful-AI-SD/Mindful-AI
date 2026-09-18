import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getHealth } from "../../lib/health";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { SignOutButton } from "@/components/sign-out-button";

type ConnectionState =
  | { status: "checking" }
  | { status: "connected"; service: string; version: string }
  | { status: "error"; message: string };

export default function HomeScreen() {
  const [connection, setConnection] = useState<ConnectionState>({
    status: "checking",
  });

  useEffect(() => {
    let isMounted = true;

    getHealth()
      .then((health) => {
        if (isMounted) {
          setConnection({
            status: "connected",
            service: health.service,
            version: health.version,
          });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setConnection({
            status: "error",
            message:
              error instanceof Error ? error.message : "Unknown connection error",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Mindful AI</ThemedText>

        {connection.status === "checking" && (
          <ThemedText>Checking backend connection...</ThemedText>
        )}

        {connection.status === "connected" && (
          <ThemedView style={styles.statusCard}>
            <ThemedText type="subtitle">Backend connected</ThemedText>
            <ThemedText>Service: {connection.service}</ThemedText>
            <ThemedText>Version: {connection.version}</ThemedText>
          </ThemedView>
        )}

        {connection.status === "error" && (
          <ThemedView style={styles.statusCard}>
            <ThemedText type="subtitle">Backend connection failed</ThemedText>
            <ThemedText>{connection.message}</ThemedText>
          </ThemedView>
        )}
        <SignOutButton />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
  statusCard: {
    gap: 8,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#888",
  },
});