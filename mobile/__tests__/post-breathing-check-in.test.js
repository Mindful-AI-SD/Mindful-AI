import React from "react";

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

import PostBreathingCheckInScreen from "../src/app/post-breathing-check-in";

import {
  canOpenPostBreathingCheckIn,
  getPostBreathingCheckIn,
  savePostBreathingCheckIn,
} from "../lib/progress";

import {
  supabase,
} from "../lib/supabase";

/*
 * Keep the UI component mocks simple so these tests
 * focus on check-in behavior instead of theme setup.
 */
jest.mock(
  "@/components/themed-text",
  () => {
    const React =
      require("react");

    const {
      Text,
    } =
      require("react-native");

    return {
      ThemedText: ({
        children,
        ...props
      }) =>
        React.createElement(
          Text,
          props,
          children,
        ),
    };
  },
);

jest.mock(
  "@/components/themed-view",
  () => {
    const React =
      require("react");

    const {
      View,
    } =
      require("react-native");

    return {
      ThemedView: ({
        children,
        ...props
      }) =>
        React.createElement(
          View,
          props,
          children,
        ),
    };
  },
);

/*
 * SafeAreaView does not matter for these unit tests,
 * so render it as a normal View.
 */
jest.mock(
  "react-native-safe-area-context",
  () => {
    const React =
      require("react");

    const {
      View,
    } =
      require("react-native");

    return {
      SafeAreaView: ({
        children,
        ...props
      }) =>
        React.createElement(
          View,
          props,
          children,
        ),
    };
  },
);

jest.mock(
  "../lib/progress",
  () => ({
    canOpenPostBreathingCheckIn:
      jest.fn(),

    getPostBreathingCheckIn:
      jest.fn(),

    savePostBreathingCheckIn:
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

const mockedCanOpen =
  canOpenPostBreathingCheckIn;

const mockedGetCheckIn =
  getPostBreathingCheckIn;

const mockedSaveCheckIn =
  savePostBreathingCheckIn;

const mockedGetSession =
  supabase.auth.getSession;

describe(
  "PostBreathingCheckIn navigation boundaries",
  () => {
    beforeEach(() => {
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

      mockedCanOpen
        .mockReset();

      mockedCanOpen
        .mockResolvedValue(
          true,
        );

      mockedGetCheckIn
        .mockReset();

      mockedGetCheckIn
        .mockResolvedValue({
          urge: "",
          note: "",
        });

      mockedSaveCheckIn
        .mockReset();

      mockedSaveCheckIn
        .mockResolvedValue();
    });

    afterEach(
      async () => {
        await cleanup();

        jest.restoreAllMocks();
      },
    );

    test(
      "blocks opening the check-in before breathing is complete",
      async () => {
        mockedCanOpen
          .mockResolvedValue(
            false,
          );

        await render(
          React.createElement(
            PostBreathingCheckInScreen,
          ),
        );

        await waitFor(() => {
          expect(
            mockedCanOpen,
          ).toHaveBeenCalledWith(
            "user-1",
            "activity-1",
          );
        });

        await waitFor(() => {
          expect(
            router.replace,
          ).toHaveBeenCalledWith(
            "/",
          );
        });

        expect(
          mockedGetCheckIn,
        ).not.toHaveBeenCalled();

        expect(
          mockedSaveCheckIn,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "blocks opening the route when activityId is missing",
      async () => {
        __setLocalSearchParams(
          {},
        );

        await render(
          React.createElement(
            PostBreathingCheckInScreen,
          ),
        );

        await waitFor(() => {
          expect(
            router.replace,
          ).toHaveBeenCalledWith(
            "/",
          );
        });

        expect(
          mockedCanOpen,
        ).not.toHaveBeenCalled();

        expect(
          mockedGetCheckIn,
        ).not.toHaveBeenCalled();

        expect(
          mockedSaveCheckIn,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "loads a previously saved check-in",
      async () => {
        mockedGetCheckIn
          .mockResolvedValue({
            urge:
              "yes",

            note:
              "I noticed the urge.",
          });

        const screen =
          await render(
            React.createElement(
              PostBreathingCheckInScreen,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Post-Breathing Check-In",
            ),
          ).toBeTruthy();
        });

        expect(
          mockedCanOpen,
        ).toHaveBeenCalledWith(
          "user-1",
          "activity-1",
        );

        expect(
          mockedGetCheckIn,
        ).toHaveBeenCalledWith(
          "user-1",
          "activity-1",
        );

        expect(
          screen.getByDisplayValue(
            "I noticed the urge.",
          ),
        ).toBeTruthy();

        expect(
          router.replace,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "allows a valid no urge answer and saves it",
      async () => {
        const screen =
          await render(
            React.createElement(
              PostBreathingCheckInScreen,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Post-Breathing Check-In",
            ),
          ).toBeTruthy();
        });

        await act(
          async () => {
            fireEvent.press(
              screen.getByLabelText(
                "No, I did not notice an urge",
              ),
            );
          },
        );

        await act(
          async () => {
            fireEvent.changeText(
              screen.getByLabelText(
                "Optional breathing check-in note",
              ),
              "Felt calmer afterward.",
            );
          },
        );

        await act(
          async () => {
            fireEvent.press(
              screen.getByLabelText(
                "Continue",
              ),
            );

            await Promise.resolve();
          },
        );

        await waitFor(() => {
          expect(
            mockedSaveCheckIn,
          ).toHaveBeenCalledWith(
            "user-1",
            "activity-1",
            {
              urge:
                "no",

              note:
                "Felt calmer afterward.",
            },
          );
        });

        expect(
          mockedSaveCheckIn,
        ).toHaveBeenCalledTimes(
          1,
        );

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
      "duplicate Continue taps create only one check-in save",
      async () => {
        let resolveSave;

        mockedSaveCheckIn
          .mockImplementation(
            () =>
              new Promise(
                (resolve) => {
                  resolveSave =
                    resolve;
                },
              ),
          );

        const screen =
          await render(
            React.createElement(
              PostBreathingCheckInScreen,
            ),
          );

        await waitFor(() => {
          expect(
            screen.getByText(
              "Post-Breathing Check-In",
            ),
          ).toBeTruthy();
        });

        await act(
          async () => {
            fireEvent.press(
              screen.getByLabelText(
                "Yes, I noticed an urge",
              ),
            );
          },
        );

        const continueButton =
          screen.getByLabelText(
            "Continue",
          );

        /*
         * Trigger both presses before the pending
         * save request has resolved.
         */
        await act(
          async () => {
            fireEvent.press(
              continueButton,
            );

            fireEvent.press(
              continueButton,
            );

            await Promise.resolve();
          },
        );

        expect(
          mockedSaveCheckIn,
        ).toHaveBeenCalledTimes(
          1,
        );

        await act(
          async () => {
            resolveSave();

            await Promise.resolve();
            await Promise.resolve();
          },
        );

        await waitFor(() => {
          expect(
            router.replace,
          ).toHaveBeenCalledWith(
            "/",
          );
        });

        expect(
          mockedSaveCheckIn,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);