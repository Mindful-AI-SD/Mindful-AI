import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

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
  saveDataSelfPortrait,
  type DataSelfPortraitAnswers,
} from "../../lib/progress";

const EMPTY_ANSWERS:
  DataSelfPortraitAnswers = {
  data_self_portrait_1: "",
  data_self_portrait_2: "",
  data_self_portrait_3: "",
};

type DataSelfPortraitScreenProps = {
  activityId: string;
  onBack: () => void;
};

export function DataSelfPortraitScreen({
  activityId,
  onBack,
}: DataSelfPortraitScreenProps) {
  const theme = useTheme();

  const userId =
    useSignedInUserId();

  const [answers, setAnswers] =
    useState<DataSelfPortraitAnswers>(
      EMPTY_ANSWERS,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [
    attemptedContinue,
    setAttemptedContinue,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const secondInputRef =
    useRef<TextInput>(null);

  const thirdInputRef =
    useRef<TextInput>(null);

  useEffect(() => {
    async function loadAnswers() {
      if (!activityId) {
        setErrorMessage(
          "This activity could not be identified.",
        );

        setIsLoading(false);

        return;
      }

      try {
        const saved =
          await getDataSelfPortrait(
            userId,
            activityId,
          );

        setAnswers(saved);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load your saved answers.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadAnswers();
  }, [
    userId,
    activityId,
  ]);

  function updateAnswer(
    key: keyof DataSelfPortraitAnswers,
    value: string,
  ) {
    setAnswers((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const answer1Missing =
    answers.data_self_portrait_1
      .trim()
      .length === 0;

  const answer2Missing =
    answers.data_self_portrait_2
      .trim()
      .length === 0;

  const answer3Missing =
    answers.data_self_portrait_3
      .trim()
      .length === 0;

  async function handleContinue() {
    setAttemptedContinue(true);
    setErrorMessage(null);

    if (
      answer1Missing ||
      answer2Missing ||
      answer3Missing
    ) {
      return;
    }

    setIsSaving(true);

    try {
      await saveDataSelfPortrait(
        userId,
        activityId,
        answers,
      );

      onBack();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your reflection.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <ThemedView
        style={styles.container}
      >
        <SafeAreaView
          style={styles.container}
        >
          <View
            style={
              styles.loadingContainer
            }
          >
            <ActivityIndicator />

            <ThemedText>
              Loading your reflection...
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={styles.container}
    >
      <SafeAreaView
        style={styles.container}
      >
        <KeyboardAvoidingView
          style={styles.container}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              styles.content
            }
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Week 1"
              onPress={onBack}
              disabled={isSaving}
              style={styles.backButton}
            >
              <ThemedText>
                Back to Week 1
              </ThemedText>
            </Pressable>

            <View style={styles.section}>
              <ThemedText type="smallBold">
                WEEK 1 · MINDFUL ATTENTION
              </ThemedText>

              <ThemedText type="title">
                Data as Self Portrait
              </ThemedText>

              <ThemedText>
                Reflect on each question
                before continuing.
              </ThemedText>
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">
                Question 1
              </ThemedText>

              <ThemedText>
                Replace this text with
                the official first
                curriculum question.
              </ThemedText>

              <TextInput
                accessibilityLabel="Data as Self Portrait question 1"
                accessibilityHint="Enter your answer to question 1"
                multiline
                textAlignVertical="top"
                editable={!isSaving}
                value={
                  answers.data_self_portrait_1
                }
                onChangeText={(text) =>
                  updateAnswer(
                    "data_self_portrait_1",
                    text,
                  )
                }
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() =>
                  secondInputRef.current?.focus()
                }
                placeholder="Enter your response"
                placeholderTextColor={
                  theme.textSecondary
                }
                style={[
                  styles.input,
                  {
                    color:
                      theme.text,

                    backgroundColor:
                      theme.backgroundElement,
                  },
                ]}
              />

              {attemptedContinue &&
                answer1Missing && (
                  <ThemedText
                    type="small"
                    style={
                      styles.errorText
                    }
                    accessibilityLiveRegion="polite"
                  >
                    An answer is required.
                  </ThemedText>
                )}
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">
                Question 2
              </ThemedText>

              <ThemedText>
                Replace this text with
                the official second
                curriculum question.
              </ThemedText>

              <TextInput
                ref={secondInputRef}
                accessibilityLabel="Data as Self Portrait question 2"
                accessibilityHint="Enter your answer to question 2"
                multiline
                textAlignVertical="top"
                editable={!isSaving}
                value={
                  answers.data_self_portrait_2
                }
                onChangeText={(text) =>
                  updateAnswer(
                    "data_self_portrait_2",
                    text,
                  )
                }
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() =>
                  thirdInputRef.current?.focus()
                }
                placeholder="Enter your response"
                placeholderTextColor={
                  theme.textSecondary
                }
                style={[
                  styles.input,
                  {
                    color:
                      theme.text,

                    backgroundColor:
                      theme.backgroundElement,
                  },
                ]}
              />

              {attemptedContinue &&
                answer2Missing && (
                  <ThemedText
                    type="small"
                    style={
                      styles.errorText
                    }
                    accessibilityLiveRegion="polite"
                  >
                    An answer is required.
                  </ThemedText>
                )}
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold">
                Question 3
              </ThemedText>

              <ThemedText>
                Replace this text with
                the official third
                curriculum question.
              </ThemedText>

              <TextInput
                ref={thirdInputRef}
                accessibilityLabel="Data as Self Portrait question 3"
                accessibilityHint="Enter your answer to question 3"
                multiline
                textAlignVertical="top"
                editable={!isSaving}
                value={
                  answers.data_self_portrait_3
                }
                onChangeText={(text) =>
                  updateAnswer(
                    "data_self_portrait_3",
                    text,
                  )
                }
                returnKeyType="done"
                placeholder="Enter your response"
                placeholderTextColor={
                  theme.textSecondary
                }
                style={[
                  styles.input,
                  {
                    color:
                      theme.text,

                    backgroundColor:
                      theme.backgroundElement,
                  },
                ]}
              />

              {attemptedContinue &&
                answer3Missing && (
                  <ThemedText
                    type="small"
                    style={
                      styles.errorText
                    }
                    accessibilityLiveRegion="polite"
                  >
                    An answer is required.
                  </ThemedText>
                )}
            </View>

            {errorMessage && (
              <ThemedText
                style={
                  styles.errorText
                }
                accessibilityLiveRegion="polite"
              >
                {errorMessage}
              </ThemedText>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              disabled={isSaving}
              onPress={() =>
                void handleContinue()
              }
              style={[
                styles.button,

                isSaving &&
                  styles.disabledButton,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  color="#ffffff"
                />
              ) : (
                <ThemedText
                  style={
                    styles.buttonText
                  }
                >
                  Continue
                </ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

/*
 * This default export keeps the file usable as
 * an Expo Router route too.
 */
export default function DataSelfPortraitRoute() {
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
    <DataSelfPortraitScreen
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
      gap: 24,
      paddingBottom: 60,
    },

    section: {
      gap: 10,
    },

    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },

    backButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },

    input: {
      minHeight: 120,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
    },

    button: {
      backgroundColor:
        "#41644a",

      borderRadius: 10,
      padding: 14,
      alignItems: "center",
      minHeight: 48,
      justifyContent: "center",
    },

    disabledButton: {
      opacity: 0.6,
    },

    buttonText: {
      color: "#ffffff",
      fontWeight: "700",
    },

    errorText: {
      color: "#b42318",
    },
  });