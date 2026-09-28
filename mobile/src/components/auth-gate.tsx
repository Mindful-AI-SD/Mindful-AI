import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { supabase } from "../../lib/supabase";
import { AuthScreen } from "./auth-screen";

type AuthGateProps = {
  children: ReactNode;
};

const SignedInUserContext = createContext<string | null>(null);

export function useSignedInUserId() {
  const userId = useContext(SignedInUserContext);
  if (!userId) throw new Error("This screen requires a signed-in user.");
  return userId;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let authChanged = false;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Could not restore session:", error.message);
      }

      if (isMounted && !authChanged) {
        setSession(data.session);
        setIsLoading(false);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authChanged = true;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#41644a" size="large" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <SignedInUserContext.Provider key={session.user.id} value={session.user.id}>
      {children}
    </SignedInUserContext.Provider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f5f0",
  },
});
