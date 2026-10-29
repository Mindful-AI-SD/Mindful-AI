import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import type { BaselineDefinitionInput, BaselineRecordInput, WeekAccessInput } from "./guiding-questions-preview.fixtures";
import { validBaselineAnswers } from "../../lib/baseline";

export type BaselinePersistenceInput = {
  busy: boolean;
  error: string | null;
  message: string | null;
  onSave: (answers: Record<string, string>) => void;
  onSubmit: (answers: Record<string, string>) => void;
  onRetry: () => void;
  onReload: () => void;
  onDirty: () => void;
};

export type GuidingQuestionsScreenInput = {
  definition: BaselineDefinitionInput | null;
  record: BaselineRecordInput | null;
  weeks: readonly WeekAccessInput[];
  onBack: () => void;
  persistence?: BaselinePersistenceInput;
};

export function GuidingQuestionsPreview(props: GuidingQuestionsScreenInput) {
  // A different pinned definition/record must not inherit another draft's state.
  return <QuestionFields key={JSON.stringify([props.definition, props.record])} {...props} />;
}

function QuestionFields({ definition, record, weeks, onBack, persistence }: GuidingQuestionsScreenInput) {
  const theme = useTheme();
  const [answers, setAnswers] = useState<Record<string, string>>({ ...record?.answers });
  const [reviewed, setReviewed] = useState(false);
  const matches = !record || (record.definitionId === definition?.definitionId && record.definitionVersion === definition?.definitionVersion);
  const validDefinition = definition && definition.questions.length === 5 &&
    new Set(definition.questions.map(q => q.questionId)).size === 5 &&
    definition.questions.every(q => q.questionId.trim() && q.prompt.trim() && Number.isInteger(q.maxCharacters) && q.maxCharacters > 0 && q.maxCharacters <= 20000);
  const available = !!validDefinition && matches;
  const submitted = record?.status === "submitted";
  const editable = available && definition?.isPublished && !submitted && !persistence?.busy;
  const draftValid = !!definition && available && validBaselineAnswers(definition, answers, false);
  const complete = available && definition.questions.every(question => {
    const value = answers[question.questionId] ?? "";
    return !!value.trim() && Array.from(value).length <= question.maxCharacters;
  });

  return <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" style={styles.action} disabled={persistence?.busy} onPress={onBack}><ThemedText>Back to curriculum</ThemedText></Pressable>
      <AccessibleHeading>Guiding Questions</AccessibleHeading>
      <ThemedText>{persistence ? "Week 1 · Saved baseline fixture" : "Week 1 · Fixture preview"}</ThemedText>
      <ThemedText>{persistence ? "Example question wording. Saved answers stay on this device for your signed-in account; backend storage is not connected. Save your draft before leaving. Submission freezes the original fixture baseline." : "Example questions and answers only. Changes stay in this preview and are not saved. Existing Week 1/2 access is unchanged."}</ThemedText>
      {persistence?.busy && <AccessibleStatus>Saving baseline…</AccessibleStatus>}
      {!!persistence?.error && <View style={styles.field}>
        <AccessibleStatus error>{persistence.error}</AccessibleStatus>
        <ThemedText>Your input is still on this screen.</ThemedText>
        <Pressable accessibilityRole="button" style={styles.action} disabled={persistence.busy} onPress={persistence.onRetry}><ThemedText>Retry baseline save</ThemedText></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} disabled={persistence.busy}
          accessibilityHint="Replaces unsaved answers with the last saved draft or submitted original."
          onPress={persistence.onReload}><ThemedText>Reload saved baseline (replaces unsaved answers)</ThemedText></Pressable>
      </View>}
      {!!persistence?.message && <AccessibleStatus>{persistence.message}</AccessibleStatus>}
      {!available ? <AccessibleStatus error>The five-question definition is missing or does not match this record. Return to the curriculum and reopen the preview.</AccessibleStatus> : <>
        <ThemedText>{`Question set: ${definition.definitionId} · Version ${definition.definitionVersion}`}</ThemedText>
        {submitted && <AccessibleStatus>Original submitted answers. These answers are read-only.</AccessibleStatus>}
        {!definition.isPublished && !submitted && <AccessibleStatus>This question set is retired. Saved answers remain visible, but editing is unavailable.</AccessibleStatus>}
        {definition.questions.map((question, index) => {
          const value = answers[question.questionId] ?? "";
          const count = Array.from(value).length;
          return <View style={styles.field} key={question.questionId}>
            <ThemedText type="smallBold">{`Question ${index + 1}`}</ThemedText>
            <ThemedText>{question.prompt}</ThemedText>
            <TextInput multiline textAlignVertical="top" editable={!!editable}
              accessibilityLabel={`Guiding Question ${index + 1}: ${question.prompt}`}
              accessibilityHint={`Required. Maximum ${question.maxCharacters} characters. No minimum word count.`}
              accessibilityState={{ disabled: !editable }} value={value}
              style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              onChangeText={text => { setAnswers(current => ({ ...current, [question.questionId]: text })); setReviewed(false); persistence?.onDirty(); }} />
            <ThemedText>{`${count} / ${question.maxCharacters} characters`}</ThemedText>
            {count > question.maxCharacters && <AccessibleStatus error>{`Question ${index + 1} exceeds its character limit.`}</AccessibleStatus>}
          </View>;
        })}
        {!submitted && <>
          {!complete && <ThemedText>Answer all five questions within their character limits to continue. The separate 150-word Intention Mirror rule does not apply here.</ThemedText>}
          {persistence ? <>
            <Pressable accessibilityRole="button" style={styles.action} disabled={!editable || !draftValid}
              accessibilityState={{ disabled: !editable || !draftValid, busy: persistence.busy }} onPress={() => persistence.onSave(answers)}>
              <ThemedText>Save baseline draft</ThemedText>
            </Pressable>
            <ThemedText>Submit only when finished. The original submitted answers cannot be replaced.</ThemedText>
            <Pressable accessibilityRole="button" style={styles.action} disabled={!editable || !complete}
              accessibilityHint="Submits all five answers and makes the original read-only."
              accessibilityState={{ disabled: !editable || !complete, busy: persistence.busy }} onPress={() => persistence.onSubmit(answers)}>
              <ThemedText>Submit original baseline</ThemedText>
            </Pressable>
          </> : <><Pressable accessibilityRole="button" style={styles.action} disabled={!editable || !complete}
            accessibilityState={{ disabled: !editable || !complete }} onPress={() => setReviewed(true)}>
            <ThemedText>Review five answers</ThemedText>
          </Pressable>
          {reviewed && <AccessibleStatus>All five answers are ready in this preview. Nothing has been submitted or saved, and no week has been unlocked.</AccessibleStatus>}</>}
        </>}
      </>}
      <ThemedText accessibilityRole="header" type="subtitle">Week access preview</ThemedText>
      <ThemedText>These are supplied fixture states, not approved prerequisite rules or server access checks.</ThemedText>
      {weeks.map(week => <View style={styles.field} key={week.weekNumber}>
        <ThemedText accessibilityRole="header" type="smallBold">{`Week ${week.weekNumber}: ${week.locked ? "Locked" : "Available"}`}</ThemedText>
        {week.prerequisiteMessages.map(message => <ThemedText key={message}>{message}</ThemedText>)}
        {week.locked && week.prerequisiteMessages.length === 0 && <ThemedText>Prerequisite details are not available yet.</ThemedText>}
        <Pressable accessibilityRole="button" style={styles.action}
          accessibilityLabel={`Return to curriculum for Week ${week.weekNumber}`}
          accessibilityState={{ disabled: week.locked || !!persistence?.busy }} disabled={week.locked || persistence?.busy} onPress={onBack}>
          <ThemedText>{week.locked ? `Week ${week.weekNumber} locked` : "Return to curriculum"}</ThemedText>
        </Pressable>
      </View>)}
    </ScrollView>
  </SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 72, paddingBottom: 80, gap: 20, maxWidth: 720, width: "100%", alignSelf: "center" },
  field: { gap: 10, paddingVertical: 12 },
  editor: { minHeight: 120, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#84988a", fontSize: 16, lineHeight: 24 },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" },
});
