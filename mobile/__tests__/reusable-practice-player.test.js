
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import { ReusablePracticePlayer } from "../src/components/reusable-practice-player";

const mockMedia = {
  status: "loading",
};

let mockEmitMediaStatus;

jest.mock("../src/components/practice-media", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return {
    PracticeMediaPlayer: ({
      media,
      onMediaStatusChange,
    }) => {
      React.useEffect(() => {
        mockEmitMediaStatus = onMediaStatusChange;

        if (!media || media.type === "none") {
          onMediaStatusChange("not-required");
        } else if (!media.source) {
          onMediaStatusChange("error");
        } else {
          onMediaStatusChange(mockMedia.status);
        }

        return () => {
          mockEmitMediaStatus = undefined;
        };
      }, [
        media?.type,
        media?.source,
        onMediaStatusChange,
      ]);

      return React.createElement(
        Text,
        null,
        `Mock media: ${media?.type ?? "none"}`,
      );
    },
  };
});

jest.mock("../lib/practice-session-storage", () => ({
  loadPracticeSession: jest.fn(),
  savePracticeSession: jest.fn(),
  clearPracticeSession: jest.fn(),
}));

const {
  loadPracticeSession,
  savePracticeSession,
  clearPracticeSession,
} = require("../lib/practice-session-storage");

const baseConfig = {
  id: "sample-practice",
  title: "Sample Practice",
  mode: "meditation",
  guidance: {
    type: "guided",
    instructions: ["Follow the practice."],
  },
  timing: {
    type: "timed",
    durationMs: 10000,
  },
  pauseOnBackground: true,
};

const audioConfig = {
  ...baseConfig,
  media: {
    type: "audio",
    source: "sample-audio.mp3",
  },
  requiresMedia: true,
};

const videoConfig = {
  ...baseConfig,
  media: {
    type: "video",
    source: "sample-video.mp4",
  },
  requiresMedia: true,
};

async function emitMediaStatus(status) {
  await act(async () => {
    mockMedia.status = status;

    if (mockEmitMediaStatus) {
      mockEmitMediaStatus(status);
    }
  });
}

describe("ReusablePracticePlayer integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockMedia.status = "loading";
    mockEmitMediaStatus = undefined;

    loadPracticeSession.mockResolvedValue(null);
    savePracticeSession.mockResolvedValue(undefined);
    clearPracticeSession.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
  });

  test("missing required audio blocks Start", async () => {
    const onContinue = jest.fn();

    const screen = await render(
      <ReusablePracticePlayer
        config={{
          ...baseConfig,
          media: {
            type: "audio",
            source: "",
          },
          requiresMedia: true,
        }}
        userId="user-1"
        onContinue={onContinue}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Required media is not ready/),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Start",
      }).props.accessibilityState.disabled,
    ).toBe(true);

    expect(onContinue).not.toHaveBeenCalled();
  });

  test("loading video blocks Start", async () => {
    const screen = await render(
      <ReusablePracticePlayer
        config={videoConfig}
        userId="user-1"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Media: loading/),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Start",
      }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  test("failed audio never advances", async () => {
    mockMedia.status = "error";

    const onContinue = jest.fn();

    const screen = await render(
      <ReusablePracticePlayer
        config={audioConfig}
        userId="user-1"
        onContinue={onContinue}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Media: error/),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Start",
      }).props.accessibilityState.disabled,
    ).toBe(true);

    expect(
      screen.queryByRole("button", {
        name: "Continue to check-in",
      }),
    ).toBeNull();

    expect(onContinue).not.toHaveBeenCalled();
  });

  test(
    "unguided practice requires explicit Finish",
    async () => {
      const onContinue = jest.fn(async () => true);

      const screen = await render(
        <ReusablePracticePlayer
          config={{
            ...baseConfig,
            guidance: { type: "unguided" },
            timing: { type: "open-ended" },
            media: { type: "none" },
          }}
          userId="user-1"
          onContinue={onContinue}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Start",
          }).props.accessibilityState.disabled,
        ).toBe(false);
      });

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Start",
        }),
      );

      expect(
        screen.getByText("Current State: running"),
      ).toBeTruthy();

      expect(onContinue).not.toHaveBeenCalled();

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Finish",
        }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Current State: completed"),
        ).toBeTruthy();
      });

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Continue to check-in",
        }),
      );

      await waitFor(() => {
        expect(onContinue).toHaveBeenCalledTimes(1);
      });
    },
  );

  test(
    "Week 3 taps are only accepted while running and save the event contract with active time",
    async () => {
      const screen = await render(
        <ReusablePracticePlayer
          config={{
            ...baseConfig,
            media: { type: "none" },
            distractionTapLabels: ["Planning", "Memory", "Worry", "Other"],
          }}
          userId="user-1"
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Log Planning" })
            .props.accessibilityState.disabled,
        ).toBe(true);
      });

      await fireEvent.press(screen.getByRole("button", { name: "Start" }));
      await waitFor(() => {
        expect(screen.getByText("Current State: running")).toBeTruthy();
      });

      await fireEvent.press(
        screen.getByRole("button", { name: "Log Planning" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Distraction taps recorded: 1 / 300")).toBeTruthy();
      });

      const savedTapSession = savePracticeSession.mock.calls
        .map((call) => call[1])
        .find((session) => session.distractionEvents?.length === 1);

      expect(savedTapSession).toBeTruthy();
      expect(savedTapSession.completed).toBe(false);
      expect(savedTapSession.elapsedActiveMs).toEqual(expect.any(Number));
      expect(savedTapSession.distractionEvents[0]).toEqual({
        id: expect.stringMatching(/^tap-[a-z0-9]+-[a-z0-9]+$/),
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        label: "Planning",
      });
    },
  );

  test(
    "restores saved Week 3 taps and keeps tap controls disabled while paused",
    async () => {
      const event = {
        id: "tap-restore-1",
        at: "2026-11-06T16:00:00.000Z",
        label: "Memory",
      };
      loadPracticeSession.mockResolvedValue({
        session: {
          practiceId: "sample-practice",
          state: "running",
          elapsedActiveMs: 5000,
          startedAt: Date.now() - 30000,
          lastSavedAt: Date.now() - 20000,
          completed: false,
          distractionEvents: [event],
        },
        mediaVerified: false,
      });

      const screen = await render(
        <ReusablePracticePlayer
          config={{
            ...baseConfig,
            media: { type: "none" },
            distractionTapLabels: ["Planning", "Memory", "Worry", "Other"],
          }}
          userId="user-1"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Current State: paused")).toBeTruthy();
        expect(screen.getByText("Distraction taps recorded: 1 / 300")).toBeTruthy();
      });

      expect(
        screen.getByRole("button", { name: "Log Worry" })
          .props.accessibilityState.disabled,
      ).toBe(true);
      expect(screen.getByText(/Most recent tap: Memory/)).toBeTruthy();
    },
  );

  test("early Exit never advances", async () => {
    const onContinue = jest.fn();
    const onExit = jest.fn();

    const screen = await render(
      <ReusablePracticePlayer
        config={{
          ...baseConfig,
          media: { type: "none" },
        }}
        userId="user-1"
        onContinue={onContinue}
        onExit={onExit}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Start",
        }).props.accessibilityState.disabled,
      ).toBe(false);
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Start",
      }),
    );

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Exit",
      }),
    );

    await waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    expect(onContinue).not.toHaveBeenCalled();
    expect(
      savePracticeSession.mock.calls.some((call) => call[1].completed === true),
    ).toBe(false);
  });

  test(
    "media failure during playback pauses the practice",
    async () => {
      mockMedia.status = "ready";

      const onContinue = jest.fn();

      const screen = await render(
        <ReusablePracticePlayer
          config={audioConfig}
          userId="user-1"
          onContinue={onContinue}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Start",
          }).props.accessibilityState.disabled,
        ).toBe(false);
      });

      await fireEvent.press(
        screen.getByRole("button", {
          name: "Start",
        }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Current State: running"),
        ).toBeTruthy();
      });

      await emitMediaStatus("playing");

      await emitMediaStatus("error");

      await waitFor(() => {
        expect(
          screen.getByText("Current State: paused"),
        ).toBeTruthy();
      });

      expect(
        screen.getByRole("button", {
          name: "Resume",
        }).props.accessibilityState.disabled,
      ).toBe(true);

      expect(
        screen.queryByRole("button", {
          name: "Continue to check-in",
        }),
      ).toBeNull();

      expect(onContinue).not.toHaveBeenCalled();
    },
  );

  test(
    "media failure after completion blocks Continue",
    async () => {
      mockMedia.status = "ready";

      const onContinue = jest.fn();

      loadPracticeSession.mockResolvedValue({
        session: {
          practiceId: "sample-practice",
          state: "completed",
          elapsedActiveMs: 10000,
          startedAt: Date.now() - 10000,
          lastSavedAt: Date.now(),
          completed: true,
        },
        mediaVerified: true,
      });

      const screen = await render(
        <ReusablePracticePlayer
          config={videoConfig}
          userId="user-1"
          onContinue={onContinue}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Current State: completed"),
        ).toBeTruthy();
      });

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Continue to check-in",
          }).props.accessibilityState.disabled,
        ).toBe(false);
      });

      await emitMediaStatus("error");

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Continue to check-in",
          }).props.accessibilityState.disabled,
        ).toBe(true);
      });

      expect(onContinue).not.toHaveBeenCalled();
    },
  );

  test(
    "an interrupted saved session restores paused",
    async () => {
      loadPracticeSession.mockResolvedValue({
        session: {
          practiceId: "sample-practice",
          state: "running",
          elapsedActiveMs: 5000,
          startedAt: Date.now() - 30000,
          lastSavedAt: Date.now() - 20000,
          completed: false,
        },
        mediaVerified: false,
      });

      const screen = await render(
        <ReusablePracticePlayer
          config={{
            ...baseConfig,
            media: { type: "none" },
          }}
          userId="user-1"
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Current State: paused"),
        ).toBeTruthy();
      });

      expect(
        screen.getByText("0:05"),
      ).toBeTruthy();

      expect(
        screen.queryByRole("button", {
          name: "Continue to check-in",
        }),
      ).toBeNull();
    },
  );
});
