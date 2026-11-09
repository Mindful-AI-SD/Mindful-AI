import { auditComplete, auditFingerprint, canComplete, canSummarize, CATEGORIES, changeEntries, counts, newWeekThreeModule, rawAuditFingerprint, validateModuleGates } from "../lib/week-three-module";

export function example() {
  const time = "2026-11-09T08:00:00Z";
  const categories = ["planning", "entertainment", "memory", "social_comparison", "worry", "entertainment"];
  const topics = ["Thinking about a project deadline", "Opened short videos after a notification", "Replaying an awkward conversation", "Compared an internship update with classmates", "Worried about an upcoming exam", "Read gaming clips instead of starting homework"];
  return { ...newWeekThreeModule(), step: "explore", arrival_focus: 3, practice_started_at: time, practice_completed_at: time, audit_start_date: time,
    days: [1, 2, 3].map(day => ({ day, day_complete: true, no_distraction_noticed: false })), mode: "prewritten",
    entries: topics.map((topic, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, audit_day: Math.floor(i / 2) + 1,
      source: i % 2 ? "daily_technology" : "practice", topic_trigger: topic, app_content_type: i % 2 ? "Video/social feed" : "", duration_minutes: i % 2 ? [25, 15, 20][Math.floor(i / 2)] : null,
      occurred_at: time, student_category: categories[i], ai_category: null, ai_confirmed: false })) };
}
test("the exact six-entry handoff uses counts, not minutes, and includes zero Other", () => {
  const data = example();
  expect(canSummarize(data)).toBe(true);
  expect(counts(data)).toEqual(CATEGORIES.map(category => ({ category: category.key, count: category.key === "entertainment" ? 2 : category.key === "other" ? 0 : 1,
    percent: category.key === "entertainment" ? 33.3 : category.key === "other" ? 0 : 16.7 })));
});
test("three distinct day records need entries or explicit empty-day confirmation", () => {
  const data = example();
  data.days[2].day_complete = false;
  expect(auditComplete(data)).toBe(false);
  data.days[2] = { day: 3, day_complete: true, no_distraction_noticed: true };
  expect(auditComplete(data)).toBe(false); // Entries conflict with an empty day.
  data.entries = data.entries.filter(entry => entry.audit_day !== 3);
  expect(auditComplete(data)).toBe(true);
  data.days[2].day = 2;
  expect(() => validateModuleGates(data)).toThrow();
});
test("AI proposals need student confirmation; switching mode preserves both choices", () => {
  const data = example();
  data.mode = "live_ai";
  data.entries = data.entries.map(entry => ({ ...entry, ai_category: entry.student_category }));
  expect(canSummarize(data)).toBe(false);
  data.entries = data.entries.map(entry => ({ ...entry, ai_confirmed: true }));
  expect(canSummarize(data)).toBe(false);
  data.ai_proposal_digest = rawAuditFingerprint(data);
  expect(canSummarize(data)).toBe(true);
  expect(counts(data)).toEqual(counts({ ...data, mode: "prewritten" }));
});
test("completion requires all gates, but a concise saved reflection is sufficient", () => {
  const data = example();
  data.step = "completed"; data.completed_at = "2026-11-09T09:00:00Z";
  expect(() => validateModuleGates(data)).toThrow();
  data.summary = { mode: data.mode, fingerprint: auditFingerprint(data), generated_at: data.completed_at, content_version: "1.0.0" };
  data.ethics_card_seen_at = data.completed_at;
  data.sit_elapsed_ms = 119999; data.two_minute_sit_completed_at = data.completed_at; data.notice_reflection = "Chosen vs designed.";
  expect(canComplete(data)).toBe(false);
  data.sit_elapsed_ms = 120000;
  expect(() => validateModuleGates(data)).not.toThrow();
  data.notice_reflection = "  "; expect(canComplete(data)).toBe(false);
});
test("editing raw entries invalidates the old summary and ethics gate without rewriting student text", () => {
  const data = example();
  data.summary = { mode: data.mode, fingerprint: auditFingerprint(data), generated_at: "2026-11-09T09:00:00Z", content_version: "1.0.0" };
  const exact = "  My exact words 😀  ";
  const next = changeEntries(data, data.entries.map((entry, i) => i ? entry : { ...entry, topic_trigger: exact }));
  expect(next.entries[0].topic_trigger).toBe(exact); expect(data.entries[0].topic_trigger).not.toBe(exact);
  expect(next.summary).toBeNull(); expect(next.two_minute_sit_completed_at).toBeNull();
});
