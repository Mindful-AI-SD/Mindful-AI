import { StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import type { ResponseField } from "../../lib/week-three-screen";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";

export function ReflectionAnswerField({ field, value, busy, onChange }: {
  field: ResponseField; value: string; busy: boolean; onChange: (text: string) => void;
}) {
  const theme = useTheme();
  const count = Array.from(value).length;
  return <View style={styles.field}>
    <ThemedText>{field.label}{field.required ? " (required)" : " (optional)"}</ThemedText>
    <TextInput accessibilityLabel={field.label}
      accessibilityHint={`${field.required ? "Required" : "Optional"}. Up to ${field.maxCharacters} characters. Use Save answers to keep a draft.`}
      accessibilityState={{ disabled: busy }} editable={!busy} multiline textAlignVertical="top"
      style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      value={value} onChangeText={onChange} />
    <ThemedText>{`${count} / ${field.maxCharacters} characters`}</ThemedText>
    {count > field.maxCharacters && <AccessibleStatus error>{`${field.label} exceeds its character limit. Your input is still here.`}</AccessibleStatus>}
  </View>;
}
const styles = StyleSheet.create({ field: { gap: 10 }, editor: { minHeight: 120, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#84988a", fontSize: 16, lineHeight: 24 } });
