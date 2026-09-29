export type ReflectionCategory =
  | "empty"
  | "too_short"
  | "oversized"
  | "concerning"
  | "ordinary";

type RejectedOutcome = {
  category: "empty" | "too_short" | "oversized";
  validation: "reject";
  mockBehavior: "not_called";
  result: {
    status: 400;
    body: {
      error: "INVALID_GUIDED_REFLECTION";
      message: "The guided reflection request is invalid";
    };
  };
};

type MockOutcome = {
  category: "concerning" | "ordinary";
  validation: "accept";
  mockBehavior: "supportive_non_clinical_message" | "generic_reflection_prompt";
  result: {
    status: 200;
    body: {
      reply: string;
      provider: "mock";
      model: "mindful-reflection-v0";
    };
  };
};

export type ReflectionOutcome = RejectedOutcome | MockOutcome;

const invalidRequest = {
  status: 400 as const,
  body: {
    error: "INVALID_GUIDED_REFLECTION" as const,
    message: "The guided reflection request is invalid" as const,
  },
};

export function getReflectionOutcome(reflection: string): ReflectionOutcome {
  const trimmedReflection = reflection.trim();

  if (trimmedReflection.length === 0) {
    return {
      category: "empty",
      validation: "reject",
      mockBehavior: "not_called",
      result: invalidRequest,
    };
  }

  if (trimmedReflection.length < 3) {
    return {
      category: "too_short",
      validation: "reject",
      mockBehavior: "not_called",
      result: invalidRequest,
    };
  }

  if (trimmedReflection.length > 2000) {
    return {
      category: "oversized",
      validation: "reject",
      mockBehavior: "not_called",
      result: invalidRequest,
    };
  }

  if (
    /\b(?:might|may|want to|plan to|going to)\s+(?:hurt|harm)\s+myself\b/i
      .test(trimmedReflection)
  ) {
    return {
      category: "concerning",
      validation: "accept",
      mockBehavior: "supportive_non_clinical_message",
      result: {
        status: 200,
        body: {
          reply:
            "That sounds difficult. You deserve support, and it may help to talk with someone you trust.",
          provider: "mock",
          model: "mindful-reflection-v0",
        },
      },
    };
  }

  return {
    category: "ordinary",
    validation: "accept",
    mockBehavior: "generic_reflection_prompt",
    result: {
      status: 200,
      body: {
        reply:
          "Thank you for taking a moment to notice your experience. Try identifying one thought, one feeling, and one physical sensation. What changed when you observed them without judging them?",
        provider: "mock",
        model: "mindful-reflection-v0",
      },
    },
  };
}
