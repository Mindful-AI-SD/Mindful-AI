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
import { returnToWriting, saveWeekOneArrival, saveWeekOneStep, startWeekOne } from "../../lib/week-one";
import type { ReflectionAnswers, WeekOneProgress } from "../../lib/progress";
import type { IntentionResponse } from "../../lib/intention";
import { FourBeatModuleShell } from "./four-beat-module-shell";
import { WEEK_ONE_BEATS, weekOneBeatId, weekOneStepLabel } from "../../lib/week-one-module";

import { WeekOneArrive } from "./week-one-arrive";
import { hasArrivalRatings } from "../../lib/week-one-arrival";

const FORMS = {
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

function PostBreathingCheckIn({ progress, busy, onSave, onExit }: {
  progress: WeekOneProgress; busy: boolean;
  onSave: (answers: ReflectionAnswers, advance: boolean) => Promise<boolean>;
  onExit: () => void;
}) {
  const theme = useTheme();
  const [answers, setAnswers] = useState<ReflectionAnswers>(progress.reflection_answers);
  const urge = answers.post_breathing_urge ?? "";
  const valid = urge === "yes" || urge === "no";

  function chooseUrge(value: "yes" | "no") {
    setAnswers(current => ({ ...current, post_breathing_urge: value }));
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Pressable accessibilityRole="button" style={styles.action} disabled={busy}
              accessibilityHint="Saves your check-in before returning to the curriculum."
              onPress={() => void onSave(answers, false).then(saved => { if (saved) onExit(); })}>
              <ThemedText>Save and return to Week 1</ThemedText>
            </Pressable>

            <AccessibleHeading>After breathing</AccessibleHeading>
            <ThemedText>Notice your thoughts, feelings, and body after the breathing practice.</ThemedText>

            <View style={styles.section}>
              <ThemedText accessibilityRole="header" type="smallBold">
                Did you notice an urge to check your phone?
              </ThemedText>
              <View accessibilityRole="radiogroup" accessibilityLabel="Did you notice an urge to check your phone?"
                style={styles.choiceRow}>
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: urge === "yes", disabled: busy }}
                  aria-checked={urge === "yes"} aria-disabled={busy}
                  disabled={busy} onPress={() => chooseUrge("yes")}
                  style={[styles.choice, urge === "yes" && styles.choiceSelected]}>
                  <ThemedText>Yes</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: urge === "no", disabled: busy }}
                  aria-checked={urge === "no"} aria-disabled={busy}
                  disabled={busy} onPress={() => chooseUrge("no")}
                  style={[styles.choice, urge === "no" && styles.choiceSelected]}>
                  <ThemedText>No</ThemedText>
                </Pressable>
              </View>
              {valid && <AccessibleStatus>{`Your choice: ${urge === "yes" ? "Yes" : "No"}`}</AccessibleStatus>}
            </View>

            <View style={styles.section}>
              <ThemedText>What did you notice? (optional)</ThemedText>
              <TextInput accessibilityLabel="What did you notice?"
                accessibilityHint="Optional note about your experience after breathing."
                multiline textAlignVertical="top" editable={!busy}
                value={answers.post_breathing_note ?? ""}
                onChangeText={text => setAnswers(current => ({ ...current, post_breathing_note: text }))}
                style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
            </View>

            {!valid && <ThemedText>Choose Yes or No to continue.</ThemedText>}
            <Pressable accessibilityRole="button" disabled={!valid || busy}
              accessibilityState={{ disabled: !valid || busy, busy }} style={styles.button}
              onPress={() => void onSave(answers, true)}>
              <ThemedText style={styles.buttonText}>Save and continue</ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

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

export function WeekOneFlow({ activityId, onExit, showModuleEntry = false }: {
  activityId: string; onExit: () => void; showModuleEntry?: boolean;
}) {
  const userId = useSignedInUserId();
  const [progress, setProgress] = useState<WeekOneProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [entryOpen, setEntryOpen] = useState(showModuleEntry);
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

  if (entryOpen && progress && !busy && !error) {
    return <FourBeatModuleShell title="Week 1" beats={WEEK_ONE_BEATS}
      savedBeatId={weekOneBeatId(progress.current_step, progress.reflection_answers)}
      savedStepLabel={weekOneStepLabel(progress.current_step, progress.reflection_answers)}
      onResume={() => setEntryOpen(false)} onExit={onExit} />;
  }

  const needsArrival = progress && progress.current_step !== "completed" && !hasArrivalRatings(progress.reflection_answers);

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
      {needsArrival && progress && <WeekOneArrive key={`arrive:${attempt}`} savedAnswers={progress.reflection_answers}
        busy={busy} onSave={answers => change(() => saveWeekOneArrival(userId, activityId, answers))} onExit={onExit} />}
      {!needsArrival && progress?.current_step === "breathing" && (
        <BreathingPlayer activityId={activityId} onContinue={() => save()} onExit={onExit} isSaving={busy} />
      )}
      {!needsArrival && progress?.current_step === "post_breathing_check_in" && (
        <PostBreathingCheckIn key={`post-breathing:${attempt}`} progress={progress}
          busy={busy} onSave={save} onExit={onExit} />
      )}
      {!needsArrival && progress && (progress.current_step === "writing" || progress.current_step === "intention_mirror") && (
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
      {!needsArrival && progress && progress.current_step in FORMS && (
        <Questions key={`${progress.current_step}:${attempt}`} progress={progress} busy={busy} onSave={save} onExit={onExit} />
      )}
      {!needsArrival && progress?.current_step === "ai_gap_reflection" && (
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
  choiceRow: { flexDirection: "row", gap: 12 },
  choice: { minHeight: 48, minWidth: 96, padding: 12, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  choiceSelected: { borderWidth: 2, borderColor: "#41644a", backgroundColor: "rgba(65, 100, 74, 0.15)" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, gap: 24 },
  error: { padding: 24, paddingTop: Platform.OS === "web" ? 80 : 24, gap: 12 },
  editor: { minHeight: 160, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#b9cbbd", fontSize: 16, lineHeight: 24 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center" },
  button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: "#41644a", justifyContent: "center", alignItems: "center" },
  buttonText: { color: "white", fontWeight: "700" },
});
