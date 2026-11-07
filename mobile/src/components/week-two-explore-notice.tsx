import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "./themed-text";
import { AccessibleStatus } from "./accessibility";
import { SENSATION_KEYS, validSensations, type LexiconWords, type WeekTwoResult } from "../../lib/week-two";
import { generatedSourceLabel } from "../../lib/prewritten-content";
import type { ActivityModeState } from "@/hooks/use-activity-mode";
import { ActivityModeNotice } from "./activity-mode-notice";
import { WeekTwoPrewrittenResults } from "./week-two-prewritten";
import type { ReflectionAnswers } from "../../lib/progress";
import type { SensationLexiconData } from "../../lib/sensation-lexicon";
import { WEEK_TWO_ETHICS_CARD } from "../../lib/ethics-cards";

export function SensationResults({ data }: { data: LexiconWords }) {
  const source = generatedSourceLabel(data.provider);
  return <View style={styles.section}>
    <ThemedText accessibilityRole="header" type="subtitle">Sensation Lexicon results</ThemedText>
    {source && <ThemedText type="small">{source}</ThemedText>}
    {data.items.map((item, index) => <View key={index} style={styles.card} accessible
      accessibilityLabel={`Sensation ${index + 1} of 3. ${item.original}. ${item.suggestions.length ? `Suggested words: ${item.suggestions.join(", ")}` : "No alternative words suggested."}`}>
      <ThemedText type="smallBold">{item.original}</ThemedText>
      <ThemedText>{item.suggestions.length ? `Suggested words: ${item.suggestions.join(", ")}` : "No alternative words suggested."}</ThemedText>
    </View>)}
  </View>;
}

function sensationValidationMessage(value: string, index: number): string | null {
  const length = value.trim().length;
  if (length === 0) return `Sensation ${index + 1} is required.`;
  if (length < 2) return `Sensation ${index + 1} needs at least 2 characters.`;
  if (length > 80) return `Sensation ${index + 1} must be 80 characters or fewer.`;
  return null;
}

export function WeekTwoExplore({ mode, answers, data, support, busy, retry, onChange, onGenerate, onContinue }: {
  mode: ActivityModeState;
  answers: ReflectionAnswers; data: WeekTwoResult | null;
  support: Extract<SensationLexiconData, { kind: "support" }> | null;
  busy: boolean; retry: boolean;
  onChange: (key: string, value: string) => void; onGenerate: () => void; onContinue: () => void;
}) {
  const theme = useTheme();
  const prewritten = mode.status === "ready" && !!mode.mode.labels;
  const blocked = mode.status !== "ready";
  return <View style={styles.section}>
    <ActivityModeNotice mode={mode} />
    <ThemedText>{prewritten
      ? "Describe three sensations in your own words, using 2–80 characters for each."
      : "Describe three sensations in your own words, using 2–80 characters for each. Only these descriptions are sent for AI processing; leave out identifying details."}</ThemedText>
    {SENSATION_KEYS.map((key, index) => {
      const value = answers[key] ?? "";
      const validationMessage = sensationValidationMessage(value, index);
      return <View key={key} style={styles.section}>
        <ThemedText>{`Sensation ${index + 1}`}</ThemedText>
        <TextInput accessibilityLabel={`Sensation ${index + 1}`} accessibilityHint="Use 2 to 80 characters. Save answers before leaving."
          multiline editable={!busy} value={value}
          onChangeText={nextValue => onChange(key, nextValue)}
          style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
        {validationMessage && <AccessibleStatus error>{validationMessage}</AccessibleStatus>}
      </View>;
    })}
    {!validSensations(answers) && <ThemedText>Correct the fields above to enable Generate sensation words.</ThemedText>}
    <Pressable accessibilityRole="button" disabled={busy || blocked || !validSensations(answers)} style={styles.action}
      accessibilityState={{ disabled: busy || blocked || !validSensations(answers), busy }}
      accessibilityHint={prewritten ? "Saves your descriptions and shows the prewritten word list." : "Saves your descriptions and requests words from the Sensation Lexicon service."}
      onPress={onGenerate}>
      <ThemedText>{busy ? "Loading or saving…" : retry ? "Retry Sensation Lexicon" : prewritten ? "Show the word list" : "Generate sensation words"}</ThemedText>
    </Pressable>
    {support && <View style={styles.card}>
      <AccessibleStatus>{support.message}</AccessibleStatus>
      {support.resources.map((resource, index) => <ThemedText key={index}>{`${resource.name}: ${resource.contact}`}</ThemedText>)}
    </View>}
    {data && !support && <>
      {data.kind === "prewritten"
        ? <WeekTwoPrewrittenResults record={data} answers={answers} busy={busy} onChange={onChange} />
        : <SensationResults data={data} />}
      <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={onContinue}
        accessibilityHint="Saves your results and opens Notice.">
        <ThemedText>Continue to Notice</ThemedText>
      </Pressable>
    </>}
  </View>;
}

export function WeekTwoNotice({ answers, data, busy, onChange, onComplete }: {
  answers: ReflectionAnswers; data: WeekTwoResult;
  busy: boolean; onChange: (key: string, value: string) => void; onComplete: () => void;
}) {
  const theme = useTheme();
  const valid = ["week_two_tracker_reflection", "week_two_closing_reflection"].every(key =>
    Boolean(answers[key]?.trim()) && answers[key].length <= 2000);
  return <View style={styles.section}>
    {data.kind === "prewritten"
      ? <ThemedText type="small">{data.labels.resultFooter}</ThemedText>
      : <SensationResults data={data} />}
    <View style={styles.card}>
      <ThemedText accessibilityRole="header" type="subtitle">{WEEK_TWO_ETHICS_CARD.title}</ThemedText>
      <ThemedText>{WEEK_TWO_ETHICS_CARD.body}</ThemedText>
    </View>
    {[
      { key: "week_two_tracker_reflection", label: "What could a tracker show, and what might it miss?" },
      { key: "week_two_closing_reflection", label: "What did you notice, and what did the suggested words capture or miss?" },
    ].map(field => <View key={field.key} style={styles.section}>
      <ThemedText>{field.label}</ThemedText>
      <TextInput accessibilityLabel={field.label} accessibilityHint="Required to complete Week 2. Up to 2,000 characters. Use Save answers to keep a draft."
        multiline editable={!busy} value={answers[field.key] ?? ""}
        onChangeText={value => onChange(field.key, value)}
        style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
    </View>)}
    {!valid && <ThemedText>Answer both questions, using up to 2,000 characters each, to complete Week 2.</ThemedText>}
    <Pressable accessibilityRole="button" disabled={busy || !valid} style={styles.action}
      accessibilityState={{ disabled: busy || !valid, busy }} accessibilityHint="Saves both answers and completes Week 2."
      onPress={onComplete}>
      <ThemedText>Complete Week 2</ThemedText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 16 }, card: { gap: 12, padding: 20, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12 },
  editor: { minHeight: 96, padding: 16, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 12, fontSize: 16, textAlignVertical: "top" },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" },
});
