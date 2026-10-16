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

// Synthetic media variants only. No requests are made to these locations;
// fixture transcript/credit/alternatives are not sponsor curriculum wording.
export const SAMPLE_WEEK_ONE_WITH_MEDIA = {
  ...SAMPLE_WEEK_ONE,
  beats: [
    SAMPLE_WEEK_ONE.beats[0],
    {
      ...SAMPLE_WEEK_ONE.beats[1],
      media: {
        type: "audio",
        source: {
          kind: "url",
          url: "https://example.invalid/fixture-audio.mp3",
        },
        durationSeconds: 120,
        transcript: {
          kind: "inline",
          text: "Synthetic transcript fixture only.",
        },
        attribution: "Synthetic test fixture credit",
        alternativeInstructions: "Synthetic text alternative fixture only.",
      },
    },
    SAMPLE_WEEK_ONE.beats[2],
    SAMPLE_WEEK_ONE.beats[3],
  ],
} as const satisfies WeekContent;

export const SAMPLE_WEEK_TWO_WITH_MEDIA = {
  ...SAMPLE_WEEK_TWO,
  beats: [
    SAMPLE_WEEK_TWO.beats[0],
    {
      ...SAMPLE_WEEK_TWO.beats[1],
      media: {
        type: "video",
        source: { kind: "reference", id: "fixture:week-two:practice-video" },
        durationSeconds: 90.5,
        transcript: {
          kind: "reference",
          source: { kind: "reference", id: "fixture:week-two:transcript" },
        },
        alternativeInstructions: "Synthetic video alternative fixture only.",
      },
    },
    SAMPLE_WEEK_TWO.beats[2],
    SAMPLE_WEEK_TWO.beats[3],
  ],
} as const satisfies WeekContent;
