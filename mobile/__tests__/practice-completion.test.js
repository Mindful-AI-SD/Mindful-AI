
import {
  canStartPractice,
  canCompletePractice,
} from "../lib/practice-completion";

const baseConfig = {
  id: "practice-test",
  title: "Test Practice",
  mode: "meditation",
  guidance: {
    type: "guided",
    instructions: ["Follow along."],
  },
  timing: {
    type: "timed",
    durationMs: 60000,
  },
  pauseOnBackground: true,
};

describe("Practice media completion guards", () => {
  test("no-media timed practice completes after duration", () => {
    const config = {
      ...baseConfig,
      media: { type: "none" },
    };

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 30000,
        mediaStatus: "not-required",
      }),
    ).toBe(false);

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "not-required",
      }),
    ).toBe(true);
  });

  test("missing required media blocks start", () => {
    const config = {
      ...baseConfig,
      requiresMedia: true,
      media: {
        type: "audio",
        source: "",
      },
    };

    expect(
      canStartPractice(config, "ready"),
    ).toBe(false);
  });

  test("failed media cannot complete practice", () => {
    const config = {
      ...baseConfig,
      requiresMedia: true,
      media: {
        type: "audio",
        source: "sample-audio.mp3",
      },
    };

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "error",
        hasPlayedMedia: true,
      }),
    ).toBe(false);
  });

  test("loading media cannot start practice", () => {
    const config = {
      ...baseConfig,
      requiresMedia: true,
      media: {
        type: "video",
        source: "sample-video.mp4",
      },
    };

    expect(
      canStartPractice(config, "loading"),
    ).toBe(false);
  });

  test("loaded media without playback cannot complete", () => {
    const config = {
      ...baseConfig,
      requiresMedia: true,
      media: {
        type: "video",
        source: "sample-video.mp4",
      },
    };

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "ready",
        hasPlayedMedia: false,
      }),
    ).toBe(false);
  });

  test("played media completes after full duration", () => {
    const config = {
      ...baseConfig,
      requiresMedia: true,
      media: {
        type: "audio",
        source: "sample-audio.mp3",
      },
    };

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "playing",
        hasPlayedMedia: true,
      }),
    ).toBe(true);
  });

  test("unguided open-ended practice requires Finish", () => {
    const config = {
      ...baseConfig,
      guidance: { type: "unguided" },
      timing: { type: "open-ended" },
      media: { type: "none" },
    };

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "not-required",
      }),
    ).toBe(false);

    expect(
      canCompletePractice({
        config,
        elapsedActiveMs: 60000,
        mediaStatus: "not-required",
        requestedFinish: true,
      }),
    ).toBe(true);
  });

    test(
    "Week 3 cannot complete from elapsed time or manual Finish without an approved policy",
    () => {
      const timedWeekThree = {
        ...baseConfig,
        completionAllowed: false,
        media: { type: "none" },
      };

      expect(
        canStartPractice(
          timedWeekThree,
          "not-required",
        ),
      ).toBe(true);

      expect(
        canCompletePractice({
          config: timedWeekThree,
          elapsedActiveMs: 60000,
          mediaStatus: "not-required",
        }),
      ).toBe(false);

      const openEndedWeekThree = {
        ...timedWeekThree,
        timing: { type: "open-ended" },
      };

      expect(
        canCompletePractice({
          config: openEndedWeekThree,
          elapsedActiveMs: 60000,
          mediaStatus: "not-required",
          requestedFinish: true,
        }),
      ).toBe(false);
    },
  );
});
