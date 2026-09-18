import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || password.length < 6) {
      Alert.alert(
        "Check your information",
        "Enter a valid email and a password containing at least 6 characters.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          Alert.alert(
            "Check your email",
            "Open the confirmation link before signing in.",
          );
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed.";

      Alert.alert("Unable to continue", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>MINDFUL AI</Text>
        <Text style={styles.title}>
          {isSignUp ? "Create your account" : "Welcome back"}
        </Text>
        <Text style={styles.description}>
          {isSignUp
            ? "Create an account to begin the curriculum."
            : "Sign in to continue your reflections."}
        </Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />

        <TextInput
          autoCapitalize="none"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        <Pressable
          disabled={isSubmitting}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            isSubmitting && styles.buttonDisabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isSignUp ? "Create account" : "Sign in"}
            </Text>
          )}
        </Pressable>

        <Pressable
          disabled={isSubmitting}
          onPress={() => setIsSignUp((current) => !current)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {isSignUp
              ? "Already have an account? Sign in"
              : "Need an account? Sign up"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f2f5f0",
  },
  card: {
    gap: 16,
    padding: 24,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },
  eyebrow: {
    color: "#41644a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    color: "#1d2a20",
    fontSize: 30,
    fontWeight: "700",
  },
  description: {
    color: "#59645b",
    fontSize: 16,
    lineHeight: 23,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#cbd4ca",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    color: "#1d2a20",
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#41644a",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    padding: 8,
  },
  secondaryButtonText: {
    color: "#41644a",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});