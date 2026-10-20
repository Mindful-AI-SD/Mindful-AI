import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignedInUserId } from "./auth-gate";
import { AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import BreathingPlayer from "../app/breathing-player";
import { usePracticePlayer } from "../hooks/use-practice-player";
import { modulePractice, practiceSessionId, type ModulePractice } from "../../lib/module-practice";
import { practiceStorageKey, readPracticeSession, writePracticeSession, removePracticeSession, type SavedPractice } from "../../lib/practice-session";
import PracticeMedia from "./practice-media";
import type { PracticeMediaStatus } from "./practice-media.types";

type Props = { activityId: string; weekNumber: 1 | 2; config?: ModulePractice; isSaving?: boolean; embedded?: boolean;
  onContinue: () => Promise<boolean> | boolean | void; onExit: () => void; continueLabel?: string };

export function PracticeBeat(props: Props) {
  const config = props.config ?? modulePractice(props.weekNumber);
  if (config.legacyBreathing) return <BreathingPlayer activityId={props.activityId} onContinue={props.onContinue} onExit={props.onExit} isSaving={props.isSaving} />;
  return <RestoredPractice key={practiceSessionId(config)} {...props} config={config} />;
}

function RestoredPractice(props: Props & { config: ModulePractice }) {
  const userId = useSignedInUserId();
  const key = practiceStorageKey(userId, props.activityId, practiceSessionId(props.config));
  const [session, setSession] = useState<SavedPractice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false); setError(false);
    void readPracticeSession(key).then(data => { if (!cancelled) { setSession(data); setLoaded(true); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [key, attempt]);
  if (!loaded) return <View style={styles.content}>
    <AccessibleStatus error={error}>{error ? "Could not restore Practice. Your saved place has not been replaced." : "Loading saved Practice…"}</AccessibleStatus>
    {error && <Pressable accessibilityRole="button" style={styles.action} onPress={() => setAttempt(value => value + 1)}><ThemedText>Retry loading Practice</ThemedText></Pressable>}
    <Pressable accessibilityRole="button" style={styles.action} onPress={props.onExit}><ThemedText>Back to curriculum</ThemedText></Pressable>
  </View>;
  return <PracticeController {...props} storageKey={key} session={session} />;
}

function PracticeController({ config, session, storageKey, onContinue, onExit, isSaving = false, embedded = false, continueLabel = "Continue to Explore" }: Props & { config: ModulePractice; session: SavedPractice | null; storageKey: string }) {
  const [fallback, setFallback] = useState(session?.fallback ?? false);
  const [mediaError, setMediaError] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const snapshot = useRef<SavedPractice>(session ?? { elapsedMs: 0, position: 0, completed: false, fallback: false });
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const alive = useRef(true);
  const active = useRef(false);
  const advanced = useRef(false);
  const touched = useRef(Boolean(session));
  const bucket = useRef(Math.floor((session?.elapsedMs ?? 0) / 5000));
  const media = !fallback ? config.media : undefined;
  const unavailable = config.unavailable ?? (media?.source.kind === "reference" ? "The configured media is unavailable until its asset reference is resolved." : null);

  function remember(patch: Partial<SavedPractice>, flush = false): Promise<boolean> {
    if (advanced.current) return Promise.resolve(true);
    if (Object.keys(patch).length > 0) touched.current = true;
    if (!touched.current) return Promise.resolve(true);
    snapshot.current = { ...snapshot.current, ...patch };
    const nextBucket = Math.floor(snapshot.current.elapsedMs / 5000);
    if (!flush && nextBucket === bucket.current) return queue.current;
    bucket.current = nextBucket;
    const value = { ...snapshot.current };
    queue.current = queue.current.then(() => writePracticeSession(storageKey, value)).then(() => true).catch(() => {
      if (alive.current) setStorageError("Could not save your Practice position. Retry saving before leaving.");
      return false;
    });
    return queue.current;
  }
  const controls = usePracticePlayer({
    durationMs: media ? undefined : config.durationMs,
    pauseOnBackground: true,
    onStateChange: (state, elapsedMs) => { void remember({ elapsedMs, completed: state === "completed" }, true); },
    onTick: elapsedMs => { void remember({ elapsedMs }); },
  }, session ? { practiceId: config.id, state: "paused", elapsedActiveMs: session.elapsedMs, startedAt: null, lastSavedAt: null, completed: session.completed } : null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; void remember({}, true); };
  }, []);
  useEffect(() => {
    if (!media || ready || mediaError || unavailable) return;
    const timeout = setTimeout(() => { controls.pause(); setMediaError(true); }, 15000);
    return () => clearTimeout(timeout);
  }, [media, ready, mediaError, unavailable, attempt, controls.pause]);

  function mediaStatus(status: PracticeMediaStatus, position: number) {
    if (!alive.current) return;
    void remember({ position: Number.isFinite(position) ? Math.max(0, position) : snapshot.current.position });
    if (status === "error") { controls.pause(); setReady(false); setMediaError(true); return; }
    if (status !== "loading") setReady(true);
    if (status === "playing") { if (controls.state === "idle") controls.start(); else if (controls.state === "paused") controls.resume(); }
    if (status === "paused") controls.pause();
    if (status === "completed") controls.finish();
  }
  async function leave() {
    controls.pause();
    if (await remember({}, true)) onExit();
  }
  async function advance() {
    if (active.current || !complete || isSaving || storageError) return;
    active.current = true; setAdvancing(true);
    try {
      if (!(await remember({}, true))) return;
      const result = await onContinue();
      if (result !== false) {
        advanced.current = true;
        await queue.current;
        // The beat may have unmounted during onContinue; clear after its final queued write.
        await removePracticeSession(storageKey);
      }
    } catch { if (alive.current) setStorageError("Could not continue. Your completed Practice is saved; please retry."); }
    finally { active.current = false; if (alive.current) setAdvancing(false); }
  }

  const blocked = isSaving || advancing;
  const transcript = config.media?.transcript;
  const complete = controls.state === "completed" && (!media || ready || session?.completed);
  const content = <>
    <ThemedText accessibilityRole="header" type="subtitle">{config.title}</ThemedText>
    {!!config.instructions && <ThemedText>{config.instructions}</ThemedText>}
    {config.media?.attribution && <ThemedText>{config.media.attribution}</ThemedText>}
    {transcript && <View style={styles.section}>
      <ThemedText accessibilityRole="header" type="smallBold">Transcript</ThemedText>
      {transcript.kind === "inline" ? <ThemedText>{transcript.text}</ThemedText> : transcript.source.kind === "url"
        ? <Pressable accessibilityRole="link" accessibilityHint="Opens the supplied transcript." style={styles.action}
          onPress={() => { setTranscriptError(false); void Linking.openURL(transcript.source.kind === "url" ? transcript.source.url : "").catch(() => setTranscriptError(true)); }}><ThemedText>Open transcript</ThemedText></Pressable>
        : <ThemedText>Transcript is pending its configured asset.</ThemedText>}
    </View>}
    {transcriptError && <AccessibleStatus error>Could not open the transcript. Select Open transcript to retry, or return to the curriculum.</AccessibleStatus>}
    {media && !transcript && <ThemedText>No transcript was supplied.</ThemedText>}
    {media && !ready && !mediaError && !unavailable && <AccessibleStatus>Loading Practice media…</AccessibleStatus>}
    {(unavailable || mediaError) && <AccessibleStatus error>{unavailable ?? `Playback error. Your position is saved. Retry media${config.media?.alternativeInstructions ? " or use the supplied text alternative" : " or return to the curriculum"}.`}</AccessibleStatus>}
    {mediaError && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={() => { setMediaError(false); setReady(false); setAttempt(value => value + 1); }}><ThemedText>Retry media</ThemedText></Pressable>}
    {config.media?.alternativeInstructions && <View style={styles.section}>
      <ThemedText accessibilityRole="header" type="smallBold">Text alternative</ThemedText>
      <ThemedText>{config.media.alternativeInstructions}</ThemedText>
      {!fallback && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={() => {
        controls.restore(null); void remember({ elapsedMs: 0, position: 0, completed: false, fallback: true }, true); setFallback(true);
      }}><ThemedText>Use text alternative</ThemedText></Pressable>}
    </View>}
    {media?.source.kind === "url" && !mediaError && !unavailable && <PracticeMedia key={attempt} type={media.type} url={media.source.url}
      position={snapshot.current.position} onStatus={mediaStatus} onRestart={() => { controls.restart(); void remember({ position: 0, completed: false }, true); }} />}
    {!media && !unavailable && <>
      <AccessibleStatus>{`Practice status: ${controls.state}`}</AccessibleStatus>
      {controls.remainingMs !== null && <ThemedText accessibilityRole="timer">{`${Math.ceil(controls.remainingMs / 1000)} seconds remaining`}</ThemedText>}
      <View style={styles.section}>
        {controls.state === "idle" && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={controls.start}><ThemedText>Start practice</ThemedText></Pressable>}
        {controls.state === "running" && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={controls.pause}><ThemedText>Pause practice</ThemedText></Pressable>}
        {controls.state === "paused" && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={controls.resume}><ThemedText>Resume practice</ThemedText></Pressable>}
        {controls.state !== "idle" && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={controls.restart}><ThemedText>Restart practice</ThemedText></Pressable>}
        {controls.remainingMs === null && (controls.state === "running" || controls.state === "paused") && <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={controls.finish}><ThemedText>Finish practice</ThemedText></Pressable>}
      </View>
    </>}
    {storageError && <><AccessibleStatus error>{storageError}</AccessibleStatus><Pressable accessibilityRole="button" style={styles.action}
      onPress={() => void remember({}, true).then(saved => { if (saved) setStorageError(null); })}><ThemedText>Retry saving Practice</ThemedText></Pressable></>}
    <Pressable accessibilityRole="button" disabled={!complete || blocked || !!storageError} accessibilityState={{ disabled: !complete || blocked || !!storageError, busy: blocked }} style={styles.action} onPress={() => void advance()}><ThemedText>{continueLabel}</ThemedText></Pressable>
    <Pressable accessibilityRole="button" disabled={blocked} style={styles.action} onPress={() => void leave()}><ThemedText>Back to curriculum</ThemedText></Pressable>
  </>;
  return embedded ? <View style={styles.section}>{content}</View> : <ThemedView style={styles.flex}><SafeAreaView style={styles.flex}><ScrollView contentContainerStyle={styles.content}>{content}</ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 24, paddingTop: 48, width: "100%", maxWidth: 720, alignSelf: "center", gap: 20 }, section: { gap: 12 }, action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" } });
