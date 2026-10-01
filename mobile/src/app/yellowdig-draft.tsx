import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import * as Clipboard from "expo-clipboard";

import {
  ThemedText,
} from "@/components/themed-text";

import {
  ThemedView,
} from "@/components/themed-view";

import {
  useSignedInUserId,
} from "@/components/auth-gate";

import {
  useTheme,
} from "@/hooks/use-theme";

import {
  getDataSelfPortrait,
  getGapReflection,
  type DataSelfPortraitAnswers,
  type GapReflectionAnswers,
  type GeneratedIntention,
} from "../../lib/progress";

type YellowDigDraftScreenProps = {
  activityId: string;
  onBack: () => void;
};

type DraftSourceData = {
  intentions: GeneratedIntention[];
  selfPortrait:
    DataSelfPortraitAnswers;
  gapReflection:
    GapReflectionAnswers;
};

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      data: DraftSourceData;
    }
  | {
      status: "missing";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

function hasText(
  value: string | undefined,
) {
  return Boolean(
    value?.trim().length,
  );
}

function buildDraft(
  data: DraftSourceData,
) {
  const intentionLines =
    data.intentions
      .map(
        (intention, index) =>
          `${index + 1}. ${intention.title}\n${intention.explanation}`,
      )
      .join("\n\n");

  return [
    "Week 1 Reflection",
    "",
    "This week, I reflected on mindful attention, the way my data can act as a self portrait, and the difference between AI-generated observations and my own perspective.",
    "",
    "My intentions:",
    intentionLines,
    "",
    "Data as Self Portrait reflections:",
    "",
    data.selfPortrait
      .data_self_portrait_1,
    "",
    data.selfPortrait
      .data_self_portrait_2,
    "",
    data.selfPortrait
      .data_self_portrait_3,
    "",
    "AI Gap reflection:",
    "",
    `What the AI got right:\n${data.gapReflection.ai_gap_got_right}`,
    "",
    `What the AI missed:\n${data.gapReflection.ai_gap_missed}`,
    "",
    `What this reveals:\n${data.gapReflection.ai_gap_reveals}`,
  ].join("\n");
}

export function YellowDigDraftScreen({
  activityId,
  onBack,
}: YellowDigDraftScreenProps) {
  const theme = useTheme();

  const userId =
    useSignedInUserId();

  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
    });

  const [
    copiedMessage,
    setCopiedMessage,
  ] = useState("");

  useEffect(() => {
    async function loadDraftData() {
      if (!activityId) {
        setLoadState({
          status: "error",
          message:
            "This activity could not be identified. Return to Week 1 and try again.",
        });

        return;
      }

      setLoadState({
        status: "loading",
      });

      setCopiedMessage("");

      try {
        const [
          gapReflection,
          selfPortrait,
        ] = await Promise.all([
          getGapReflection(
            userId,
            activityId,
          ),

          getDataSelfPortrait(
            userId,
            activityId,
          ),
        ]);

        const missingSections: string[] =
          [];

        if (
          !gapReflection.intentions ||
          gapReflection.intentions
            .length !== 3
        ) {
          missingSections.push(
            "Intention Mirror",
          );
        }

        const selfPortraitComplete =
          hasText(
            selfPortrait
              .data_self_portrait_1,
          ) &&
          hasText(
            selfPortrait
              .data_self_portrait_2,
          ) &&
          hasText(
            selfPortrait
              .data_self_portrait_3,
          );

        if (!selfPortraitComplete) {
          missingSections.push(
            "Data as Self Portrait",
          );
        }

        const gapComplete =
          hasText(
            gapReflection.answers
              .ai_gap_got_right,
          ) &&
          hasText(
            gapReflection.answers
              .ai_gap_missed,
          ) &&
          hasText(
            gapReflection.answers
              .ai_gap_reveals,
          );

        if (!gapComplete) {
          missingSections.push(
            "AI Gap Reflection",
          );
        }

        if (
          missingSections.length > 0
        ) {
          setLoadState({
            status: "missing",

            message:
              `Your YellowDig draft is missing required saved information from: ${missingSections.join(
                ", ",
              )}. Return to Week 1, complete those activities, and then open the draft again.`,
          });

          return;
        }

        setLoadState({
          status: "ready",

          data: {
            intentions:
              gapReflection.intentions!,

            selfPortrait,

            gapReflection:
              gapReflection.answers,
          },
        });
      } catch (error) {
        setLoadState({
          status: "error",

          message:
            error instanceof Error
              ? error.message
              : "Could not load the saved information needed for your draft.",
        });
      }
    }

    void loadDraftData();
  }, [
    activityId,
    userId,
  ]);

  const draft = useMemo(() => {
    if (
      loadState.status !==
      "ready"
    ) {
      return "";
    }

    return buildDraft(
      loadState.data,
    );
  }, [loadState]);

  async function handleCopy() {
    if (!draft) {
      return;
    }

    try {
      await Clipboard.setStringAsync(
        draft,
      );

      setCopiedMessage(
        "Draft copied to clipboard.",
      );
    } catch {
      setCopiedMessage(
        "Could not copy the draft. Please try again.",
      );
    }
  }

  return (
    <ThemedView
      style={styles.container}
    >
      <SafeAreaView
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Week 1"
            onPress={onBack}
            style={styles.backButton}
          >
            <ThemedText>
              Back to Week 1
            </ThemedText>
          </Pressable>

          <View
            style={styles.section}
          >
            <ThemedText type="smallBold">
              WEEK 1 · MINDFUL ATTENTION
            </ThemedText>

            <ThemedText type="title">
              YellowDig Draft
            </ThemedText>

            <ThemedText>
              Review your draft below.
              You can select the text
              manually or copy the full
              draft to your clipboard.
            </ThemedText>

            <ThemedText
              type="small"
              style={styles.notice}
            >
              Copying this draft does
              not post or submit
              anything to YellowDig or
              any other external
              service.
            </ThemedText>
          </View>

          {loadState.status ===
            "loading" && (
            <View
              style={
                styles.loadingContainer
              }
            >
              <ActivityIndicator />

              <ThemedText>
                Building your draft...
              </ThemedText>
            </View>
          )}

          {loadState.status ===
            "missing" && (
            <ThemedView
              style={
                styles.recoveryCard
              }
            >
              <ThemedText type="subtitle">
                More information is
                needed
              </ThemedText>

              <ThemedText>
                {
                  loadState.message
                }
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                style={
                  styles.secondaryButton
                }
              >
                <ThemedText
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Return to Week 1
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {loadState.status ===
            "error" && (
            <ThemedView
              style={
                styles.recoveryCard
              }
            >
              <ThemedText type="subtitle">
                Could not build draft
              </ThemedText>

              <ThemedText>
                {
                  loadState.message
                }
              </ThemedText>

              <ThemedText>
                Return to Week 1 and
                try opening the draft
                again.
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                style={
                  styles.secondaryButton
                }
              >
                <ThemedText
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Return to Week 1
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {loadState.status ===
            "ready" && (
            <>
              <View
                style={styles.section}
              >
                <ThemedText type="subtitle">
                  Your draft
                </ThemedText>

                <Text
                  selectable
                  accessibilityLabel="YellowDig draft text"
                  style={[
                    styles.draftText,

                    {
                      color:
                        theme.text,

                      backgroundColor:
                        theme.backgroundElement,
                    },
                  ]}
                >
                  {draft}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy YellowDig draft"
                onPress={() =>
                  void handleCopy()
                }
                style={({
                  pressed,
                }) => [
                  styles.copyButton,

                  pressed &&
                    styles.buttonPressed,
                ]}
              >
                <ThemedText
                  style={
                    styles.copyButtonText
                  }
                >
                  Copy draft
                </ThemedText>
              </Pressable>

              {copiedMessage && (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={
                    copiedMessage ===
                    "Draft copied to clipboard."
                      ? styles.successText
                      : styles.errorText
                  }
                >
                  {copiedMessage}
                </ThemedText>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/*
 * Keeps this file usable as an Expo
 * Router route as well as an inline
 * curriculum screen.
 */
export default function YellowDigDraftRoute() {
  const params =
    useLocalSearchParams<{
      activityId?: string;
    }>();

  const activityId =
    typeof params.activityId ===
    "string"
      ? params.activityId
      : "";

  return (
    <YellowDigDraftScreen
      activityId={activityId}
      onBack={() =>
        router.replace("/")
      }
    />
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    content: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      padding: 24,
      paddingBottom: 60,
      gap: 24,
    },

    section: {
      gap: 12,
    },

    backButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },

    notice: {
      opacity: 0.75,
      lineHeight: 20,
    },

    loadingContainer: {
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 48,
    },

    recoveryCard: {
      gap: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: "#d5a3a3",
      borderRadius: 16,
    },

    draftText: {
      borderRadius: 14,
      padding: 18,
      fontSize: 16,
      lineHeight: 24,
    },

    copyButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor:
        "#41644a",
    },

    copyButtonText: {
      color: "#ffffff",
      fontWeight: "700",
    },

    secondaryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor:
        "#41644a",
    },

    secondaryButtonText: {
      color: "#ffffff",
      fontWeight: "700",
    },

    buttonPressed: {
      opacity: 0.8,
    },

    successText: {
      color: "#41644a",
      fontWeight: "600",
    },

    errorText: {
      color: "#b42318",
    },
  });