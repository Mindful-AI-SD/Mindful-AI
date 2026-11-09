import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { baselineOperationId } from "../../lib/baseline";
import { WEEK_THREE_PRACTICE } from "../../lib/week-three-practice";
import { createWeekThreeScreenFixtureService } from "../../lib/week-three-screen-fixture-service";
import { validResponseFields, validWeekThreeContent, validWeekThreeScreenProgress, type WeekThreeContent, type WeekThreeScreenProgress, type WeekThreeScreenService, type WeekThreeScreenWrite } from "../../lib/week-three-screen";
import type { FourBeats } from "../../lib/four-beat-curriculum";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { FourBeatModuleShell } from "./four-beat-module-shell";
import { PracticeBeat } from "./practice-beat";
import { ReflectionAnswerField } from "./reflection-answer-field";
import { WEEK_THREE_CONTENT_FIXTURE, WEEK_THREE_SLUG_FIXTURE } from "./week-three-explore-notice.fixtures";
import { WeekThreeModule } from "./week-three-module";

type Props = {
  userId: string; activityId: string; onExit: () => void;
  content?: WeekThreeContent; service?: WeekThreeScreenService; slug?: string; showModuleEntry?: boolean;
};
type SaveAttempt = { request: WeekThreeScreenWrite; exit: boolean };

export function WeekThreeExploreNotice(props: Props) {
  // Explicit injected preview ports stay available for old fixture reviews.
  // Normal curriculum navigation uses the handoff and authenticated progress.
  if (!props.content && !props.service) return <WeekThreeModule userId={props.userId} activityId={props.activityId} onExit={props.onExit} showModuleEntry={props.showModuleEntry} />;
  return <WeekThreeSession key={`${props.userId}:${props.activityId}:${props.content?.contentVersion ?? WEEK_THREE_CONTENT_FIXTURE.contentVersion}`} {...props} />;
}

function WeekThreeSession({ userId, activityId, onExit, content = WEEK_THREE_CONTENT_FIXTURE, service, slug = WEEK_THREE_SLUG_FIXTURE, showModuleEntry = false }: Props) {
  const adapter = useMemo(() => service ?? createWeekThreeScreenFixtureService(userId, activityId, content), [service, userId, activityId, content]);
  const [saved, setSaved] = useState<WeekThreeScreenProgress | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [beat, setBeat] = useState<"explore" | "notice">("explore");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [entryOpen, setEntryOpen] = useState(showModuleEntry);
  const [practiceFinished, setPracticeFinished] = useState(false);
  const version = useRef(0);
  const active = useRef(false);
  const pending = useRef<SaveAttempt | null>(null);
  const fields = [...content.explore.fields, ...content.notice.fields];
  const copyReady = validWeekThreeContent(content);

  function apply(progress: WeekThreeScreenProgress) {
    if (!validWeekThreeScreenProgress(progress, content) || progress.activityId !== activityId) throw new Error("Invalid saved progress");
    setSaved(progress); setAnswers({ ...progress.answers });
    // The supplied fixture is paused in Practice. This screen previews its
    // Explore handoff; it does not award or rewrite Practice completion.
    setBeat(progress.currentBeat === "notice" && validResponseFields(content.explore.fields, progress.answers, true) ? "notice" : "explore");
  }
  useEffect(() => {
    const request = ++version.current;
    setLoaded(false); setError(null);
    if (!copyReady) { setError("Week 3 response content is unavailable. Return to the curriculum while the question definitions are supplied."); return; }
    void adapter.loadWeekThreeProgress(slug).then(progress => {
      if (version.current !== request) return;
      if (!progress) throw new Error("Missing practice log");
      apply(progress); pending.current = null; setLoaded(true);
    }).catch(() => { if (version.current === request) setError("Could not load the saved Week 3 tap log and answers. Retry loading; existing progress has not been replaced."); });
    return () => { version.current++; };
  }, [adapter, slug, attempt, copyReady]);

  async function write(operation: SaveAttempt) {
    if (active.current || saved?.status === "completed") return;
    const request = version.current;
    active.current = true; pending.current = operation;
    setBusy(true); setError(null); setMessage(null);
    try {
      await adapter.saveWeekThreeDraft(operation.request);
      const current = await adapter.loadWeekThreeProgress(slug);
      if (version.current !== request) return;
      if (!current) throw new Error("No saved progress");
      apply(current); pending.current = null;
      setMessage("Week 3 answers and step saved on this device.");
      if (operation.exit) onExit();
    } catch {
      if (version.current === request) setError("Could not save Week 3. Your answers are still here. Retry the same save, or explicitly reload saved progress to reconcile a conflict.");
    } finally { active.current = false; if (version.current === request) setBusy(false); }
  }
  function save(nextBeat: "explore" | "notice" = beat, exit = false) {
    if (!saved || active.current || !validResponseFields(fields, answers, false)) return;
    const previous = pending.current;
    if (previous && previous.request.patch.currentBeat === nextBeat && JSON.stringify(previous.request.patch.answers) === JSON.stringify(answers) && previous.exit === exit) { void write(previous); return; }
    void write({ exit, request: { slug, operationId: baselineOperationId(), expectedRevision: saved.revision,
      contentVersion: saved.contentVersion, patch: { answers: { ...answers }, currentBeat: nextBeat } } });
  }

  if (!loaded || !saved) return <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}><View style={styles.content}>
    <AccessibleHeading>Week 3</AccessibleHeading>
    <AccessibleStatus error={!!error}>{error ?? "Loading Week 3 tap log and saved answers…"}</AccessibleStatus>
    {error && copyReady && <Pressable accessibilityRole="button" style={styles.action} onPress={() => setAttempt(value => value + 1)}><ThemedText>Retry loading Week 3</ThemedText></Pressable>}
    <Pressable accessibilityRole="button" style={styles.action} onPress={onExit}><ThemedText>Back to curriculum</ThemedText></Pressable>
  </View></SafeAreaView></ThemedView>;

  if (entryOpen) {
    const beats: FourBeats = [
      { id: "arrive", title: "Arrive", description: "Arrive is outside this Explore/Notice screen fixture." },
      { id: "practice", title: "Practice", description: WEEK_THREE_PRACTICE.instructions },
      { id: "explore", title: "Explore", description: content.explore.instructions },
      { id: "notice", title: "Notice", description: content.notice.instructions },
    ];
    const savedBeatId = !practiceFinished ? "practice" : beat;
    const savedStepLabel = !practiceFinished
      ? "Practice (sponsor recording)"
      : `${beat === "explore" ? "Explore" : "Notice"}${content.source.kind === "fixture" ? " (fixture)" : ""}`;
    return <FourBeatModuleShell title="Week 3" beats={beats} savedBeatId={savedBeatId} savedStepLabel={savedStepLabel}
      onResume={() => setEntryOpen(false)} onExit={onExit} />;
  }

  if (showModuleEntry && !practiceFinished) {
    return <PracticeBeat activityId={activityId} weekNumber={3} config={WEEK_THREE_PRACTICE}
      continueLabel="Continue to Explore" onContinue={() => { setPracticeFinished(true); return false; }} onExit={onExit} />;
  }

  const readOnly = saved.status === "completed";
  const draftValid = validResponseFields(fields, answers, false);
  const requiredValid = validResponseFields(content[beat].fields, answers, true);
  return <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AccessibleHeading>{`Week 3 · ${beat === "explore" ? "Explore" : "Notice"}`}</AccessibleHeading>
        <ThemedText>{`Beat ${beat === "explore" ? 3 : 4} of 4: ${beat === "explore" ? "Explore" : "Notice"}`}</ThemedText>
        <ThemedText>{content.source.kind === "fixture" ? "Fixture path: synthetic tap log and example question wording. Isa's approved responses are not supplied yet. Saves stay on this device for your account; backend Week 3 storage is not connected." : `Content source: ${content.source.reference}`}</ThemedText>
        <ThemedText>No AI request is made by these screens. The recorded events below are not a live AI interpretation.</ThemedText>
        {readOnly && <AccessibleStatus>Previously completed progress is read-only. No completion has been awarded by this screen.</AccessibleStatus>}
        <View style={styles.card}>
          <ThemedText accessibilityRole="header" type="subtitle">Recorded tap log</ThemedText>
          <ThemedText>{`${saved.events.length} recorded event${saved.events.length === 1 ? "" : "s"}`}</ThemedText>
          {saved.events.length === 0 && <ThemedText>No recorded events. No distractions have been inferred.</ThemedText>}
          {saved.events.map((event, index) => <View key={event.id} style={styles.field} accessible
            accessibilityLabel={`Event ${index + 1}. ${event.label}. Recorded at ${event.at}`}>
            <ThemedText type="smallBold">{event.label}</ThemedText><ThemedText>{event.at}</ThemedText>
          </View>)}
          <ThemedText>{`Saved active Practice time: ${Math.floor(saved.resumeState.elapsedActiveMs / 1000)} seconds. This does not establish Practice completion.`}</ThemedText>
          {saved.auditResult != null && <ThemedText>A cached report is stored with this progress. It is not presented as live AI output.</ThemedText>}
        </View>
        <ThemedText>{content[beat].instructions}</ThemedText>
        {content[beat].fields.map(field => <ReflectionAnswerField key={field.key} field={field} value={answers[field.key] ?? ""} busy={busy || readOnly}
          onChange={text => { setAnswers(current => ({ ...current, [field.key]: text })); pending.current = null; setError(null); setMessage("Unsaved answers. Use Save answers before leaving."); }} />)}
        {busy && <AccessibleStatus>Saving Week 3 answers…</AccessibleStatus>}
        {message && <AccessibleStatus>{message}</AccessibleStatus>}
        {error && <View style={styles.field}>
          <AccessibleStatus error>{error}</AccessibleStatus>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => { if (pending.current) void write(pending.current); }}><ThemedText>Retry Week 3 save</ThemedText></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.action} accessibilityHint="Replaces unsaved answers with the last saved step and responses."
            onPress={() => { setMessage(null); setAttempt(value => value + 1); }}><ThemedText>Reload saved Week 3 (replaces unsaved answers)</ThemedText></Pressable>
        </View>}
        {!readOnly && <>
          <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !draftValid} accessibilityState={{ disabled: busy || !draftValid, busy }} onPress={() => save()}><ThemedText>Save answers</ThemedText></Pressable>
          {!requiredValid && <ThemedText>Answer the required fields within their character limits before continuing.</ThemedText>}
          {beat === "explore" ? <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !draftValid || !requiredValid}
            accessibilityState={{ disabled: busy || !draftValid || !requiredValid }} onPress={() => save("notice")}><ThemedText>Continue to Notice</ThemedText></Pressable>
            : <><Pressable accessibilityRole="button" style={styles.action} disabled={busy || !draftValid} onPress={() => save("explore")}><ThemedText>Back to Explore</ThemedText></Pressable>
              <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !draftValid || !requiredValid} accessibilityState={{ disabled: busy || !draftValid || !requiredValid }}
                onPress={() => save("notice")}><ThemedText>Save reflection</ThemedText></Pressable></>}
          <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !draftValid} onPress={() => save(beat, true)}><ThemedText>Save and return to curriculum</ThemedText></Pressable>
        </>}
        {readOnly && <Pressable accessibilityRole="button" style={styles.action} onPress={onExit}><ThemedText>Back to curriculum</ThemedText></Pressable>}
        <ThemedText>Week 3 completion is unavailable until the approved completion rules are connected. Saving a reflection does not complete the week.</ThemedText>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></ThemedView>;
}
const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 22, paddingTop: Platform.OS === "web" ? 72 : 22, paddingBottom: 80, gap: 18, width: "100%", maxWidth: 720, alignSelf: "center" }, field: { gap: 10 }, card: { padding: 20, borderWidth: 1, borderColor: "#b9cbbd", borderRadius: 16, gap: 12 }, action: { minHeight: 48, minWidth: 48, padding: 14, justifyContent: "center" } });
