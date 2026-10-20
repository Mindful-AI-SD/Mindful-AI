import {
  BEAT_IDS,
  BEAT_TITLES,
  isWeekBeatAnswers,
  isWeekContent,
} from "../lib/four-beat-curriculum";
import {
  WEEK_ONE_BEATS,
  WEEK_ONE_STEP_BEATS,
  weekOneBeatId,
} from "../lib/week-one-module";
import { SAMPLE_WEEK_ONE, SAMPLE_WEEK_TWO } from "./fixtures/four-beat-weeks";

import { WEEK_ONE_STEPS } from "../lib/progress";

jest.mock("../lib/supabase", () => ({ supabase: {} }));

const ratings = { arrive_mood: "3", arrive_energy: "4" };

test("canonical IDs, labels and Week 1/2 sample records share the ordered contract", () => {
  expect(BEAT_IDS).toEqual(["arrive", "practice", "explore", "notice"]);
  expect(BEAT_IDS.map((id) => BEAT_TITLES[id])).toEqual([
    "Arrive",
    "Practice",
    "Explore",
    "Notice",
  ]);
  for (const week of [SAMPLE_WEEK_ONE, SAMPLE_WEEK_TWO]) {
    expect(isWeekContent(week)).toBe(true);
    expect(week.beats.map((beat) => beat.id)).toEqual(BEAT_IDS);
  }
  expect(SAMPLE_WEEK_ONE.beats).toBe(WEEK_ONE_BEATS);
  expect(SAMPLE_WEEK_ONE.contentSource.kind).toBe("existing-implementation");
  expect(SAMPLE_WEEK_TWO.contentSource.kind).toBe("missing-sponsor-content");
  expect(SAMPLE_WEEK_TWO.beats.every((beat) => beat.description === "")).toBe(
    true,
  );
});

test.each([
  ["reordered", { ...SAMPLE_WEEK_ONE, beats: [...WEEK_ONE_BEATS].reverse() }],
  ["missing", { ...SAMPLE_WEEK_ONE, beats: WEEK_ONE_BEATS.slice(0, 3) }],
  ["duplicate", {
    ...SAMPLE_WEEK_ONE,
    beats: [...WEEK_ONE_BEATS.slice(0, 3), WEEK_ONE_BEATS[0]],
  }],
  ["legacy reflection ID", {
    ...SAMPLE_WEEK_ONE,
    beats: [...WEEK_ONE_BEATS.slice(0, 3), {
      ...WEEK_ONE_BEATS[3],
      id: "reflection",
    }],
  }],
  ["incorrect canonical title", {
    ...SAMPLE_WEEK_ONE,
    beats: [...WEEK_ONE_BEATS.slice(0, 3), {
      ...WEEK_ONE_BEATS[3],
      title: "Reflection",
    }],
  }],
  ["unmarked missing content", {
    ...SAMPLE_WEEK_TWO,
    contentSource: SAMPLE_WEEK_ONE.contentSource,
  }],
  ["invented placeholder instructions", {
    ...SAMPLE_WEEK_TWO,
    beats: WEEK_ONE_BEATS,
  }],
  ["empty source", {
    ...SAMPLE_WEEK_ONE,
    contentSource: { kind: "existing-implementation", reference: "" },
  }],
  ["unknown week", { ...SAMPLE_WEEK_ONE, weekNumber: 9 }],
  ["fractional week", { ...SAMPLE_WEEK_ONE, weekNumber: 1.5 }],
  ["non-object", null],
])("rejects %s week content", (_label, value) => {
  expect(isWeekContent(value)).toBe(false);
});

const legacyMappings = [
  ["breathing", "practice"],
  ["post_breathing_check_in", "practice"],
  ["writing", "explore"],
  ["intention_mirror", "explore"],
  ["data_self_portrait", "notice"],
  ["ai_gap_reflection", "notice"],
  ["yellowdig_draft", "notice"],
  ["completed", "notice"],
];

test.each(legacyMappings)(
  "legacy %s projects to %s without changing answers",
  (step, beat) => {
    const answers = Object.freeze({
      ...ratings,
      earlier_answer: "Preserve me",
    });
    expect(weekOneBeatId(step, answers)).toBe(beat);
    expect(weekOneBeatId(step)).toBe(beat);
    expect(answers.earlier_answer).toBe("Preserve me");
  },
);

test("mapping covers every existing persisted step and keeps the Arrive override", () => {
  expect(WEEK_ONE_STEPS).toEqual(
    legacyMappings.map(([step]) => step).filter((step) =>
      step !== "yellowdig_draft"
    ),
  );
  expect(Object.keys(WEEK_ONE_STEP_BEATS)).toEqual(
    legacyMappings.map(([step]) => step),
  );
  for (const [step] of legacyMappings) {
    expect(weekOneBeatId(step, {})).toBe(
      step === "completed" ? "notice" : "arrive",
    );
    expect(weekOneBeatId(step, { arrive_mood: "2" })).toBe(
      step === "completed" ? "notice" : "arrive",
    );
  }
});

test("logical beat answers preserve strings/empty drafts and do not reuse the legacy flat row shape", () => {
  expect(isWeekBeatAnswers({})).toBe(true);
  expect(
    isWeekBeatAnswers({
      arrive: ratings,
      notice: { answer: "", earlier_answer: "keep" },
    }),
  ).toBe(true);
  for (
    const value of [
      null,
      [],
      { reflection: {} },
      { notice: [] },
      { notice: null },
      { arrive: { mood: 3 } },
      { explore: { writing: {} } },
      { notice: { "": "answer" } },
      ratings,
    ]
  ) {
    expect(isWeekBeatAnswers(value)).toBe(false);
  }
});
