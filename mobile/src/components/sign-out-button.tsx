import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { supabase } from "../../lib/supabase";

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Unable to sign out", error.message);
      setIsSigningOut(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isSigningOut}
      onPress={handleSignOut}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        isSigningOut && styles.buttonDisabled,
      ]}
    >
      {isSigningOut ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.text}>Sign out</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#41644a",
  },
  text: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});