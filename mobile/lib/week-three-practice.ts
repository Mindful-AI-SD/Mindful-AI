import type { ModulePractice } from "./module-practice";

/** Sponsor-supplied Week 3 breath-anchor recording. Completing this Practice
 * unlocks Explore only; it does not award Week 3 completion. */
export const WEEK_THREE_PRACTICE: ModulePractice = {
  id: "week-3-breath-anchor-v1",
  title: "Breath anchor",
  instructions:
    "Follow the breath as your anchor. When attention wanders, gently label the experience—such as planning, memory, or worry—and return to the breath.",
  media: {
    type: "audio",
    source: {
      kind: "url",
      url: "https://hfqzbvsftjgvzkixgvdy.supabase.co/storage/v1/object/public/practice-media/week-3-breath-anchor.mp3",
    },
    durationSeconds: 769.28,
    attribution: "Guided practice supplied by the AIM-YA sponsor.",
    alternativeInstructions:
      "Use the breath as an anchor. When attention wanders, silently name the wandering as planning, memory, worry, or another fitting label. Then return attention to the breath without judging yourself.",
  },
};
