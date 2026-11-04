// True non-AI exercise content, copied word for word from "Mindful AI True Non AI
// Exercise Content", version 1.0, November 4 2026, owner Isa. Its status is
// "Ready for review": sponsor review is the one open item on its acceptance
// checklist. Do not edit this wording here; change it in the source document and
// raise the version.
//
// This is real learning content for students. It is separate from the mock
// provider's fixtures, which exist only for testing. Nothing in this module may
// import a provider, a model SDK, or anything that makes a network call.
export const NON_AI_CONTENT_VERSION = "1.0.0";
export const PREWRITTEN_PROVIDER_NAME = "prewritten";
export const NON_AI_CONTENT_REVIEW_STATUS = "ready_for_review";

export const PREWRITTEN_LABELS = {
  modeTitle: "Prewritten activity",
  modeDescription:
    "Use examples and prompts written in advance. Your response is not analyzed by AI.",
  disclosure:
    "Prewritten activity. These examples and prompts were written in advance. The app does not analyze or interpret your response, and this activity does not send your response to an AI model.",
  responseScreen:
    "Your words are saved as entered. This activity does not interpret your writing.",
  resultFooter: "Source: Prewritten content, version 1.0",
};

export const WEEK_ONE_CONTENT = {
  instruction: "Choose one, adapt it, or write your own.",
  examples: [
    "Pause before responding.",
    "Notice what is happening in my body.",
    "Name uncertainty without rushing to solve it.",
    "Ask what information is missing.",
    "Choose one deliberate next step.",
    "Protect my attention for a short period.",
    "Compare my first interpretation with another possibility.",
    "Write what I know, what I assume, and what I still need to learn.",
    "Notice when technology is directing my attention.",
    "Return to the question I intended to explore.",
  ],
  reflectionPrompts: [
    "Which example best matches how you want to approach AI this week, and why?",
    "Rewrite the intention in your own words.",
    "What action would show that you followed your intention?",
    "What might make the intention difficult to follow?",
  ],
};

export const WEEK_TWO_CONTENT = {
  vocabulary: [
    {
      area: "Breath",
      words: [
        "steady",
        "shallow",
        "deep",
        "quick",
        "slow",
        "held",
        "easy",
        "restricted",
      ],
    },
    {
      area: "Muscles and tension",
      words: [
        "relaxed",
        "tense",
        "tight",
        "loose",
        "clenched",
        "heavy",
        "light",
        "restless",
      ],
    },
    {
      area: "Temperature",
      words: ["warm", "cool", "hot", "cold", "flushed", "neutral"],
    },
    {
      area: "Movement and energy",
      words: [
        "still",
        "buzzing",
        "tingling",
        "pulsing",
        "vibrating",
        "energized",
        "tired",
      ],
    },
    {
      area: "Pressure and contact",
      words: ["grounded", "supported", "compressed", "open", "numb", "tender"],
    },
    {
      area: "Attention and tone",
      words: ["calm", "uneasy", "alert", "settled", "distracted", "focused"],
    },
  ],
  reflectionPrompts: [
    "Choose three to five words that match what you notice right now.",
    "Where in your body did you notice each sensation?",
    "What changed after the practice, if anything?",
    "What did you observe without needing to explain it?",
  ],
};

export const WEEK_THREE_CONTENT = {
  categories: [
    {
      key: "planning",
      name: "Planning",
      definition: "Attention moved to a future task, decision, or obligation.",
      example: "Thinking about a project deadline.",
    },
    {
      key: "memory",
      name: "Memory",
      definition: "Attention returned to a past event or interaction.",
      example: "Replaying an awkward conversation.",
    },
    {
      key: "worry",
      name: "Worry",
      definition: "Attention focused on a feared or uncertain outcome.",
      example: "Thinking about an upcoming exam.",
    },
    {
      key: "social_comparison",
      name: "Social comparison",
      definition: "Attention evaluated the self against another person.",
      example: "Comparing an internship update with classmates.",
    },
    {
      key: "entertainment",
      name: "Entertainment",
      definition: "Attention moved to media or content mainly for stimulation.",
      example: "Watching short videos after a notification.",
    },
    {
      key: "other",
      name: "Other",
      definition: "None of the listed categories fits.",
      example: "The student supplies no system-generated explanation.",
    },
  ],
  instructions: [
    "Record the distraction in your own words.",
    "Choose the category that best fits your entry. You can change it before completing the summary.",
    "Repeat across the three day audit.",
    "Review the count and percentage summary calculated from your selections.",
    "Respond to the required reflection prompt.",
  ],
  requiredReflection:
    "What patterns surprised you? What felt chosen, and what felt designed?",
  supportingPrompts: [
    "Which distraction category appeared most often?",
    "Which attention pulls felt chosen?",
    "Which felt designed by notifications, feeds, or recommendations?",
    "What is one small change you want to try?",
  ],
};

export type PrewrittenResults = {
  intention_mirror: typeof WEEK_ONE_CONTENT;
  sensation_lexicon: typeof WEEK_TWO_CONTENT;
  distraction_audit: typeof WEEK_THREE_CONTENT;
};

export const PREWRITTEN_RESULTS: PrewrittenResults = {
  intention_mirror: WEEK_ONE_CONTENT,
  sensation_lexicon: WEEK_TWO_CONTENT,
  distraction_audit: WEEK_THREE_CONTENT,
};
