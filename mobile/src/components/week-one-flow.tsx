import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { useSignedInUserId } from "./auth-gate";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { IntentionMirrorScreen } from "./intention-mirror-screen";
import { AiGapReflectionScreen } from "./ai-gap-reflection-screen";
import BreathingPlayer from "../app/breathing-player";
import { useTheme } from "@/hooks/use-theme";
import { returnToWriting, saveWeekOneStep, startWeekOne } from "../../lib/week-one";
import type { ReflectionAnswers, WeekOneProgress } from "../../lib/progress";
import type { IntentionResponse } from "../../lib/intention";

const FORMS = {
  post_breathing_check_in: {
    title: "After breathing",
    instructions: "Notice your thoughts, feelings, and body after the breathing practice.",
    fields: [{ key: "post_breathing_check_in", label: "What do you notice now?" }],
  },
  data_self_portrait: {
    title: "Data self-portrait",
    instructions: "Think about what a picture of you made only from data could show and leave out.",
    fields: [
      { key: "data_self_portrait_visible", label: "What could data about you show?" },
      { key: "data_self_portrait_missing", label: "What would that data leave out?" },
    ],
  },
  yellowdig_draft: {
    title: "Yellowdig draft",
    instructions: "Draft a discussion post about what you noticed, what AI got right or missed, and one question for others. This saves your draft; it does not post to Yellowdig.",
    fields: [{ key: "yellowdig_draft", label: "Your discussion draft" }],
  },
};

function Questions({ progress, busy, onSave, onExit }: {
  progress: WeekOneProgress; busy: boolean;
  onSave: (answers: ReflectionAnswers, advance: boolean) => Promise<boolean>;
  onExit: () => void;
}) {
  const form = FORMS[progress.current_step as keyof typeof FORMS];
  const theme = useTheme();
  const [answers, setAnswers] = useState<ReflectionAnswers>(progress.reflection_answers);
  const valid = form.fields.every(field => answers[field.key]?.trim());
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Pressable accessibilityRole="button" style={styles.action} disabled={busy}
              accessibilityHint="Saves your answers before returning to the curriculum."
              onPress={() => void onSave(answers, false).then(saved => { if (saved) onExit(); })}>
              <ThemedText>Save and return to Week 1</ThemedText>
            </Pressable>
            <AccessibleHeading>{form.title}</AccessibleHeading>
            <ThemedText>{form.instructions}</ThemedText>
            {progress.current_step === "yellowdig_draft" && (
              <View style={styles.section}>
                <ThemedText accessibilityRole="header" type="smallBold">Your gap reflection</ThemedText>
                {["ai_gap_got_right", "ai_gap_missed", "ai_gap_reveals"].map(key => (
                  <ThemedText key={key}>{progress.reflection_answers[key]}</ThemedText>
                ))}
              </View>
            )}
            {form.fields.map(field => (
              <View key={field.key} style={styles.section}>
                <ThemedText>{field.label}</ThemedText>
                <TextInput accessibilityLabel={field.label} accessibilityHint="Required. Saved when you continue or return to Week 1."
                  multiline textAlignVertical="top" editable={!busy} value={answers[field.key] ?? ""}
                  onChangeText={text => setAnswers(value => ({ ...value, [field.key]: text }))}
                  style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
              </View>
            ))}
            {!valid && <ThemedText>Answer each question to continue.</ThemedText>}
            <Pressable accessibilityRole="button" disabled={!valid || busy}
              accessibilityState={{ disabled: !valid || busy, busy }} style={styles.button}
              onPress={() => void onSave(answers, true)}>
              <ThemedText style={styles.buttonText}>{progress.current_step === "yellowdig_draft" ? "Complete Week 1" : "Save and continue"}</ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function WeekOneFlow({ activityId, onExit }: { activityId: string; onExit: () => void }) {
  const userId = useSignedInUserId();
  const [progress, setProgress] = useState<WeekOneProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setError(null);
    setBusy(true);
    void startWeekOne(userId, activityId).then(data => {
      if (!cancelled) setProgress(data);
    }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : "Could not load Week 1.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; alive.current = false; };
  }, [userId, activityId, attempt]);

  async function change(operation: () => Promise<WeekOneProgress>): Promise<boolean> {
    if (active.current) return false;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await operation();
      if (!alive.current) return false;
      setProgress(data);
      return true;
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : "Could not save progress. Please retry.");
      return false;
    } finally {
      active.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function save(answers: ReflectionAnswers = {}, advance = true) {
    if (!progress) return Promise.resolve(false);
    return change(() => saveWeekOneStep(userId, activityId, progress.current_step, answers, advance));
  }

  return (
    <ThemedView style={styles.flex}>
      {busy && <AccessibleStatus>Loading or saving Week 1 progress…</AccessibleStatus>}
      {error && (
        <View style={styles.error}>
          <AccessibleStatus error>{error}</AccessibleStatus>
          <ThemedText>Your changes remain on this screen. Try the same action again, or reload your last saved progress.</ThemedText>
          <Pressable accessibilityRole="button" style={styles.action} disabled={busy}
            accessibilityHint="Restores the last saved step and answers. Unsaved answers will be replaced."
            onPress={() => setAttempt(value => value + 1)}>
            <ThemedText>Reload saved progress</ThemedText>
          </Pressable>
        </View>
      )}
      {progress?.current_step === "breathing" && (
        <BreathingPlayer onContinue={() => void save()} onExit={onExit} isSaving={busy} />
      )}
      {progress && (progress.current_step === "writing" || progress.current_step === "intention_mirror") && (
        <IntentionMirrorScreen
  activityId={activityId}
  onBack={onExit}
  onIntentionsReady={() => undefined}
          initialIntentions={progress.current_step === "intention_mirror" && progress.generated_intentions.length === 3
            ? { intentions: progress.generated_intentions as IntentionResponse["intentions"], provider: "mock" } : undefined}
          onGenerated={async () => {
            if (progress.current_step === "writing" && !(await save())) throw new Error("Intentions were saved, but the next step could not be saved. Retry to continue.");
          }}
          onEditWriting={() => change(() => returnToWriting(userId, activityId))}
          continueLabel="Continue to data self-portrait"
          onOpenGap={() => void save()} />
      )}
      {progress && progress.current_step in FORMS && (
        <Questions key={`${progress.current_step}:${attempt}`} progress={progress} busy={busy} onSave={save} onExit={onExit} />
      )}
      {progress?.current_step === "ai_gap_reflection" && (
        <AiGapReflectionScreen activityId={activityId} onBack={onExit}
          onOpenIntention={() => void change(() => returnToWriting(userId, activityId))}
          onContinue={() => save()} />
      )}
      {progress?.current_step === "completed" && (
        <ScrollView contentContainerStyle={styles.content}>
          <AccessibleHeading>Week 1 complete</AccessibleHeading>
          <ThemedText>Your writing, intentions, reflections, and Yellowdig draft are saved.</ThemedText>
          <ThemedText accessibilityRole="header" type="subtitle">Your Yellowdig draft</ThemedText>
          <ThemedText>{progress.reflection_answers.yellowdig_draft}</ThemedText>
          <Pressable accessibilityRole="button" style={styles.button} onPress={onExit}>
            <ThemedText style={styles.buttonText}>Back to Week 1</ThemedText>
          </Pressable>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, section: { gap: 12 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, gap: 24 },
  error: { padding: 24, paddingTop: Platform.OS === "web" ? 80 : 24, gap: 12 },
  editor: { minHeight: 160, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#b9cbbd", fontSize: 16, lineHeight: 24 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center" },
  button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: "#41644a", justifyContent: "center", alignItems: "center" },
  buttonText: { color: "white", fontWeight: "700" },
});
