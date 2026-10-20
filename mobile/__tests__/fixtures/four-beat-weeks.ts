import type { WeekContent } from "../../lib/four-beat-curriculum";
import { WEEK_ONE_CONTENT } from "../../lib/week-one-module";

// Contract samples only: not loaded by the app or inserted into Supabase.
export const SAMPLE_WEEK_ONE = WEEK_ONE_CONTENT;
export const SAMPLE_WEEK_TWO = {
  weekNumber: 2,
  title: "Week 2",
  beats: [
    { id: "arrive", title: "Arrive", description: "" },
    { id: "practice", title: "Practice", description: "" },
    { id: "explore", title: "Explore", description: "" },
    { id: "notice", title: "Notice", description: "" },
  ],
  contentSource: {
    kind: "missing-sponsor-content",
    reason:
      "Exact Week 2 sponsor four-beat wording and slide-dependent instructions are not available in this contract sample.",
  },
} as const satisfies WeekContent;
