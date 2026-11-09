import { summarizeStudentSelections } from "./week-three-selection-summary";

// Isa's 2 Nov completion handoff + 4 Nov prewritten pack. Category/day rules
// are team implementation rules pending sponsor confirmation, not new claims.
export const WEEK_THREE_VERSION = "week3-handoff/1";
export const NON_AI_VERSION = "1.0.0";
export const NOTICE_PROMPT = "What patterns surprised you? What felt chosen, and what felt designed?";
export const ETHICS_COPY = "Recommendation systems are designed to predict what will keep attention. Engagement can be useful, but it can also turn attention into something platforms compete to capture. Notice the difference between choosing to continue and being pulled to continue.";
export const PREWRITTEN_DISCLOSURE = "Prewritten activity. These examples and prompts were written in advance. The app does not analyze or interpret your response, and this activity does not send your response to an AI model.";
export const CATEGORIES = [
  { key: "planning", name: "Planning", definition: "Attention moved to a future task, decision, or obligation." },
  { key: "memory", name: "Memory", definition: "Attention returned to a past event or interaction." },
  { key: "worry", name: "Worry", definition: "Attention focused on a feared or uncertain outcome." },
  { key: "social_comparison", name: "Social comparison", definition: "Attention evaluated the self against another person." },
  { key: "entertainment", name: "Entertainment", definition: "Attention moved to media or content mainly for stimulation." },
  { key: "other", name: "Other", definition: "None of the listed categories fits." },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];
export type AuditMode = "prewritten" | "live_ai";
export type ModuleStep = "arrive" | "practice" | "explore" | "summary" | "ethics" | "notice" | "completed";
export type AuditEntry = {
  id: string; audit_day: 1 | 2 | 3; source: "practice" | "daily_technology";
  topic_trigger: string; app_content_type: string; duration_minutes: number | null; occurred_at: string;
  student_category: Category | null; ai_category: Category | null; ai_confirmed: boolean;
};
export type EntryDraft = { id: string | null; source: AuditEntry["source"]; topic: string; app: string; minutes: string };
export const emptyEntryDraft = (): EntryDraft => ({ id: null, source: "practice", topic: "", app: "", minutes: "" });
export type WeekThreeModule = {
  version: typeof WEEK_THREE_VERSION; content_version: typeof NON_AI_VERSION; step: ModuleStep;
  arrival_focus: number | null; practice_started_at: string | null; practice_completed_at: string | null;
  practice_labels: string[]; audit_start_date: string | null; current_audit_day: 1 | 2 | 3;
  days: { day: 1 | 2 | 3; day_complete: boolean; no_distraction_noticed: boolean }[];
  entries: AuditEntry[]; entry_draft: EntryDraft; mode: AuditMode | null;
  summary: { mode: AuditMode; fingerprint: string; generated_at: string; content_version: string } | null;
  ethics_card_seen_at: string | null; sit_elapsed_ms: number; two_minute_sit_completed_at: string | null;
  notice_reflection: string; completed_at: string | null; ai_request_id: string | null; ai_proposal_digest: string | null;
};
export function newWeekThreeModule(): WeekThreeModule {
  return { version: WEEK_THREE_VERSION, content_version: NON_AI_VERSION, step: "arrive", arrival_focus: null,
    practice_started_at: null, practice_completed_at: null, practice_labels: [], audit_start_date: null, current_audit_day: 1,
    days: [1, 2, 3].map(day => ({ day: day as 1 | 2 | 3, day_complete: false, no_distraction_noticed: false })),
    entries: [], entry_draft: emptyEntryDraft(), mode: null, summary: null, ethics_card_seen_at: null,
    sit_elapsed_ms: 0, two_minute_sit_completed_at: null, notice_reflection: "", completed_at: null, ai_request_id: null, ai_proposal_digest: null };
}
export const isCategory = (value: unknown): value is Category => CATEGORIES.some(item => item.key === value);
const time = (value: unknown) => typeof value === "string" && /(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const optionalTime = (value: unknown) => value === null || time(value);
export function validModule(value: unknown): value is WeekThreeModule {
  const data = value as WeekThreeModule;
  return !!data && data.version === WEEK_THREE_VERSION && data.content_version === NON_AI_VERSION &&
    ["arrive", "practice", "explore", "summary", "ethics", "notice", "completed"].includes(data.step) &&
    (data.arrival_focus === null || Number.isInteger(data.arrival_focus) && data.arrival_focus >= 1 && data.arrival_focus <= 5) &&
    optionalTime(data.practice_started_at) && optionalTime(data.practice_completed_at) && optionalTime(data.audit_start_date) &&
    optionalTime(data.ethics_card_seen_at) && optionalTime(data.two_minute_sit_completed_at) && optionalTime(data.completed_at) &&
    Array.isArray(data.practice_labels) && data.practice_labels.every(label => ["planning", "memory", "worry", "other"].includes(label)) && data.practice_labels.length <= 300 &&
    [1, 2, 3].includes(data.current_audit_day) && Array.isArray(data.days) && data.days.length === 3 &&
    data.days.every((day, index) => day.day === index + 1 && typeof day.day_complete === "boolean" && typeof day.no_distraction_noticed === "boolean") &&
    Array.isArray(data.entries) && data.entries.length <= 300 && new Set(data.entries.map(entry => entry.id)).size === data.entries.length &&
    data.entries.every(entry => typeof entry.id === "string" && /^[\da-f-]{36}$/i.test(entry.id) && [1, 2, 3].includes(entry.audit_day) &&
      ["practice", "daily_technology"].includes(entry.source) && typeof entry.topic_trigger === "string" && !!entry.topic_trigger.trim() && entry.topic_trigger.length <= 2000 &&
      typeof entry.app_content_type === "string" && entry.app_content_type.length <= 200 && (entry.source !== "daily_technology" || !!entry.app_content_type.trim()) &&
      (entry.duration_minutes === null || Number.isSafeInteger(entry.duration_minutes) && entry.duration_minutes >= 0 && entry.duration_minutes <= 1440) && time(entry.occurred_at) &&
      (entry.student_category === null || isCategory(entry.student_category)) && (entry.ai_category === null || isCategory(entry.ai_category)) && typeof entry.ai_confirmed === "boolean") &&
    !!data.entry_draft && (data.entry_draft.id === null || typeof data.entry_draft.id === "string") && ["practice", "daily_technology"].includes(data.entry_draft.source) &&
    [data.entry_draft.topic, data.entry_draft.app, data.entry_draft.minutes].every(text => typeof text === "string" && text.length <= 4000) &&
    (data.mode === null || ["prewritten", "live_ai"].includes(data.mode)) && Number.isSafeInteger(data.sit_elapsed_ms) && data.sit_elapsed_ms >= 0 && data.sit_elapsed_ms <= 120000 &&
    typeof data.notice_reflection === "string" && data.notice_reflection.length <= 20000 &&
    (data.ai_request_id === null || /^[\da-f-]{36}$/i.test(data.ai_request_id)) &&
    (data.ai_proposal_digest === null || typeof data.ai_proposal_digest === "string") &&
    (data.summary === null || !!data.summary && ["prewritten", "live_ai"].includes(data.summary.mode) && typeof data.summary.fingerprint === "string" &&
      time(data.summary.generated_at) && data.summary.content_version === NON_AI_VERSION);
}
export function auditComplete(data: WeekThreeModule) {
  return data.days.every(day => day.day_complete && (day.no_distraction_noticed ? !data.entries.some(entry => entry.audit_day === day.day) : data.entries.some(entry => entry.audit_day === day.day)));
}
export function confirmedCategory(entry: AuditEntry, mode: AuditMode | null): Category | null {
  return mode === "prewritten" ? entry.student_category : mode === "live_ai" && entry.ai_confirmed ? entry.ai_category : null;
}
export function auditFingerprint(data: WeekThreeModule) {
  return JSON.stringify({ mode: data.mode, days: data.days, entries: data.entries.map(entry => ({ ...entry, category: confirmedCategory(entry, data.mode) })) });
}
export function rawAuditFingerprint(data: WeekThreeModule) {
  return JSON.stringify(data.entries.map(({ id, source, topic_trigger, app_content_type, duration_minutes, occurred_at }) => ({ id, source, topic_trigger, app_content_type, duration_minutes, occurred_at })));
}
export function canSummarize(data: WeekThreeModule) {
  return !!data.mode && auditComplete(data) && (data.mode !== "live_ai" || !data.entries.length || data.ai_proposal_digest === rawAuditFingerprint(data)) && data.entries.every(entry => confirmedCategory(entry, data.mode) !== null);
}
export function hasSummary(data: WeekThreeModule) { return !!data.summary && data.summary.mode === data.mode && data.summary.fingerprint === auditFingerprint(data) && canSummarize(data); }
export function counts(data: WeekThreeModule) {
  return summarizeStudentSelections(CATEGORIES.map(item => item.key), data.entries.map(entry => confirmedCategory(entry, data.mode)!).filter(Boolean));
}
export function canComplete(data: WeekThreeModule) {
  return data.arrival_focus !== null && !!data.practice_started_at && !!data.practice_completed_at && hasSummary(data) &&
    !!data.ethics_card_seen_at && data.sit_elapsed_ms === 120000 && !!data.two_minute_sit_completed_at && !!data.notice_reflection.trim();
}
// Used at the persistence boundary as well as by disabled controls.
export function validateModuleGates(data: WeekThreeModule) {
  if (!validModule(data)) throw new Error("The saved Week 3 data is invalid. Your existing work has not been replaced.");
  if (data.step !== "arrive" && data.arrival_focus === null) throw new Error("Select an arrival rating first.");
  if (!["arrive", "practice"].includes(data.step) && !data.practice_completed_at) throw new Error("Finish Practice first.");
  if (["summary", "ethics", "notice", "completed"].includes(data.step) && !hasSummary(data)) throw new Error("Finish all three audit days and confirm every category before the summary.");
  if (["notice", "completed"].includes(data.step) && (!data.ethics_card_seen_at || data.sit_elapsed_ms !== 120000 || !data.two_minute_sit_completed_at)) throw new Error("Open the ethics card and finish the two-minute sit first.");
  if ((data.step === "completed" || data.completed_at) && (!canComplete(data) || data.step !== "completed" || !data.completed_at)) throw new Error("Save the required reflection and finish all Week 3 steps before completing.");
}
export function changeEntries(data: WeekThreeModule, entries: AuditEntry[]): WeekThreeModule {
  return { ...data, entries, summary: null, ai_request_id: null, ai_proposal_digest: null, ethics_card_seen_at: null, sit_elapsed_ms: 0, two_minute_sit_completed_at: null };
}
