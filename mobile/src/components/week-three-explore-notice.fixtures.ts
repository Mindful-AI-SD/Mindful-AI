import type { WeekThreeContent, WeekThreeScreenProgress } from "../../lib/week-three-screen";

// Event/progress values copied from Lucas's MIN-214 examples/v1/week-three-progress.json.
// The two example response fields are UI fixtures, NOT Isa's approved copy/keys.
export const WEEK_THREE_CONTENT_FIXTURE: WeekThreeContent = {
  contentVersion: "synthetic-week-3-v1",
  source: { kind: "fixture", reference: "MIN-214 synthetic Week 3 progress; response wording pending MIN-225" },
  explore: { instructions: "Review the recorded tap log. This example response is for testing the screen only.", fields: [
    { key: "example_explore_response", label: "Explore response (example field)", required: true, maxCharacters: 2000 },
  ] },
  notice: { instructions: "Add a closing response. This example field is not an approved curriculum question.", fields: [
    { key: "example_notice_response", label: "Notice response (example field)", required: true, maxCharacters: 2000 },
  ] },
};
export const WEEK_THREE_SLUG_FIXTURE = "example-week-3-distraction-audit";
export const WEEK_THREE_PROGRESS_FIXTURE: WeekThreeScreenProgress = {
  contractVersion: "sprint3-storage/v1", contentVersion: "synthetic-week-3-v1",
  activityId: "00000000-0000-4000-8000-000000000003", revision: 2, eventsRevision: 1,
  status: "in_progress", currentBeat: "practice",
  events: [{ id: "example-tap-1", at: "2026-10-28T16:00:00Z", label: "Synthetic tap" }],
  answers: {}, resumeState: { elapsedActiveMs: 12000, positionMs: null, state: "paused" },
  startedAt: "2026-10-28T15:59:00Z", completedAt: null, completionPolicyVersion: null,
  auditResult: { contractVersion: "distraction-audit-cache/v1", inputEventsRevision: 1,
    inputEvents: [{ id: "example-tap-1", at: "2026-10-28T16:00:00Z", label: "Synthetic tap" }],
    provider: "mock", data: { totalEvents: 1, categories: [], uncategorized: { count: 1, percent: 100 },
      assignments: [{ eventId: "example-tap-1", category: null }] } },
};
