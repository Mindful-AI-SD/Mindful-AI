// The documented Week 3 Distraction Audit example: a synthetic three-day log
// and the exact audit the mock must produce for it. It is also written out in
// supabase/functions/_shared/providers/activityContracts.md; keep the two in
// step. The log is chosen to exercise a tie in counts, an event no category
// fits, and percentages that only reach 100 through the rounding rule.
import type {
  DistractionAuditSummary,
  DistractionEvent,
} from "../../functions/_shared/providers/types.ts";

export const exampleEvents: DistractionEvent[] = [
  { id: "e1", at: "2026-10-12T09:15:00-04:00", label: "Instagram" },
  { id: "e2", at: "2026-10-12T13:40:00-04:00", label: "group chat" },
  { id: "e3", at: "2026-10-12T21:05:00-04:00", label: "TikTok" },
  { id: "e4", at: "2026-10-13T10:30:00-04:00", label: "YouTube" },
  { id: "e5", at: "2026-10-13T16:20:00-04:00", label: "text from mom" },
  { id: "e6", at: "2026-10-13T22:45:00-04:00", label: "zoned out" },
  { id: "e7", at: "2026-10-14T08:50:00-04:00", label: "Instagram" },
  { id: "e8", at: "2026-10-14T15:10:00-04:00", label: "email" },
];

// 3 + 3 + 1 + 1 = 8 events. Exact shares are 37.5, 37.5, 12.5, 12.5: each is
// rounded down (37, 37, 12, 12 = 98) and the two leftover points go to the
// earliest entries, giving 38 + 38 + 12 + 12 = 100.
export const exampleResult: DistractionAuditSummary = {
  totalEvents: 8,
  categories: [
    { category: "social_media", count: 3, percent: 38 },
    { category: "messaging", count: 3, percent: 38 },
    { category: "entertainment", count: 1, percent: 12 },
  ],
  uncategorized: { count: 1, percent: 12 },
  assignments: [
    { eventId: "e1", category: "social_media" },
    { eventId: "e2", category: "messaging" },
    { eventId: "e3", category: "social_media" },
    { eventId: "e4", category: "entertainment" },
    { eventId: "e5", category: "messaging" },
    { eventId: "e6", category: null },
    { eventId: "e7", category: "social_media" },
    { eventId: "e8", category: "messaging" },
  ],
};
