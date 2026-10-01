import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSignedInUserId } from "@/components/auth-gate";
import { AccessibleHeading, AccessibleStatus } from "@/components/accessibility";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import {
  getGapReflection, saveGapReflection,
  type GapReflection, type GapReflectionAnswers,
} from "../../lib/progress";

const QUESTIONS: { key: keyof GapReflectionAnswers; label: string }[] = [
  { key: "ai_gap_got_right", label: "What did the mock intentions get right?" },
  { key: "ai_gap_missed", label: "What did they miss?" },
  { key: "ai_gap_reveals", label: "What does the gap reveal?" },
];

export function AiGapReflectionScreen({ activityId, onBack, onOpenIntention }: {
  activityId: string;
  onBack: () => void;
  onOpenIntention: () => void;
}) {
  const userId = useSignedInUserId();
  const theme = useTheme();
  const [reflection, setReflection] = useState<GapReflection | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<GapReflectionAnswers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savingRef = useRef(false);
  const version = useRef(0);

  useEffect(() => {
    const current = ++version.current;
    setIsLoading(true);
    setLoadError(null);
    setReflection(null);
    void getGapReflection(userId, activityId).then((data) => {
      if (version.current !== current) return;
      setReflection(data);
      setSavedAnswers(data.answers);
    }).catch(() => {
      if (version.current === current) {
        setLoadError("Could not load your saved intentions and reflection.");
      }
    }).finally(() => {
      if (version.current === current) setIsLoading(false);
    });
    return () => { version.current++; };
  }, [userId, activityId, loadAttempt]);

  const dirty = reflection !== null && QUESTIONS.some(
    ({ key }) => reflection.answers[key] !== savedAnswers?.[key],
  );

  async function save(): Promise<boolean> {
    if (!reflection || savingRef.current) return false;
    if (!dirty) return true;
    const current = version.current;
    const answers = { ...reflection.answers };
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveGapReflection(userId, activityId, answers);
      if (version.current !== current) return false;
      setSavedAnswers(answers);
      return true;
    } catch {
      if (version.current === current) {
        setSaveError("Could not save your reflection. Your answers are still here.");
      }
      return false;
    } finally {
      savingRef.current = false;
      if (version.current === current) setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Pressable accessibilityRole="button" disabled={isSaving} style={styles.action}
              accessibilityHint="Saves any changed answers before returning to Week 1."
              accessibilityState={{ disabled: isSaving }}
              onPress={() => {
                if (!dirty) onBack();
                else void save().then((saved) => { if (saved) onBack(); });
              }}>
              <ThemedText>Back to Week 1</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">WEEK 1</ThemedText>
            <AccessibleHeading focusKey={isLoading ? "loading" : loadError ? "error" : "ready"}>AI gap reflection</AccessibleHeading>

            {isLoading && (
              <View style={styles.section} accessibilityLiveRegion="polite">
                <ActivityIndicator color="#41644a" accessible={false} />
                <AccessibleStatus>Loading your saved intentions and reflection…</AccessibleStatus>
              </View>
            )}
            {!isLoading && loadError && (
              <View style={styles.section}>
                <AccessibleStatus error>{`${loadError} Use Retry loading to try again.`}</AccessibleStatus>
                <Pressable accessibilityRole="button" accessibilityHint="Loads your saved intentions and answers again." style={styles.action} onPress={() => setLoadAttempt((value) => value + 1)}>
                  <ThemedText>Retry loading</ThemedText>
                </Pressable>
              </View>
            )}
            {!isLoading && reflection && !reflection.intentions && (
              <View style={styles.section}>
                <AccessibleStatus error>No complete set of three saved intentions is available. Open Intention Mirror to create and save them first.</AccessibleStatus>
                <Pressable accessibilityRole="button" accessibilityHint="Opens the writing screen to create three intentions." style={styles.action} onPress={onOpenIntention}>
                  <ThemedText>Open Intention Mirror</ThemedText>
                </Pressable>
              </View>
            )}
            {!isLoading && reflection?.intentions && (
              <>
                <View style={styles.section}>
                  <ThemedText type="subtitle" accessibilityRole="header">Your saved mock intentions</ThemedText>
                  {reflection.intentions.map((intention, index) => (
                    <ThemedView key={index} style={styles.card} accessible
                      accessibilityLabel={`Intention ${index + 1} of 3. ${intention.title}. ${intention.explanation}`}>
                      <ThemedText type="smallBold">{intention.title}</ThemedText>
                      <ThemedText>{intention.explanation}</ThemedText>
                    </ThemedView>
                  ))}
                </View>
                {QUESTIONS.map(({ key, label }) => (
                  <View key={key} style={styles.section}>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <TextInput
                      accessibilityLabel={label} multiline textAlignVertical="top"
                      accessibilityHint="Multiline answer. Use Save reflection after editing; the intentions are above the questions."
                      accessibilityState={{ disabled: isSaving }}
                      editable={!isSaving} value={reflection.answers[key]}
                      onChangeText={(text) => {
                        setReflection((value) => value && ({ ...value, answers: { ...value.answers, [key]: text } }));
                        setSaveError(null);
                      }}
                      style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                    />
                  </View>
                ))}
                <AccessibleStatus error={!!saveError}>
                  {isSaving ? "Saving…" : saveError ?? (dirty ? "Unsaved changes" : "Saved")}
                </AccessibleStatus>
                <Pressable accessibilityRole="button" disabled={isSaving || !dirty}
                  accessibilityHint="Saves all three answers to your account. Enabled when answers have changed."
                  accessibilityState={{ disabled: isSaving || !dirty, busy: isSaving }}
                  onPress={() => void save()}
                  style={[styles.saveButton, (isSaving || !dirty) && styles.disabled]}>
                  <ThemedText style={styles.buttonText}>{saveError ? "Retry save" : "Save reflection"}</ThemedText>
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: "100%", maxWidth: 720, alignSelf: "center", gap: 24,
    padding: 24, paddingTop: Platform.OS === "web" ? 80 : 24, paddingBottom: 48,
  },
  section: { gap: 12 },
  card: { gap: 8, padding: 20, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12 },
  editor: { minHeight: 140, padding: 16, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12, fontSize: 16, lineHeight: 24 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center" },
  saveButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#41644a" },
  buttonText: { color: "#ffffff", fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
