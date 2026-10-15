import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSignedInUserId } from "./auth-gate";
import { AccessibleHeading, AccessibleStatus } from "./accessibility";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import { BODY_REGIONS, saveWeekTwoArrival, type BodyRegion } from "../../lib/week-two-arrival";
import { loadWeekTwoProgress, saveWeekTwoAnswers, sensationsFrom, SENSATION_KEYS, validSensations, weekTwoAnswerPatch, WEEK_TWO_BEATS, type LexiconWords, type WeekTwoProgress, type WeekTwoStep } from "../../lib/week-two";
import { getSensationWords, type SensationLexiconData } from "../../lib/sensation-lexicon";
import type { ReflectionAnswers } from "../../lib/progress";
import { WeekTwoExplore, WeekTwoNotice } from "./week-two-explore-notice";

export function WeekTwoFlow({ activityId, onExit }: { activityId: string; onExit: () => void }) {
  const userId = useSignedInUserId();
  const [saved, setSaved] = useState<WeekTwoProgress | null>(null);
  const [answers, setAnswers] = useState<ReflectionAnswers>({});
  const [lexicon, setLexicon] = useState<LexiconWords | null>(null);
  const [support, setSupport] = useState<Extract<SensationLexiconData, { kind: "support" }> | null>(null);
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const version = useRef(0);
  const request = useRef<AbortController | null>(null);

  function apply(data: WeekTwoProgress) {
    setSaved(data);
    setRegion(data.region);
    setAnswers(data.answers);
    setLexicon(data.lexicon);
  }

  useEffect(() => {
    const current = ++version.current;
    setSaved(null);
    setRegion(null);
    setSupport(null);
    setError(null);
    setBusy(true);
    void loadWeekTwoProgress(userId, activityId).then(data => {
      if (version.current !== current) return;
      apply(data);
    }).catch(error => {
      if (version.current === current) setError(error instanceof Error ? error.message : "Could not load your check-in. Please retry.");
    }).finally(() => { if (version.current === current) setBusy(false); });
    return () => { version.current++; request.current?.abort(); request.current = null; };
  }, [userId, activityId, attempt]);

  async function run(operation: () => Promise<WeekTwoProgress>): Promise<boolean> {
    if (active.current || busy || !saved) return false;
    const current = version.current;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await operation();
      if (version.current !== current) return false;
      apply(data);
      return true;
    } catch (error) {
      if (version.current === current) setError(error instanceof Error ? error.message : "Could not save your location. Please retry.");
      return false;
    } finally {
      active.current = false;
      if (version.current === current) setBusy(false);
    }
  }

  async function save(advance: boolean, exit = false) {
    if (!region || !saved) return;
    const success = await run(async () => {
      const data = await saveWeekTwoArrival(userId, activityId, region, advance);
      return { ...saved, ...data, answers: { ...answers, arrive_body_region: region }, status: "in_progress", completedAt: null };
    });
    if (success && exit) onExit();
  }

  async function persist(nextStep: WeekTwoStep = saved!.step, patch = answers, exit = false) {
    if (!saved) return;
    const success = await run(() => saveWeekTwoAnswers(userId, activityId, saved.step, weekTwoAnswerPatch(patch), nextStep));
    if (success && exit) onExit();
  }

  function edit(key: string, value: string) {
    setAnswers(current => ({ ...current, [key]: value, ...(SENSATION_KEYS.includes(key as typeof SENSATION_KEYS[number]) ? { week_two_lexicon: "" } : {}) }));
    if (SENSATION_KEYS.includes(key as typeof SENSATION_KEYS[number])) { setLexicon(null); setSupport(null); }
    setError(null);
  }

  async function generate() {
    if (!saved || active.current || busy || !validSensations(answers)) return;
    const controller = new AbortController();
    request.current = controller;
    setSupport(null);
    await run(async () => {
      const draft = await saveWeekTwoAnswers(userId, activityId, saved.step, weekTwoAnswerPatch(answers));
      if (request.current !== controller) throw new Error("Request cancelled.");
      setSaved(draft);
      const response = await getSensationWords({ activityId, activityContext: "Week 2: Body Awareness. Sensation Lexicon. Suggest optional sensory words for three sensations.", sensations: sensationsFrom(answers) }, { signal: controller.signal });
      if (request.current !== controller) throw new Error("Request cancelled.");
      if (response.error) throw new Error(response.error.message);
      if (response.data.kind === "support") {
        setSupport(response.data);
        return saveWeekTwoAnswers(userId, activityId, saved.step, { week_two_lexicon: "" });
      }
      return saveWeekTwoAnswers(userId, activityId, saved.step, { week_two_lexicon: JSON.stringify(response.data) });
    });
    if (request.current === controller) request.current = null;
  }

  const label = BODY_REGIONS.find(item => item.id === region)?.label;
  const practice = saved?.step === "week_two_practice";
  const arrive = saved?.step === "week_two_arrive";
  const dirty = !!saved && JSON.stringify(answers) !== JSON.stringify(saved.answers);
  const heading = saved?.step === "completed" ? "Week 2 complete" : arrive || !saved ? "Arrive · Body-map check-in" : practice ? "Practice" : saved.step === "week_two_explore" ? "Explore · Sensation Lexicon" : "Notice";
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText>WEEK 2</ThemedText>
          <ThemedText>{WEEK_TWO_BEATS.join(" → ")}</ThemedText>
          <AccessibleHeading focusKey={saved?.step ?? "loading"}>{heading}</AccessibleHeading>
          {busy && <AccessibleStatus>{saved ? "Loading or saving Week 2…" : "Loading your body-map check-in…"}</AccessibleStatus>}
          {error && <AccessibleStatus error>{error}</AccessibleStatus>}
          {!saved && !busy && (
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setAttempt(value => value + 1)}>
              <ThemedText>Retry loading</ThemedText>
            </Pressable>
          )}
          {saved && arrive && (
            <>
              <ThemedText>Where do you notice a sensation right now? Choose one region. You can change your choice before continuing.</ThemedText>
              <View accessibilityRole="radiogroup" accessibilityLabel="Body region" style={styles.map}>
                {BODY_REGIONS.map(item => (
                  <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.label}
                    accessibilityHint="Selects this body region. Left and right refer to your own body."
                    accessibilityState={{ checked: region === item.id, disabled: busy }} aria-checked={region === item.id}
                    disabled={busy} style={styles.region}
                    onPress={() => { setRegion(item.id); setError(null); }}>
                    <ThemedText>{`${item.label}${region === item.id ? " ✓" : ""}`}</ThemedText>
                  </Pressable>
                ))}
              </View>
              <AccessibleStatus>{label ? `Selected location: ${label}` : "Choose a location to continue."}</AccessibleStatus>
              <Pressable accessibilityRole="button" disabled={!region || busy} style={styles.action}
                accessibilityState={{ disabled: !region || busy, busy }} accessibilityHint="Saves your location and opens Practice."
                onPress={() => void save(true)}>
                <ThemedText>{error ? "Retry and continue to Practice" : "Continue to Practice"}</ThemedText>
              </Pressable>
            </>
          )}
          {practice && (
            <>
              <ThemedText>Your body-map check-in is saved. You are ready for Practice.</ThemedText>
              <ThemedText>Take a quiet moment to notice sensations in your body without judging them. When you are ready, describe what you noticed in Explore.</ThemedText>
              <ThemedText>{`Selected location: ${label}`}</ThemedText>
              <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
                accessibilityHint="Returns to Arrive with your saved location so you can revise it."
                onPress={() => void save(false)}>
                <ThemedText>Revise location</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
                accessibilityHint="Saves Practice as finished and opens Explore."
                onPress={() => void persist("week_two_explore", { ...answers, week_two_practice_complete: "yes" })}>
                <ThemedText>Continue to Explore</ThemedText>
              </Pressable>
            </>
          )}
          {saved?.step === "week_two_explore" && <WeekTwoExplore answers={answers} data={lexicon} support={support}
            busy={busy} retry={!!error} onChange={edit} onGenerate={() => void generate()}
            onContinue={() => void persist("week_two_notice")} />}
          {saved?.step === "week_two_notice" && lexicon && <WeekTwoNotice answers={answers} data={lexicon}
            busy={busy} onChange={edit} onComplete={() => void persist("completed")} />}
          {(saved?.step === "week_two_explore" || saved?.step === "week_two_notice") && <>
            <AccessibleStatus>{dirty ? "Unsaved answers. Use Save answers or continue to keep them." : "Saved"}</AccessibleStatus>
            <Pressable accessibilityRole="button" disabled={busy || !dirty} style={styles.action}
              accessibilityState={{ disabled: busy || !dirty, busy }} onPress={() => void persist()}>
              <ThemedText>Save answers</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
              onPress={() => void persist(saved.step === "week_two_notice" ? "week_two_explore" : "week_two_practice")}>
              <ThemedText>{saved.step === "week_two_notice" ? "Back to Explore" : "Back to Practice"}</ThemedText>
            </Pressable>
          </>}
          {saved?.step === "completed" && <>
            <ThemedText>Your body-map check-in, sensations, results, and reflections are saved.</ThemedText>
            <ThemedText accessibilityRole="header">Your tracker reflection</ThemedText>
            <ThemedText>{answers.week_two_tracker_reflection}</ThemedText>
            <ThemedText accessibilityRole="header">Your closing reflection</ThemedText>
            <ThemedText>{answers.week_two_closing_reflection}</ThemedText>
          </>}
          {saved && error && <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
            accessibilityHint="Replaces unsaved changes with your last saved Week 2 answers."
            onPress={() => setAttempt(value => value + 1)}><ThemedText>Reload saved Week 2</ThemedText></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
            accessibilityHint="Saves your chosen location before returning to the curriculum."
            onPress={() => {
              if (saved?.step === "completed") onExit();
              else if (arrive && region && saved && region !== saved.region) void save(false, true);
              else if (dirty && saved) void persist(saved.step, answers, true);
              else onExit();
            }}>
            <ThemedText>Back to curriculum</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 24, paddingTop: Platform.OS === "web" ? 88 : 24, gap: 20 },
  map: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  region: { minHeight: 48, minWidth: 48, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#b9cbbd", justifyContent: "center" },
  action: { minHeight: 48, minWidth: 48, padding: 12, justifyContent: "center" },
});
