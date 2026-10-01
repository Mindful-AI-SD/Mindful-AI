import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { AccessibleHeading, AccessibleStatus } from "@/components/accessibility";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { useSignedInUserId } from "@/components/auth-gate";
import { useWritingDraft } from "@/hooks/use-writing-draft";
import { getIntentions, type IntentionResponse } from "../../lib/intention";
import { saveProgressIntentions } from "../../lib/progress";

// Match the existing reflection request schema's trimmed character limits.
const MIN_CHARACTERS = 3;
const MAX_CHARACTERS = 2000;
const INSTRUCTIONS =
  "Pause for a moment and notice what currently has your attention. " +
  "Describe what you noticed and how it affected your thoughts or feelings. " +
  "What would you like to bring more mindful attention to this week?";
const PRIVACY_ACKNOWLEDGEMENT =
  "I understand that submitting sends my writing for AI processing. " +
  "I have left out names and other identifying or sensitive personal information.";

type SubmissionState =
  | { status: "writing" }
  | { status: "loading" }
  | { status: "success"; data: IntentionResponse }
  | { status: "error"; message: string; timedOut: boolean };

export function IntentionMirrorScreen({
  activityId,
  onBack,
  onOpenGap,
  initialIntentions,
  onGenerated,
  onEditWriting,
  continueLabel = "Reflect on the AI gap",
}: {
  activityId: string;
  onBack: () => void;
  onOpenGap: () => void;
  initialIntentions?: IntentionResponse;
  onGenerated?: () => Promise<void>;
  onEditWriting?: () => Promise<boolean>;
  continueLabel?: string;
}) {
  const theme = useTheme();
  const userId = useSignedInUserId();
  const { writing, setWriting, status, retry, flush } = useWritingDraft(
    userId,
    activityId,
  );
  const draftReady = status !== "loading" && status !== "load-error";
  const [acknowledged, setAcknowledged] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>(initialIntentions
    ? { status: "success", data: initialIntentions } : { status: "writing" });
  const activeRequest = useRef<AbortController | null>(null);
  const isSubmitting = submission.status === "loading";

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const reflection = writing.trim();
  const wordCount = reflection ? reflection.split(/\s+/u).length : 0;
  const validLength =
    reflection.length >= MIN_CHARACTERS &&
    reflection.length <= MAX_CHARACTERS;
  const canSubmit = draftReady && acknowledged && validLength && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || activeRequest.current) return;

    const controller = new AbortController();
    activeRequest.current = controller;
    setSubmission({ status: "loading" });

    try {
      if (!(await flush())) throw new Error("Could not save your writing. Please retry before generating intentions.");
      if (activeRequest.current !== controller) return;
      const result = await getIntentions({
        activityId,
        activityContext: `Week 1: Mindful Attention. Intention Mirror. ${INSTRUCTIONS}`,
        userReflection: reflection,
      }, { signal: controller.signal });

      if (activeRequest.current !== controller) return;

      if (result.error) {
        setSubmission({
          status: "error",
          message: result.error.message,
          timedOut: result.error.code === "TIMEOUT",
        });
      } else {
        await saveProgressIntentions(userId, activityId, result.data.intentions);
        if (activeRequest.current !== controller) return;
        await onGenerated?.();
        if (activeRequest.current !== controller) return;
        setSubmission({ status: "success", data: result.data });
      }
    } catch (error) {
      if (activeRequest.current === controller) {
        setSubmission({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to submit your writing. Please try again.",
          timedOut: false,
        });
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Saves your writing before returning to the Week 1 activities."
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={() => {
                if (!draftReady) onBack();
                else void flush().then((saved) => {
                  if (saved) onBack();
                });
              }}
              style={styles.backButton}
            >
              <ThemedText>Back to Week 1</ThemedText>
            </Pressable>

            <View style={styles.section}>
              <ThemedText type="smallBold">WEEK 1 · MINDFUL ATTENTION</ThemedText>
              <AccessibleHeading focus={submission.status === "writing"} focusKey={submission.status}>Intention Mirror</AccessibleHeading>
              {submission.status === "writing" && <ThemedText>{INSTRUCTIONS}</ThemedText>}
            </View>

            <View style={styles.section}>
              <AccessibleStatus error={status === "load-error" || status === "save-error"}>
                {status === "loading" ? "Loading saved writing…" :
                  status === "unsaved" ? "Unsaved changes" :
                  status === "saving" ? "Saving…" :
                  status === "saved" ? "Saved" :
                  status === "load-error" ? "Could not load your saved writing. Use Retry loading before editing." :
                  "Could not save your writing. Your changes are still in this editor. Use Retry save."}
              </AccessibleStatus>
              {(status === "load-error" || status === "save-error") && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={status === "load-error" ? "Loads your saved writing again." : "Saves your current writing again."}
                  onPress={() => void retry()}
                  style={styles.backButton}
                >
                  <ThemedText>{status === "load-error" ? "Retry loading" : "Retry save"}</ThemedText>
                </Pressable>
              )}
            </View>

            {submission.status === "writing" && (
              <>
                <View style={styles.section}>
                  <ThemedText type="smallBold">Your writing</ThemedText>
                  <ThemedText>
                    Write {MIN_CHARACTERS}–2,000 characters. Only share what you feel
                    comfortable sending for AI processing.
                  </ThemedText>
                  <TextInput
                    accessibilityLabel="Your writing"
                    accessibilityHint="Multiline field. Write between 3 and 2,000 characters. Your writing saves automatically."
                    accessibilityState={{ disabled: !draftReady || isSubmitting }}
                    multiline
                    textAlignVertical="top"
                    editable={draftReady && !isSubmitting}
                    value={writing}
                    onChangeText={(text) => {
                      setWriting(text);
                    }}
                    placeholder="Take a moment to reflect…"
                    placeholderTextColor={theme.textSecondary}
                    style={[
                      styles.editor,
                      { color: theme.text, backgroundColor: theme.backgroundElement },
                    ]}
                  />
                  <ThemedText accessibilityLabel={`${wordCount} words. ${reflection.length} of ${MAX_CHARACTERS} characters.`} type="small">
                    {wordCount} {wordCount === 1 ? "word" : "words"} · {reflection.length}
                    /{MAX_CHARACTERS} characters
                  </ThemedText>
                  <ThemedText type="small">
                    Your writing is saved to your account as you type.
                  </ThemedText>
                  {writing.length > 0 && !validLength && (
                    <AccessibleStatus error>
                      {reflection.length < MIN_CHARACTERS
                        ? "Enter at least 3 characters, excluding surrounding spaces."
                        : "Shorten your writing to 2,000 characters or fewer."}
                    </AccessibleStatus>
                  )}
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={PRIVACY_ACKNOWLEDGEMENT}
                  accessibilityHint="Required before submission. Activate to check or uncheck."
                  accessibilityState={{ checked: acknowledged, disabled: isSubmitting }}
                  disabled={isSubmitting}
                  onPress={() => setAcknowledged((value) => !value)}
                  style={styles.acknowledgement}
                >
                  <ThemedText style={styles.checkbox} accessible={false} aria-hidden>
                    {acknowledged ? "☑" : "☐"}
                  </ThemedText>
                  <ThemedText style={styles.acknowledgementText}>
                    {PRIVACY_ACKNOWLEDGEMENT}
                  </ThemedText>
                </Pressable>

                {!canSubmit && (
                  <ThemedText>To submit, enter 3–2,000 characters and check the privacy acknowledgement.</ThemedText>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Submit writing"
                  accessibilityHint="Creates three mock intentions from the API service."
                  accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
                  disabled={!canSubmit}
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [
                    styles.submitButton,
                    !canSubmit && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText style={styles.submitText}>
                    {isSubmitting ? "Submitting…" : "Submit"}
                  </ThemedText>
                </Pressable>
              </>
            )}

            {isSubmitting && (
              <View style={styles.section} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
                <ActivityIndicator color="#41644a" size="large" accessible={false} />
                <AccessibleHeading>Preparing your intentions…</AccessibleHeading>
                <ThemedText type="small">Your writing is still here. This may take a moment.</ThemedText>
              </View>
            )}

            {submission.status === "error" && (
              <View style={styles.section}>
                <AccessibleHeading>
                  {submission.timedOut ? "Request timed out" : "Unable to load intentions"}
                </AccessibleHeading>
                <AccessibleStatus error>{submission.message}</AccessibleStatus>
                <ThemedText>Your writing has been kept intact.</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading intentions"
                  accessibilityHint="Tries again using the same writing."
                  disabled={!canSubmit}
                  accessibilityState={{ disabled: !canSubmit }}
                  onPress={() => void handleSubmit()}
                  style={[styles.submitButton, !canSubmit && styles.disabled]}
                >
                  <ThemedText style={styles.submitText}>Retry</ThemedText>
                </Pressable>
              </View>
            )}

            {submission.status === "success" && (
              <View style={styles.section} accessibilityLiveRegion="polite">
                <AccessibleHeading>Mock intentions</AccessibleHeading>
                {submission.data.intentions.map((intention, index) => (
                  <ThemedView key={index} style={styles.intentionCard} accessible
                    accessibilityLabel={`Intention ${index + 1} of 3. ${intention.title}. ${intention.explanation}`}>
                    <ThemedText type="smallBold">{intention.title}</ThemedText>
                    <ThemedText>{intention.explanation}</ThemedText>
                  </ThemedView>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="Saves your writing and opens the next Week 1 activity."
                  onPress={() => void flush().then((saved) => {
                    if (saved) onOpenGap();
                  })}
                  style={styles.submitButton}
                >
                  <ThemedText style={styles.submitText}>{continueLabel}</ThemedText>
                </Pressable>
              </View>
            )}

            {(submission.status === "error" || submission.status === "success") && (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Returns to your writing without changing it."
                onPress={() => {
                  if (onEditWriting) void onEditWriting().then(saved => {
                    if (saved) setSubmission({ status: "writing" });
                  });
                  else setSubmission({ status: "writing" });
                }}
                style={styles.backButton}
              >
                <ThemedText>Back to writing</ThemedText>
              </Pressable>
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
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: 24,
    padding: 24,
    paddingTop: Platform.OS === "web" ? 80 : 24,
    paddingBottom: 48,
  },
  section: { gap: 12 },
  intentionCard: {
    gap: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: "#b9cbbd",
    borderRadius: 12,
  },
  backButton: { minHeight: 48, minWidth: 48, justifyContent: "center", alignSelf: "flex-start" },
  editor: {
    minHeight: 240,
    padding: 16,
    borderWidth: 1,
    borderColor: "#b9cbbd",
    borderRadius: 12,
    fontSize: 16,
    lineHeight: 24,
  },
  acknowledgement: { minHeight: 48, minWidth: 48, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: { fontSize: 24, lineHeight: 28 },
  acknowledgementText: { flex: 1 },
  submitButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#41644a",
  },
  submitText: { color: "#ffffff", fontWeight: "700" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
