import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "./themed-text";
import {
  selectedWeekTwoWords,
  toggleWeekTwoWord,
  WEEK_TWO_PREWRITTEN_PROMPT_KEYS,
  WEEK_TWO_PREWRITTEN_WORDS_KEY,
  type WeekTwoPrewrittenRecord,
} from "../../lib/week-two";
import type { ReflectionAnswers } from "../../lib/progress";

// The fixed vocabulary is an observation aid: students choose words themselves,
// and these answers do not change the Week 2 completion rule.
export function WeekTwoPrewrittenResults({ record, answers, busy, onChange }: {
  record: WeekTwoPrewrittenRecord;
  answers: ReflectionAnswers;
  busy: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const theme = useTheme();
  const selected = selectedWeekTwoWords(answers);
  const [choosePrompt, ...otherPrompts] = record.result.reflectionPrompts;
  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" type="subtitle">{record.labels.modeTitle}</ThemedText>
      <ThemedText>{record.labels.responseScreen}</ThemedText>
      <ThemedText>{choosePrompt}</ThemedText>
      {record.result.vocabulary.map((group) => (
        <View key={group.area} style={styles.section}>
          <ThemedText type="smallBold">{group.area}</ThemedText>
          <View style={styles.words}>
            {group.words.map((word) => {
              const checked = selected.includes(word);
              return (
                <Pressable
                  key={word}
                  accessibilityRole="checkbox"
                  accessibilityLabel={word}
                  accessibilityState={{ checked, disabled: busy }}
                  aria-checked={checked}
                  disabled={busy}
                  style={[styles.word, checked && styles.wordSelected]}
                  onPress={() =>
                    onChange(
                      WEEK_TWO_PREWRITTEN_WORDS_KEY,
                      toggleWeekTwoWord(answers, word),
                    )}
                >
                  <ThemedText>{`${word}${checked ? " ✓" : ""}`}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {otherPrompts.map((prompt, index) => {
        const key = WEEK_TWO_PREWRITTEN_PROMPT_KEYS[index];
        if (!key) return null;
        return (
          <View key={key} style={styles.section}>
            <ThemedText>{prompt}</ThemedText>
            <TextInput
              accessibilityLabel={prompt}
              accessibilityHint="Optional. Up to 2,000 characters. Your words are saved as entered."
              multiline
              editable={!busy}
              maxLength={2000}
              value={answers[key] ?? ""}
              onChangeText={(value) => onChange(key, value)}
              style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </View>
        );
      })}
      <ThemedText type="small">{record.labels.resultFooter}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  words: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  word: { minHeight: 48, minWidth: 48, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 18, backgroundColor: "#FFFFFF" },
  wordSelected: { borderWidth: 2, borderColor: "#41644a", backgroundColor: "rgba(65, 100, 74, 0.15)" },
  editor: { minHeight: 96, padding: 12, borderRadius: 14 },
});
