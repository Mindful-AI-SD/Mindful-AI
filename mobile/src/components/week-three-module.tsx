import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";
import { baselineOperationId } from "../../lib/baseline";
import { WEEK_THREE_PRACTICE } from "../../lib/week-three-practice";
import { auditComplete, auditFingerprint, canComplete, canSummarize, CATEGORIES, changeEntries, counts, emptyEntryDraft, ETHICS_COPY, hasSummary, NON_AI_VERSION, NOTICE_PROMPT, PREWRITTEN_DISCLOSURE, rawAuditFingerprint, type AuditEntry, type AuditMode, type WeekThreeModule as Data } from "../../lib/week-three-module";
import { createWeekThreeModuleService, WeekThreeRequestError, type ModuleSnapshot, type WeekThreeModuleService } from "../../lib/week-three-module-service";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { FourBeatModuleShell } from "./four-beat-module-shell";
import { PracticeBeat } from "./practice-beat";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

type Props = { userId: string; activityId: string; onExit: () => void; service?: WeekThreeModuleService; showModuleEntry?: boolean };
export function WeekThreeModule(props: Props) { return <Session key={`${props.userId}:${props.activityId}`} {...props} />; }
function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={styles.action} onPress={onPress}><ThemedText>{label}</ThemedText></Pressable>;
}
function Field({ label, value, onChange, disabled, limit = 2000 }: { label: string; value: string; onChange: (text: string) => void; disabled: boolean; limit?: number }) {
  const theme = useTheme();
  return <View style={styles.section}><ThemedText>{label}</ThemedText><TextInput accessibilityLabel={label} accessibilityHint={`Your words are saved as entered. Up to ${limit} characters.`}
    accessibilityState={{ disabled }} multiline editable={!disabled} textAlignVertical="top" value={value} onChangeText={onChange}
    style={[styles.editor, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
    <ThemedText>{`${value.length} / ${limit} characters`}</ThemedText>{value.length > limit && <AccessibleStatus error>{`${label} is too long. Your input has not been cleared.`}</AccessibleStatus>}</View>;
}

function Session({ userId, activityId, onExit, service, showModuleEntry = false }: Props) {
  const adapter = useMemo(() => service ?? createWeekThreeModuleService(userId, activityId), [userId, activityId, service]);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null), [aiError, setAiError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0), [entryOpen, setEntryOpen] = useState(showModuleEntry);
  const [legacy, setLegacy] = useState<Record<string, string> | null>(null), [showLegacy, setShowLegacy] = useState(false);
  const snapshot = useRef<ModuleSnapshot | null>(null), active = useRef(false), alive = useRef(true), request = useRef<AbortController | null>(null);
  const pending = useRef<{ value: Data; id: string; exit: boolean } | null>(null);
  const latest = useRef(data); latest.current = data;
  useEffect(() => {
    alive.current = true; let cancelled = false; setLoading(true); setError(null);
    void adapter.load().then(saved => { if (!cancelled) { snapshot.current = saved; setData(saved.data); setDirty(false); setLoading(false); } })
      .catch(() => { if (!cancelled) setError("Could not load saved Week 3. Retry loading; your existing work has not been replaced."); });
    void adapter.legacyPreview().then(value => { if (!cancelled) setLegacy(value); }).catch(() => undefined);
    return () => { cancelled = true; alive.current = false; request.current?.abort(); };
  }, [adapter, attempt]);

  function edit(next: Data) { if (active.current || data?.completed_at) return; setData(next); setDirty(true); pending.current = null; setError(null); setAiError(null); setMessage(null); }
  async function persist(value: Data, exit = false, operationId = baselineOperationId()) {
    if (active.current || !snapshot.current || !alive.current) return false;
    active.current = true; setBusy(true); setError(null); setMessage(null);
    // Completion is displayed only after the progress service acknowledges it.
    if (value.step !== "completed") setData(value);
    pending.current = { value, id: operationId, exit };
    try {
      const saved = await adapter.save(value, snapshot.current, operationId);
      if (!alive.current) return false;
      snapshot.current = saved; setData(saved.data); setDirty(false); pending.current = null; setMessage("Week 3 saved.");
      if (exit) onExit();
      return true;
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Could not save Week 3. Your input is still here. Retry saving."); return false; }
    finally { active.current = false; if (alive.current) setBusy(false); }
  }
  // Debounce ordinary answer/draft edits; deliberate transitions flush immediately.
  useEffect(() => {
    if (!data || !dirty || busy || error) return;
    const timer = setTimeout(() => { if (latest.current) void persist(latest.current); }, 900);
    return () => clearTimeout(timer);
  }, [data, dirty, busy, error]);

  async function selectMode(mode: AuditMode) {
    if (!data || active.current) return;
    if (mode === "live_ai") {
      active.current = true; setBusy(true); setAiError(null);
      try { if (!await adapter.available()) throw new Error(); }
      catch { if (alive.current) setAiError("The selected mode is unavailable. Choose the prewritten version or try again."); return; }
      finally { active.current = false; if (alive.current) setBusy(false); }
      if (!alive.current) return;
    }
    setAiError(null);
    await persist({ ...data, mode, summary: null, ai_request_id: null, ethics_card_seen_at: null, sit_elapsed_ms: 0, two_minute_sit_completed_at: null });
  }
  async function categorize() {
    if (!data || active.current || !auditComplete(data) || data.mode !== "live_ai") return;
    // Persist both raw entries and a stable operation ID before the model request.
    const id = data.ai_request_id ?? baselineOperationId();
    const saved = { ...data, ai_request_id: id };
    if (!await persist(saved)) return;
    active.current = true; setBusy(true); setAiError(null);
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 16000);
    let next: Data | null = null;
    try {
      const result = await adapter.categorize(saved, id, controller.signal);
      if (!alive.current) return;
      next = { ...saved, entries: saved.entries.map((entry, index) => ({ ...entry, ai_category: result.assignments[index].category, ai_confirmed: false })), ai_request_id: null, ai_proposal_digest: rawAuditFingerprint(saved), summary: null };
    } catch (cause) {
      if (alive.current) {
        setAiError(cause instanceof WeekThreeRequestError ? cause.message : "Live AI timed out or could not respond. Your entries remain saved. Retry or choose the prewritten version.");
        if (cause instanceof WeekThreeRequestError && cause.definitive) next = { ...saved, ai_request_id: null };
      }
    } finally { clearTimeout(timer); request.current = null; active.current = false; if (alive.current) setBusy(false); }
    if (next && alive.current) await persist(next);
  }

  if (loading || !data) return <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}><View style={styles.content}>
    <AccessibleHeading>Week 3</AccessibleHeading><AccessibleStatus error={!!error}>{error ?? "Loading saved Week 3…"}</AccessibleStatus>
    {error && <Action label="Retry loading Week 3" onPress={() => setAttempt(value => value + 1)} />}
    <Action label="Back to curriculum" onPress={onExit} />
  </View></SafeAreaView></ThemedView>;
  const completed = data.step === "completed", disabled = busy || completed;
  const beat = ["summary", "ethics"].includes(data.step) ? "explore" : data.step === "completed" ? "notice" : data.step as "arrive" | "practice" | "explore" | "notice";
  if (entryOpen) return <FourBeatModuleShell title="Week 3" savedBeatId={beat} savedStepLabel={completed ? "Week 3 complete" : data.step === "notice" ? "Notice the gap" : `${data.step[0].toUpperCase()}${data.step.slice(1)}`}
    beats={[
      { id: "arrive", title: "Arrive", description: "How scattered or focused do you feel right now?" },
      { id: "practice", title: "Practice", description: WEEK_THREE_PRACTICE.instructions },
      { id: "explore", title: "Explore", description: "Three-day Distraction Audit, category summary and attention ethics." },
      { id: "notice", title: "Notice", description: NOTICE_PROMPT },
    ]} onResume={() => setEntryOpen(false)} onExit={onExit} />;

  const draft = data.entry_draft;
  const minutesValid = draft.minutes === "" || /^\d+$/.test(draft.minutes) && Number(draft.minutes) <= 1440;
  const draftValid = !!draft.topic.trim() && draft.topic.length <= 2000 && draft.app.length <= 200 && minutesValid && (draft.source !== "daily_technology" || !!draft.app.trim());
  const hasDraft = !!(draft.id || draft.topic || draft.app || draft.minutes);
  function draftEdit(patch: Partial<typeof draft>) { edit({ ...data!, entry_draft: { ...draft, ...patch } }); }
  function addEntry() {
    if (!draftValid || !data) return;
    const previous = data.entries.find(entry => entry.id === draft.id);
    const entry: AuditEntry = { id: previous?.id ?? baselineOperationId(), audit_day: previous?.audit_day ?? data.current_audit_day, source: draft.source,
      topic_trigger: draft.topic, app_content_type: draft.app, duration_minutes: draft.minutes === "" ? null : Number(draft.minutes), occurred_at: previous?.occurred_at ?? new Date().toISOString(),
      student_category: previous?.student_category ?? null, ai_category: null, ai_confirmed: false };
    const entries = previous ? data.entries.map(value => value.id === entry.id ? entry : value) : [...data.entries, entry];
    const next = changeEntries(data, entries);
    void persist({ ...next, entry_draft: emptyEntryDraft(), days: next.days.map(day => day.day === entry.audit_day ? { ...day, no_distraction_noticed: false, day_complete: false } : day) });
  }
  function closeDay(noDistractions = false) {
    const day = data!.current_audit_day;
    void persist({ ...data!, days: data!.days.map(item => item.day === day ? { ...item, day_complete: true, no_distraction_noticed: noDistractions } : item), current_audit_day: Math.min(3, day + 1) as 1 | 2 | 3 });
  }

  return <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AccessibleHeading>{completed ? "Week 3 complete" : `Week 3 · ${data.step === "notice" ? "Notice the gap" : data.step[0].toUpperCase() + data.step.slice(1)}`}</AccessibleHeading>
      <ThemedText>Content: Isa’s Week 3 completion handoff (November 2) and prewritten pack version 1.0 (November 4). Category options and the one-event/no-distraction day rule are team implementation rules pending sponsor confirmation.</ThemedText>
      {busy && <AccessibleStatus>Saving or checking Week 3…</AccessibleStatus>}{dirty && !busy && <AccessibleStatus>Unsaved changes. Saving shortly…</AccessibleStatus>}
      {message && <AccessibleStatus>{message}</AccessibleStatus>}
      {error && <View style={styles.section}><AccessibleStatus error>{error}</AccessibleStatus>
        <Action label="Retry Week 3 save" disabled={busy} onPress={() => { const retry = pending.current; if (retry) void persist(retry.value, retry.exit, retry.id); }} />
        <Action label="Reload saved Week 3 (replaces unsaved answers)" disabled={busy} onPress={() => { setDirty(false); pending.current = null; setAttempt(value => value + 1); }} /></View>}

      {data.step === "arrive" && <>
        <ThemedText>How scattered or focused do you feel right now?</ThemedText><ThemedText>1 = scattered; 5 = focused. Choose one value.</ThemedText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Scattered to focused rating" style={styles.row}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Focus rating ${value}`} aria-checked={data.arrival_focus === value} accessibilityState={{ checked: data.arrival_focus === value, disabled }} disabled={disabled} style={styles.action} onPress={() => edit({ ...data, arrival_focus: value })}><ThemedText>{`${value}${data.arrival_focus === value ? " · selected" : ""}`}</ThemedText></Pressable>)}</View>
        <Action label="Continue to Practice" disabled={disabled || data.arrival_focus === null} onPress={() => void persist({ ...data, step: "practice", practice_started_at: data.practice_started_at ?? new Date().toISOString() })} />
      </>}
      {data.step === "practice" && <>
        <ThemedText>When attention wanders, notice it without judgment and label it planning, memory, worry, or other. Labels are optional.</ThemedText>
        <View style={styles.row}>{["planning", "memory", "worry", "other"].map(label => <Action key={label} label={`Record practice label: ${label}`} disabled={disabled || data.practice_labels.length >= 300} onPress={() => edit({ ...data, practice_labels: [...data.practice_labels, label] })} />)}</View>
        <PracticeBeat activityId={activityId} weekNumber={3} config={WEEK_THREE_PRACTICE} embedded isSaving={busy}
          onContinue={() => persist({ ...data, step: "explore", practice_completed_at: new Date().toISOString(), audit_start_date: data.audit_start_date ?? new Date().toISOString() })}
          onExit={() => void persist(data, true)} continueLabel="Continue to three-day audit" />
        <Action label="Back to Arrive" disabled={busy} onPress={() => void persist({ ...data, step: "arrive" })} />
      </>}
      {data.step === "explore" && <>
        <ThemedText>For three days, log where your mind wanders during practice and what apps or content pull your attention during the day.</ThemedText>
        <ThemedText>{`Audit started: ${data.audit_start_date}`}</ThemedText>
        <View style={styles.row}>{data.days.map((day, index) => <Action key={day.day} label={`Day ${day.day}${day.day_complete ? " · complete" : " · not complete"}${data.current_audit_day === day.day ? " · selected" : ""}`} disabled={busy || hasDraft || index > 0 && !data.days[index - 1].day_complete} onPress={() => void persist({ ...data, current_audit_day: day.day })} />)}</View>
        <ThemedText>{`Day ${data.current_audit_day}: What pulled your attention?`}</ThemedText>
        <View style={styles.row}>{(["practice", "daily_technology"] as const).map(source => <Action key={source} label={`${source === "practice" ? "During practice" : "Apps or content"}${draft.source === source ? " · selected" : ""}`} disabled={disabled} onPress={() => draftEdit({ source })} />)}</View>
        <Field label="Topic or trigger" value={draft.topic} disabled={disabled} onChange={topic => draftEdit({ topic })} />
        <Field label="App or content type (required for daily technology)" value={draft.app} disabled={disabled} limit={200} onChange={app => draftEdit({ app })} />
        <Field label="Time spent in minutes (optional)" value={draft.minutes} disabled={disabled} limit={4} onChange={minutes => draftEdit({ minutes })} />
        {!minutesValid && <AccessibleStatus error>Enter a whole number from 0 to 1440 minutes, or leave it blank when unknown.</AccessibleStatus>}
        <Action label={draft.id ? "Save entry changes" : "Save audit entry"} disabled={disabled || !draftValid || data.entries.length >= 300 && !draft.id} onPress={addEntry} />
        {draft.id && <Action label="Cancel entry edit" disabled={disabled} onPress={() => edit({ ...data, entry_draft: emptyEntryDraft() })} />}
        {data.entries.filter(entry => entry.audit_day === data.current_audit_day).map(entry => <View key={entry.id} style={styles.card}>
          <ThemedText>{entry.topic_trigger}</ThemedText><ThemedText>{`${entry.source} · ${entry.occurred_at}`}</ThemedText>
          {!!entry.app_content_type && <ThemedText>{entry.app_content_type}</ThemedText>}<ThemedText>{entry.duration_minutes === null ? "Time unknown" : `${entry.duration_minutes} minutes`}</ThemedText>
          <Action label={`Edit entry: ${entry.topic_trigger}`} disabled={disabled} onPress={() => edit({ ...data, entry_draft: { id: entry.id, source: entry.source, topic: entry.topic_trigger, app: entry.app_content_type, minutes: entry.duration_minutes === null ? "" : String(entry.duration_minutes) } })} />
          <Action label={`Delete entry: ${entry.topic_trigger}`} disabled={disabled || hasDraft} onPress={() => {
            const next = changeEntries(data, data.entries.filter(value => value.id !== entry.id));
            void persist({ ...next, days: next.days.map(day => day.day === entry.audit_day ? { ...day, day_complete: false, no_distraction_noticed: false } : day) });
          }} />
        </View>)}
        <Action label={`Complete Day ${data.current_audit_day}`} disabled={disabled || hasDraft || !data.entries.some(entry => entry.audit_day === data.current_audit_day)} onPress={() => closeDay()} />
        <Action label={`No distraction noticed on Day ${data.current_audit_day}`} disabled={disabled || hasDraft || data.entries.some(entry => entry.audit_day === data.current_audit_day)} onPress={() => closeDay(true)} />
        <ThemedText>Each day needs a saved entry or an explicit No distraction noticed confirmation. The summary needs three distinct completed day records.</ThemedText>
        <ThemedText accessibilityRole="header" type="subtitle">Choose a comparison mode</ThemedText>
        <Action label={`Use prewritten version${data.mode === "prewritten" ? " · selected" : ""}`} disabled={disabled} onPress={() => void selectMode("prewritten")} />
        <Action label={`Use live AI${data.mode === "live_ai" ? " · selected" : ""}`} disabled={disabled} onPress={() => void selectMode("live_ai")} />
        {data.mode === "prewritten" && <><ThemedText>{PREWRITTEN_DISCLOSURE}</ThemedText><ThemedText>Your words are saved as entered. This activity does not interpret your writing.</ThemedText></>}
        {data.mode === "live_ai" && <><ThemedText>Live AI proposes one category per entry. Only the entry topic and relevant app/content type are sent. Review and confirm or change every proposal; percentages come from your confirmed categories.</ThemedText>
          <Action label={aiError ? "Retry AI categorization" : data.ai_request_id ? "Retry categorization request" : "Request AI category proposals"} disabled={disabled || !auditComplete(data) || !data.entries.length} onPress={() => void categorize()} /></>}
        {aiError && <AccessibleStatus error>{aiError}</AccessibleStatus>}
        {!!data.mode && data.entries.map(entry => <View key={entry.id} style={styles.card}>
          <ThemedText>{`Day ${entry.audit_day}: ${entry.topic_trigger}`}</ThemedText>
          {data.mode === "live_ai" && entry.ai_category && <ThemedText>{`AI proposal: ${CATEGORIES.find(category => category.key === entry.ai_category)?.name}. ${entry.ai_confirmed ? "Confirmed by you." : "Review or change, then confirm."}`}</ThemedText>}
          <View accessibilityRole="radiogroup" accessibilityLabel={`Category for ${entry.topic_trigger}`} style={styles.row}>{CATEGORIES.map(category => {
            const selected = (data.mode === "prewritten" ? entry.student_category : entry.ai_category) === category.key;
            const categoryDisabled = disabled || data.mode === "live_ai" && data.ai_proposal_digest !== rawAuditFingerprint(data);
            return <Pressable key={category.key} accessibilityRole="radio" accessibilityLabel={`${category.name} for ${entry.topic_trigger}`} aria-checked={selected} accessibilityHint={category.definition} accessibilityState={{ checked: selected, disabled: categoryDisabled }} disabled={categoryDisabled} style={styles.action} onPress={() => edit({ ...data, summary: null, entries: data.entries.map(value => value.id !== entry.id ? value : data.mode === "prewritten" ? { ...value, student_category: category.key } : { ...value, ai_category: category.key, ai_confirmed: false }) })}><ThemedText>{`${category.name}${selected ? " · selected" : ""}`}</ThemedText></Pressable>;
          })}</View>
          {data.mode === "live_ai" && <Action label={`Confirm category for ${entry.topic_trigger}`} disabled={disabled || !entry.ai_category || entry.ai_confirmed} onPress={() => edit({ ...data, entries: data.entries.map(value => value.id === entry.id ? { ...value, ai_confirmed: true } : value) })} />}
        </View>)}
        <Action label="Review category summary" disabled={disabled || hasDraft || !canSummarize(data)} onPress={() => void persist({ ...data, step: "summary", summary: { mode: data.mode!, fingerprint: auditFingerprint(data), generated_at: new Date().toISOString(), content_version: NON_AI_VERSION } })} />
        <Action label="Back to Practice" disabled={busy} onPress={() => void persist({ ...data, step: "practice" })} />
      </>}
      {["summary", "ethics", "notice", "completed"].includes(data.step) && hasSummary(data) && <View style={styles.card}>
        <ThemedText accessibilityRole="header" type="subtitle">Distraction category summary</ThemedText>
        <ThemedText>Percentages use confirmed entry counts, not time spent. Rounded values may total 100.1%.</ThemedText>
        {counts(data).map(row => <ThemedText key={row.category}>{`${CATEGORIES.find(category => category.key === row.category)?.name}: ${row.count} of ${data.entries.length} entries · ${row.percent.toFixed(1)}%`}</ThemedText>)}
        <ThemedText>{data.mode === "prewritten" ? "Source: Prewritten content, version 1.0. Categories selected by you; counts calculated by the app." : "Source: Categories reviewed and confirmed by you in live AI mode; counts calculated by the app."}</ThemedText>
      </View>}
      {data.step === "summary" && <>
        <Action label="Open attention ethics card" disabled={disabled} onPress={() => void persist({ ...data, step: "ethics", ethics_card_seen_at: data.ethics_card_seen_at ?? new Date().toISOString() })} />
        <Action label="Back to audit entries" disabled={busy} onPress={() => void persist({ ...data, step: "explore" })} />
      </>}
      {data.step === "ethics" && <>
        <ThemedText accessibilityRole="header" type="subtitle">Attention ethics</ThemedText><ThemedText>{ETHICS_COPY}</ThemedText>
        {!data.two_minute_sit_completed_at ? <PracticeBeat activityId={activityId} weekNumber={3} embedded isSaving={busy}
          config={{ id: `week3-two-minute-sit-v1:${data.summary?.generated_at}`, title: "Two-minute sit with discomfort", durationMs: 120000,
            instructions: "Notice discomfort without rushing to explain it. Pause if you need to; background time does not count. Your timer position is saved on this device." }}
          continueLabel="Save completed two-minute sit" onContinue={() => persist({ ...data, sit_elapsed_ms: 120000, two_minute_sit_completed_at: new Date().toISOString() })}
          onExit={() => void persist(data, true)} /> : <AccessibleStatus>Two-minute sit complete.</AccessibleStatus>}
        <Action label="Continue to Notice the gap" disabled={busy || !data.two_minute_sit_completed_at || data.sit_elapsed_ms !== 120000} onPress={() => void persist({ ...data, step: "notice" })} />
        <Action label="Back to summary" disabled={busy} onPress={() => void persist({ ...data, step: "summary" })} />
      </>}
      {(data.step === "notice" || completed) && <>
        <Field label={NOTICE_PROMPT} value={data.notice_reflection} disabled={disabled} limit={20000} onChange={notice_reflection => edit({ ...data, notice_reflection })} />
        <ThemedText>A nonblank response is required. No minimum word count is added.</ThemedText>
        {!completed && <><Action label="Complete Week 3" disabled={busy || !canComplete(data)} onPress={() => void persist({ ...data, step: "completed", completed_at: new Date().toISOString() })} />
          <Action label="Back to ethics card" disabled={busy} onPress={() => void persist({ ...data, step: "ethics" })} /></>}
        {completed && <AccessibleStatus>Your Week 3 completion and reflection are saved. Completed work is read-only.</AccessibleStatus>}
      </>}
      {legacy && Object.keys(legacy).length > 0 && <><Action label="View earlier preview writing (read-only)" onPress={() => setShowLegacy(value => !value)} />
        {showLegacy && <View style={styles.card}><ThemedText>Earlier synthetic preview. Preserved as entered; it does not count as a three-day audit or completion.</ThemedText>{Object.entries(legacy).map(([key, value]) => <ThemedText key={key}>{`${key}: ${value}`}</ThemedText>)}</View>}</>}
      {!completed && <Action label="Save Week 3 draft" disabled={busy} onPress={() => void persist(data)} />}
      <Action label={completed ? "Back to curriculum" : "Save and return to curriculum"} disabled={busy} onPress={() => completed ? onExit() : void persist(data, true)} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 22, paddingTop: Platform.OS === "web" ? 88 : 22, paddingBottom: 90, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" },
  section: { gap: 10 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, card: { padding: 16, borderWidth: 1, borderColor: "#84988a", borderRadius: 14, gap: 12 },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" }, editor: { minHeight: 100, padding: 14, borderWidth: 1, borderColor: "#84988a", borderRadius: 12, fontSize: 16, lineHeight: 24 } });
