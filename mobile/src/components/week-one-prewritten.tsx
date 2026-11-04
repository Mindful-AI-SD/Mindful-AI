import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import type { PrewrittenRecord, WeekOnePrewritten } from "../../lib/prewritten-content";
import type { ReflectionAnswers } from "../../lib/progress";
import {
  MAX_PREWRITTEN_INTENTION_CHARACTERS,
  WEEK_ONE_EXPLORE_SOURCE_KEY,
  WEEK_ONE_PREWRITTEN_INTENTION_KEY,
  WEEK_ONE_PREWRITTEN_RESULT_KEY,
  weekOnePromptKey,
} from "../../lib/week-one-prewritten";

type Record = PrewrittenRecord<WeekOnePrewritten>;

// Choosing an example is the student's choice, not a recommendation. What they
// keep is saved word for word, apart from the fixed examples.
export function WeekOnePrewrittenChoice({ record, initialIntention, alreadySaved, continueLabel, onSave, onContinue }: {
  record: Record;
  initialIntention: string;
  // False when returning through writing: the words prefill but still need saving
  // to reach the next step.
  alreadySaved: boolean;
  continueLabel: string;
  onSave: (answers: ReflectionAnswers) => Promise<boolean>;
  onContinue: () => void;
}) {
  const theme = useTheme();
  const [intention, setIntention] = useState(initialIntention);
  const [savedIntention, setSavedIntention] = useState<string | null>(alreadySaved ? initialIntention : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = intention.trim().length > 0 && intention.length <= MAX_PREWRITTEN_INTENTION_CHARACTERS;
  const isSaved = valid && intention === savedIntention;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const { provider, contentVersion, labels, result } = record;
    const saved = await onSave({
      [WEEK_ONE_PREWRITTEN_RESULT_KEY]: JSON.stringify({ provider, contentVersion, labels, result }),
      [WEEK_ONE_PREWRITTEN_INTENTION_KEY]: intention,
      [WEEK_ONE_EXPLORE_SOURCE_KEY]: "prewritten",
    });
    setSaving(false);
    if (saved) setSavedIntention(intention);
    else setError("Could not save your intention. Your words are still here. Please retry.");
  }

  return (
    <View style={styles.section}>
      <AccessibleHeading>{record.labels.modeTitle}</AccessibleHeading>
      <ThemedText>{record.labels.disclosure}</ThemedText>
      <ThemedText>{record.result.instruction}</ThemedText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Intention examples" style={styles.section}>
        {record.result.examples.map((example) => {
          const checked = intention === example;
          return (
            <Pressable
              key={example}
              accessibilityRole="radio"
              accessibilityLabel={example}
              accessibilityHint="Copies this example into your intention, where you can change it."
              accessibilityState={{ checked, disabled: saving }}
              aria-checked={checked}
              disabled={saving}
              style={[styles.choice, checked && styles.choiceSelected]}
              onPress={() => setIntention(example)}
            >
              <ThemedText>{`${example}${checked ? " ✓" : ""}`}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <ThemedText type="smallBold">Your intention</ThemedText>
      <TextInput
        accessibilityLabel="Your intention"
        accessibilityHint={`Adapt an example or write your own, up to ${MAX_PREWRITTEN_INTENTION_CHARACTERS} characters.`}
        multiline
        editable={!saving}
        maxLength={MAX_PREWRITTEN_INTENTION_CHARACTERS}
        value={intention}
        onChangeText={setIntention}
        style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <ThemedText type="small">{record.labels.responseScreen}</ThemedText>
      {error && <AccessibleStatus error>{error}</AccessibleStatus>}
      {!isSaved && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || saving, busy: saving }}
          disabled={!valid || saving}
          style={[styles.button, (!valid || saving) && styles.disabled]}
          onPress={() => void save()}
        >
          <ThemedText style={styles.buttonText}>{saving ? "Saving…" : "Save my intention"}</ThemedText>
        </Pressable>
      )}
      {isSaved && (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onContinue}>
          <ThemedText style={styles.buttonText}>{continueLabel}</ThemedText>
        </Pressable>
      )}
      <ThemedText type="small">{record.labels.resultFooter}</ThemedText>
    </View>
  );
}

// Replaces the AI gap questions in this mode: there is no AI output to compare.
export function WeekOnePrewrittenReflection({ record, savedAnswers, busy, onSave, onExit }: {
  record: Record;
  savedAnswers: ReflectionAnswers;
  busy: boolean;
  onSave: (answers: ReflectionAnswers, advance: boolean) => Promise<boolean>;
  onExit: () => void;
}) {
  const theme = useTheme();
  const prompts = record.result.reflectionPrompts;
  const [answers, setAnswers] = useState<ReflectionAnswers>(() =>
    Object.fromEntries(prompts.map((_, index) => [weekOnePromptKey(index), savedAnswers[weekOnePromptKey(index)] ?? ""]))
  );
  const complete = prompts.every((_, index) => answers[weekOnePromptKey(index)]?.trim());
  return (
    <View style={styles.section}>
      <AccessibleHeading>{record.labels.modeTitle}</AccessibleHeading>
      <ThemedText>{record.labels.responseScreen}</ThemedText>
      <ThemedText type="smallBold">Your intention</ThemedText>
      <ThemedText>{savedAnswers[WEEK_ONE_PREWRITTEN_INTENTION_KEY]}</ThemedText>
      {prompts.map((prompt, index) => {
        const key = weekOnePromptKey(index);
        return (
          <View key={key} style={styles.section}>
            <ThemedText>{prompt}</ThemedText>
            <TextInput
              accessibilityLabel={prompt}
              accessibilityHint="Up to 2,000 characters. Your words are saved as entered."
              multiline
              editable={!busy}
              maxLength={2000}
              value={answers[key]}
              onChangeText={(value) => setAnswers((current) => ({ ...current, [key]: value }))}
              style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </View>
        );
      })}
      {!complete && <ThemedText>Answer each prompt to complete Week 1.</ThemedText>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        style={styles.action}
        onPress={() => void onSave(answers, false).then((saved) => { if (saved) onExit(); })}
      >
        <ThemedText>Save and return to Week 1</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !complete, busy }}
        disabled={busy || !complete}
        style={[styles.button, (busy || !complete) && styles.disabled]}
        onPress={() => void onSave(answers, true)}
      >
        <ThemedText style={styles.buttonText}>Complete Week 1</ThemedText>
      </Pressable>
      <ThemedText type="small">{record.labels.resultFooter}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  choice: { minHeight: 48, padding: 12, justifyContent: "center", borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 18, backgroundColor: "#FFFFFF" },
  choiceSelected: { borderWidth: 2, borderColor: "#41644a", backgroundColor: "rgba(65, 100, 74, 0.15)" },
  editor: { minHeight: 96, padding: 12, borderRadius: 14 },
  action: { minHeight: 48, minWidth: 48, justifyContent: "center" },
  button: { minHeight: 48, padding: 12, borderRadius: 22, backgroundColor: "#365B48", justifyContent: "center", alignItems: "center" },
  buttonText: { color: "white", fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
