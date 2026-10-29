import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BaselineError, baselineOperationId, type BaselineService, type BaselineWrite } from "../../lib/baseline";
import { createBaselineFixtureService } from "../../lib/baseline-fixture-service";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { GuidingQuestionsPreview } from "./guiding-questions-preview";
import { BASELINE_DEFINITION_FIXTURE, WEEK_ACCESS_FIXTURE, type BaselineDefinitionInput, type BaselineRecordInput } from "./guiding-questions-preview.fixtures";

type Props = { userId: string; onBack: () => void; service?: BaselineService; definition?: BaselineDefinitionInput };
type Pending = { kind: "draft" | "submit"; request: BaselineWrite };

export function GuidingQuestionsCapture(props: Props) {
  return <CaptureSession key={props.userId} {...props} />;
}

function CaptureSession({ userId, onBack, service, definition = BASELINE_DEFINITION_FIXTURE }: Props) {
  const adapter = useMemo(() => service ?? createBaselineFixtureService(userId, definition), [service, userId, definition]);
  const [record, setRecord] = useState<BaselineRecordInput | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const alive = useRef(true);
  const active = useRef(false);
  const pending = useRef<Pending | null>(null);

  async function currentRecord() {
    const [current, original] = await Promise.all([adapter.loadBaseline(), adapter.loadOriginalBaseline()]);
    // A submitted original always takes precedence over any editable draft.
    return original.original ?? current;
  }

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setLoaded(false); setError(null);
    void currentRecord().then(current => {
      if (!cancelled) { setRecord(current); pending.current = null; setLoaded(true); }
    }).catch(() => {
      if (!cancelled) setError("Could not load your saved baseline. Retry loading; existing answers have not been replaced.");
    });
    return () => { cancelled = true; alive.current = false; };
  }, [adapter, attempt]);

  async function write(operation: Pending) {
    if (active.current || record?.status === "submitted") return;
    active.current = true; pending.current = operation;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (operation.kind === "draft") await adapter.saveBaselineDraft(operation.request);
      else await adapter.submitBaseline(operation.request);
      // After a replayed acknowledgement, load current data instead of applying an old receipt.
      const current = await currentRecord();
      if (!alive.current) return;
      if (!current) throw new Error();
      setRecord(current); setFormVersion(value => value + 1); pending.current = null;
      setMessage(current.status === "submitted" ? "Original baseline submitted. Your five answers are read-only." : "Baseline draft saved on this device.");
    } catch (cause) {
      if (alive.current) setError(cause instanceof BaselineError ? cause.message : "Could not save your baseline. Retry the same save; your input has not been cleared.");
    } finally {
      active.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function begin(kind: Pending["kind"], answers: Record<string, string>) {
    if (active.current || record?.status === "submitted") return;
    const previous = pending.current;
    if (previous && previous.kind === kind && JSON.stringify(previous.request.answers) === JSON.stringify(answers)) {
      void write(previous); return;
    }
    void write({ kind, request: {
      operationId: baselineOperationId(), expectedRevision: record?.revision ?? 0,
      definitionId: record?.definitionId ?? definition.definitionId,
      definitionVersion: record?.definitionVersion ?? definition.definitionVersion, answers: { ...answers },
    } });
  }

  if (!loaded) return <View style={styles.loading}>
    <AccessibleStatus error={!!error}>{error ?? "Loading saved baseline…"}</AccessibleStatus>
    {error && <Pressable accessibilityRole="button" style={styles.action} onPress={() => setAttempt(value => value + 1)}><ThemedText>Retry loading baseline</ThemedText></Pressable>}
    <Pressable accessibilityRole="button" style={styles.action} onPress={onBack}><ThemedText>Back to curriculum</ThemedText></Pressable>
  </View>;

  return <GuidingQuestionsPreview key={formVersion} definition={definition} record={record} weeks={WEEK_ACCESS_FIXTURE} onBack={onBack}
    persistence={{ busy, error, message,
      onSave: answers => begin("draft", answers), onSubmit: answers => begin("submit", answers),
      onRetry: () => { if (pending.current) void write(pending.current); },
      onReload: () => { setMessage(null); setAttempt(value => value + 1); },
      onDirty: () => { pending.current = null; setError(null); setMessage("Unsaved baseline changes. Save your draft before leaving."); },
    }} />;
}

const styles = StyleSheet.create({ loading: { padding: 24, paddingTop: 72, gap: 16 }, action: { minHeight: 48, padding: 12, justifyContent: "center" } });
