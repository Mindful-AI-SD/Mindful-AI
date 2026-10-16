import { isCurriculumMedia, isMediaSource } from "../lib/curriculum-media";
import {
  BEAT_IDS,
  isWeekContent,
  parseWeekContent,
} from "../lib/four-beat-curriculum";
import {
  SAMPLE_WEEK_ONE,
  SAMPLE_WEEK_ONE_WITH_MEDIA,
  SAMPLE_WEEK_TWO,
  SAMPLE_WEEK_TWO_WITH_MEDIA,
} from "./fixtures/four-beat-weeks";

const audio = SAMPLE_WEEK_ONE_WITH_MEDIA.beats[1].media;
const video = SAMPLE_WEEK_TWO_WITH_MEDIA.beats[1].media;
function weekWith(media) {
  return {
    ...SAMPLE_WEEK_ONE,
    beats: [
      SAMPLE_WEEK_ONE.beats[0],
      { ...SAMPLE_WEEK_ONE.beats[1], media },
      SAMPLE_WEEK_ONE.beats[2],
      SAMPLE_WEEK_ONE.beats[3],
    ],
  };
}

test.each([SAMPLE_WEEK_ONE, SAMPLE_WEEK_TWO])(
  "existing Week $weekNumber content loads without media",
  (week) => {
    const loaded = parseWeekContent(JSON.parse(JSON.stringify(week)));
    expect(loaded).toEqual(week);
    expect(loaded.beats.every((beat) => beat.media === undefined)).toBe(true);
  },
);

test.each([SAMPLE_WEEK_ONE_WITH_MEDIA, SAMPLE_WEEK_TWO_WITH_MEDIA])(
  "Week $weekNumber media loads through the curriculum model without changing beat order",
  (week) => {
    const before = JSON.stringify(week);
    const loaded = parseWeekContent(JSON.parse(before));
    expect(isWeekContent(loaded)).toBe(true);
    expect(loaded.beats[1].media).toEqual(week.beats[1].media);
    expect(loaded.beats.map((beat) => beat.id)).toEqual(BEAT_IDS);
    expect(loaded.beats.map((beat) => beat.title)).toEqual([
      "Arrive",
      "Practice",
      "Explore",
      "Notice",
    ]);
    expect(loaded.beats.filter((beat) => beat.media !== undefined))
      .toHaveLength(1);
    expect(JSON.stringify(week)).toBe(before);
  },
);

test("audio and video metadata validate independently of player configuration", () => {
  expect(isCurriculumMedia(audio)).toBe(true);
  expect(isCurriculumMedia(video)).toBe(true);
  expect(
    isCurriculumMedia({
      type: "audio",
      source: { kind: "reference", id: "fixture:audio" },
    }),
  ).toBe(true);
});

test("transcript, duration, credit and text alternatives are optional and preserve supplied values", () => {
  const minimal = { type: "video", source: video.source };
  expect(isCurriculumMedia(minimal)).toBe(true);
  for (
    const optional of [
      { transcript: { kind: "inline", text: "Synthetic transcript." } },
      {
        transcript: {
          kind: "reference",
          source: {
            kind: "url",
            url: "https://example.invalid/transcript.txt",
          },
        },
      },
      { attribution: "Synthetic credit" },
      { alternativeInstructions: "Synthetic text alternative." },
      { durationSeconds: 0.5 },
    ]
  ) {
    const media = { ...minimal, ...optional };
    expect(isCurriculumMedia(media)).toBe(true);
    expect(parseWeekContent(weekWith(media)).beats[1].media).toEqual(media);
  }
});

test.each([
  ["null metadata", null],
  ["array metadata", []],
  ["empty metadata", {}],
  ["unknown media type", { ...audio, type: "image" }],
  ["missing source", { type: "audio" }],
  ["negative duration", { ...audio, durationSeconds: -1 }],
  ["zero duration", { ...audio, durationSeconds: 0 }],
  ["string duration", { ...audio, durationSeconds: "120" }],
  ["null duration", { ...audio, durationSeconds: null }],
  ["NaN duration", { ...audio, durationSeconds: NaN }],
  ["infinite duration", { ...audio, durationSeconds: Infinity }],
  ["bare source string", {
    ...audio,
    source: "https://example.invalid/audio.mp3",
  }],
  ["null source", { ...audio, source: null }],
  ["unknown source kind", {
    ...audio,
    source: { kind: "storage", bucket: "private" },
  }],
  ["blank source reference", {
    ...audio,
    source: { kind: "reference", id: " " },
  }],
  ["malformed URL", { ...audio, source: { kind: "url", url: "not a URL" } }],
  ["relative URL", {
    ...audio,
    source: { kind: "url", url: "/media/audio.mp3" },
  }],
  ["insecure URL", {
    ...audio,
    source: { kind: "url", url: "http://example.invalid/audio.mp3" },
  }],
  ["executable URL", {
    ...audio,
    source: { kind: "url", url: "javascript:alert(1)" },
  }],
  ["credentials in URL", {
    ...audio,
    source: {
      kind: "url",
      url: "https://user:password@example.invalid/audio.mp3",
    },
  }],
  ["inline transcript without text", {
    ...audio,
    transcript: { kind: "inline" },
  }],
  ["transcript reference without source", {
    ...audio,
    transcript: { kind: "reference" },
  }],
  ["invalid transcript URL", {
    ...audio,
    transcript: {
      kind: "reference",
      source: { kind: "url", url: "file:///secret" },
    },
  }],
  ["null transcript", { ...audio, transcript: null }],
  ["blank credit", { ...audio, attribution: " " }],
  ["non-text alternative", { ...audio, alternativeInstructions: ["text"] }],
  ["blank alternative", { ...audio, alternativeInstructions: " " }],
  ["administrative field", {
    ...audio,
    uploadUrl: "https://example.invalid/admin",
  }],
  ["source authorization headers", {
    ...audio,
    source: { ...audio.source, headers: { authorization: "fixture-secret" } },
  }],
])("rejects %s cleanly at media and week boundaries", (_label, media) => {
  expect(isCurriculumMedia(media)).toBe(false);
  expect(isWeekContent(weekWith(media))).toBe(false);
  expect(() => parseWeekContent(weekWith(media))).toThrow(
    "The curriculum configuration is invalid.",
  );
});

test("malformed metadata is rejected on any beat, including missing-content samples", () => {
  for (let index = 0; index < 4; index++) {
    const week = {
      ...SAMPLE_WEEK_TWO,
      beats: SAMPLE_WEEK_TWO.beats.map((beat, i) =>
        i === index ? { ...beat, media: {} } : beat
      ),
    };
    expect(isWeekContent(week)).toBe(false);
  }
  expect(isMediaSource({ kind: "url", url: 42 })).toBe(false);
  expect(isMediaSource({ kind: "reference", id: "fixture", upload: true }))
    .toBe(false);
  expect(() => parseWeekContent(null)).toThrow(
    "The curriculum configuration is invalid.",
  );
});
