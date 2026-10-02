import React from "react";

import {
  Alert,
  AppState,
} from "react-native";

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

import {
  router,
  __resetExpoRouterMock,
  __setLocalSearchParams,
} from "expo-router";

import BreathingPlayer from "../src/app/breathing-player";

import {
  completeBreathingStep,
} from "../lib/progress";

import {
  clearBreathingSession,
  loadBreathingSession,
  saveBreathingSession,
} from "../lib/breathing-session-storage";

import {
  supabase,
} from "../lib/supabase";

jest.mock(
  "../lib/progress",
  () => ({
    completeBreathingStep:
      jest.fn(),
  }),
);

jest.mock(
  "../lib/breathing-session-storage",
  () => ({
    clearBreathingSession:
      jest.fn(
        () =>
          Promise.resolve(),
      ),

    loadBreathingSession:
      jest.fn(),

    saveBreathingSession:
      jest.fn(),
  }),
);

jest.mock(
  "../lib/supabase",
  () => ({
    supabase: {
      auth: {
        getSession:
          jest.fn(),
      },
    },
  }),
);

let appStateHandler;

const mockedCompleteBreathingStep =
  completeBreathingStep;

const mockedClearBreathingSession =
  clearBreathingSession;

const mockedLoadBreathingSession =
  loadBreathingSession;

const mockedSaveBreathingSession =
  saveBreathingSession;

const mockedGetSession =
  supabase.auth.getSession;

async function renderReadyPlayer() {
  const screen =
    await render(
      React.createElement(
        BreathingPlayer,
      ),
    );

  await waitFor(() => {
    expect(
      screen.getByText(
        "Current State: idle",
      ),
    ).toBeTruthy();
  });

  return screen;
}

async function press(
  screen,
  text,
) {
  await act(
    async () => {
      fireEvent.press(
        screen.getByText(
          text,
        ),
      );
    },
  );
}

describe(
  "BreathingPlayer state machine",
  () => {
    beforeEach(() => {
      jest.useFakeTimers();

      jest.setSystemTime(
        new Date(
          "2026-10-01T12:00:00.000Z",
        ),
      );

      __resetExpoRouterMock();

      __setLocalSearchParams({
        activityId:
          "activity-1",
      });

      mockedGetSession
        .mockReset();

      mockedGetSession
        .mockResolvedValue({
          data: {
            session: {
              user: {
                id:
                  "user-1",
              },
            },
          },

          error: null,
        });

      mockedLoadBreathingSession
        .mockReset();

      mockedLoadBreathingSession
        .mockResolvedValue(
          null,
        );

      mockedSaveBreathingSession
        .mockReset();

      mockedSaveBreathingSession
        .mockResolvedValue();

      mockedClearBreathingSession
        .mockReset();

      mockedClearBreathingSession
        .mockResolvedValue();

      mockedCompleteBreathingStep
        .mockReset();

      mockedCompleteBreathingStep
        .mockResolvedValue();

      appStateHandler =
        undefined;

      jest
        .spyOn(
          AppState,
          "addEventListener",
        )
        .mockImplementation(
          (
            _eventName,
            listener,
          ) => {
            appStateHandler =
              listener;

            return {
              remove:
                jest.fn(),
            };
          },
        );

      jest
        .spyOn(
          Alert,
          "alert",
        )
        .mockImplementation(
          () => {},
        );
    });

    afterEach(
      async () => {
        jest.clearAllTimers();

        await cleanup();

        jest.useRealTimers();

        jest.restoreAllMocks();
      },
    );

    test(
      "loads in the idle state",
      async () => {
        const screen =
          await renderReadyPlayer();

        expect(
          screen.getByText(
            "Current State: idle",
          ),
        ).toBeTruthy();

        expect(
          screen.getByText(
            "10:00",
          ),
        ).toBeTruthy();

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "starts, pauses, and resumes",
      async () => {
        const screen =
          await renderReadyPlayer();

        await press(
          screen,
          "Start",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Pause",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: paused",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Resume",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "restart resets the session and keeps it running",
      async () => {
        const screen =
          await renderReadyPlayer();

        await press(
          screen,
          "Start",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        await act(
          async () => {
            jest.advanceTimersByTime(
              3000,
            );
          },
        );

        await press(
          screen,
          "Restart",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        expect(
          screen.getByText(
            "10:00",
          ),
        ).toBeTruthy();

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "duplicate Start taps do not restart the session",
      async () => {
        const screen =
          await renderReadyPlayer();

        await press(
          screen,
          "Start",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Start",
        );

        expect(
          screen.getByText(
            "Current State: running",
          ),
        ).toBeTruthy();

        await waitFor(() => {
          const initialSaves =
            mockedSaveBreathingSession
              .mock.calls
              .filter(
                (
                  [
                    ,
                    session,
                  ],
                ) =>
                  session.state ===
                    "running" &&
                  session
                    .accumulatedActiveMs ===
                    0,
              );

          expect(
            initialSaves,
          ).toHaveLength(
            1,
          );
        });

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "backgrounding a running session pauses it",
      async () => {
        const screen =
          await renderReadyPlayer();

        await press(
          screen,
          "Start",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        expect(
          appStateHandler,
        ).toBeDefined();

        await act(
          async () => {
            appStateHandler(
              "background",
            );
          },
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: paused",
            ),
          ).toBeTruthy();
        });

        await waitFor(() => {
          expect(
            mockedSaveBreathingSession,
          ).toHaveBeenCalledWith(
            "user-1",

            expect.objectContaining({
              activityId:
                "activity-1",

              state:
                "paused",
            }),
          );
        });

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "restores a previously running session as paused",
      async () => {
        mockedLoadBreathingSession
          .mockResolvedValue({
            activityId:
              "activity-1",

            startedAt:
              Date.now() -
              5000,

            accumulatedActiveMs:
              5000,

            state:
              "running",

            completed:
              false,

            savedAt:
              Date.now(),
          });

        const screen =
          await render(
            React.createElement(
              BreathingPlayer,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: paused",
            ),
          ).toBeTruthy();
        });

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();

        expect(
          mockedSaveBreathingSession,
        ).toHaveBeenCalledWith(
          "user-1",

          expect.objectContaining({
            activityId:
              "activity-1",

            accumulatedActiveMs:
              5000,

            state:
              "paused",

            completed:
              false,
          }),
        );
      },
    );

    test(
      "early exit clears the saved session without completing",
      async () => {
        const screen =
          await renderReadyPlayer();

        await press(
          screen,
          "Start",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Exit",
        );

        expect(
          Alert.alert,
        ).toHaveBeenCalledTimes(
          1,
        );

        const alertCall =
          Alert.alert.mock.calls[0];

        const buttons =
          alertCall[2];

        const exitButton =
          buttons.find(
            (button) =>
              button.text ===
              "Exit",
          );

        expect(
          exitButton,
        ).toBeDefined();

        await act(
          async () => {
            exitButton.onPress();

            await Promise.resolve();
            await Promise.resolve();
          },
        );

        await waitFor(() => {
          expect(
            mockedClearBreathingSession,
          ).toHaveBeenCalledWith(
            "user-1",
            "activity-1",
          );
        });

        expect(
          mockedCompleteBreathingStep,
        ).not.toHaveBeenCalled();

        await waitFor(() => {
          expect(
            router.replace,
          ).toHaveBeenCalledWith(
            "/",
          );
        });
      },
    );

    test(
      "timer completion saves exactly once and opens the check-in",
      async () => {
        mockedLoadBreathingSession
          .mockResolvedValue({
            activityId:
              "activity-1",

            startedAt:
              Date.now() -
              599900,

            accumulatedActiveMs:
              599900,

            state:
              "running",

            completed:
              false,

            savedAt:
              Date.now(),
          });

        const screen =
          await render(
            React.createElement(
              BreathingPlayer,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: paused",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Resume",
        );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: running",
            ),
          ).toBeTruthy();
        });

        await act(
          async () => {
            jest.advanceTimersByTime(
              500,
            );

            await Promise.resolve();
            await Promise.resolve();
          },
        );

        await waitFor(() => {
          expect(
            mockedCompleteBreathingStep,
          ).toHaveBeenCalledTimes(
            1,
          );
        });

        expect(
          mockedCompleteBreathingStep,
        ).toHaveBeenCalledWith(
          "user-1",
          "activity-1",
        );

        await waitFor(() => {
          expect(
            mockedClearBreathingSession,
          ).toHaveBeenCalledWith(
            "user-1",
            "activity-1",
          );
        });

        await waitFor(() => {
          expect(
            router.replace,
          ).toHaveBeenCalledWith({
            pathname:
              "/post-breathing-check-in",

            params: {
              activityId:
                "activity-1",
            },
          });
        });

        await act(
          async () => {
            jest.advanceTimersByTime(
              5000,
            );

            await Promise.resolve();
          },
        );

        expect(
          mockedCompleteBreathingStep,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    test(
      "duplicate Resume taps near completion still create one completion",
      async () => {
        mockedLoadBreathingSession
          .mockResolvedValue({
            activityId:
              "activity-1",

            startedAt:
              Date.now() -
              599900,

            accumulatedActiveMs:
              599900,

            state:
              "paused",

            completed:
              false,

            savedAt:
              Date.now(),
          });

        const screen =
          await render(
            React.createElement(
              BreathingPlayer,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Current State: paused",
            ),
          ).toBeTruthy();
        });

        await press(
          screen,
          "Resume",
        );

        await press(
          screen,
          "Resume",
        );

        await act(
          async () => {
            jest.advanceTimersByTime(
              500,
            );

            await Promise.resolve();
            await Promise.resolve();
          },
        );

        await waitFor(() => {
          expect(
            mockedCompleteBreathingStep,
          ).toHaveBeenCalledTimes(
            1,
          );
        });

        expect(
          mockedCompleteBreathingStep,
        ).toHaveBeenCalledWith(
          "user-1",
          "activity-1",
        );

        expect(
          mockedCompleteBreathingStep,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);