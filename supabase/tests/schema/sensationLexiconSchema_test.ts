import {
  sensationLexiconMatchesRequest,
  sensationLexiconResponseSchema,
  sensationLexiconSchema,
} from "../../schema/sensationLexiconSchema.ts";

const request = {
  activityId: "6f1c2b9e-5a7d-4e3f-9b1a-2c4d6e8f0a1b",
  activityContext: "Sensation Lexicon",
  sensations: ["tight shoulders", "weird", "warm hands"],
};

const response = {
  items: [
    { original: "tight shoulders", isVague: false, suggestions: [] },
    { original: "weird", isVague: true, suggestions: ["tingling", "buzzing"] },
    { original: "warm hands", isVague: false, suggestions: [] },
  ],
  provider: "mock",
};

function withItem(index: number, item: unknown) {
  return {
    ...response,
    items: response.items.map((existing, i) => i === index ? item : existing),
  };
}

const cases = [
  {
    name:
      "accepts a request with an activity UUID, context, and three sensations",
    schema: sensationLexiconSchema,
    value: request,
    valid: true,
  },
  {
    name: "accepts sensations at the 2 and 80 character boundaries",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: ["ok", "x".repeat(80), "warm hands"] },
    valid: true,
  },
  {
    name: "rejects an empty sensation",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: ["tight shoulders", "   ", "warm hands"] },
    valid: false,
  },
  {
    name: "rejects a too-short sensation",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: ["tight shoulders", "x", "warm hands"] },
    valid: false,
  },
  {
    name: "rejects an over-limit sensation",
    schema: sensationLexiconSchema,
    value: {
      ...request,
      sensations: ["tight shoulders", "x".repeat(81), "warm hands"],
    },
    valid: false,
  },
  {
    name: "rejects fewer than three sensations",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: request.sensations.slice(0, 2) },
    valid: false,
  },
  {
    name: "rejects more than three sensations",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: [...request.sensations, "cold feet"] },
    valid: false,
  },
  {
    name: "rejects a non-string sensation",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: ["tight shoulders", 7, "warm hands"] },
    valid: false,
  },
  {
    name: "rejects sensations sent as one string",
    schema: sensationLexiconSchema,
    value: { ...request, sensations: "tight shoulders, weird, warm hands" },
    valid: false,
  },
  {
    name: "rejects a missing sensations field",
    schema: sensationLexiconSchema,
    value: {
      activityId: request.activityId,
      activityContext: request.activityContext,
    },
    valid: false,
  },
  {
    name: "rejects a slug activity ID",
    schema: sensationLexiconSchema,
    value: { ...request, activityId: "week-2-sensation-lexicon" },
    valid: false,
  },
  {
    name: "rejects client-supplied items in the request",
    schema: sensationLexiconSchema,
    value: { ...request, items: response.items },
    valid: false,
  },
  {
    name: "rejects a client-supplied user ID",
    schema: sensationLexiconSchema,
    value: { ...request, userId: "6f1c2b9e-5a7d-4e3f-9b1a-2c4d6e8f0a1b" },
    valid: false,
  },
  {
    name: "accepts three complete items",
    schema: sensationLexiconResponseSchema,
    value: response,
    valid: true,
  },
  {
    name: "accepts five suggestions for a vague item",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["tingling", "buzzing", "prickly", "fluttery", "floaty"],
    }),
    valid: true,
  },
  {
    name: "rejects fewer than three items",
    schema: sensationLexiconResponseSchema,
    value: { ...response, items: response.items.slice(0, 2) },
    valid: false,
  },
  {
    name: "rejects more than three items",
    schema: sensationLexiconResponseSchema,
    value: { ...response, items: [...response.items, response.items[0]] },
    valid: false,
  },
  {
    name: "rejects a missing provider",
    schema: sensationLexiconResponseSchema,
    value: { items: response.items },
    valid: false,
  },
  {
    name: "rejects an extra top-level field",
    schema: sensationLexiconResponseSchema,
    value: { ...response, model: "mindful-reflection-v0" },
    valid: false,
  },
  {
    name: "rejects an item with an extra field",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["tingling"],
      cause: "poor sleep",
    }),
    valid: false,
  },
  {
    name: "rejects an item missing isVague",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, { original: "weird", suggestions: ["tingling"] }),
    valid: false,
  },
  {
    name: "rejects a non-boolean isVague",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: "yes",
      suggestions: ["tingling"],
    }),
    valid: false,
  },
  {
    name: "rejects suggestions that are not an array",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: "tingling",
    }),
    valid: false,
  },
  {
    name: "rejects a blank suggestion",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: [" "],
    }),
    valid: false,
  },
  {
    name: "rejects an over-limit suggestion",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["x".repeat(41)],
    }),
    valid: false,
  },
  {
    name: "rejects more than five suggestions",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["a", "b", "c", "d", "e", "f"],
    }),
    valid: false,
  },
  {
    name: "rejects suggestions on an item that is not vague",
    schema: sensationLexiconResponseSchema,
    value: withItem(0, {
      original: "tight shoulders",
      isVague: false,
      suggestions: ["stiff"],
    }),
    valid: false,
  },
  {
    name: "rejects a vague item with no suggestions",
    schema: sensationLexiconResponseSchema,
    value: withItem(1, { original: "weird", isVague: true, suggestions: [] }),
    valid: false,
  },
  {
    name: "rejects a blank original",
    schema: sensationLexiconResponseSchema,
    value: withItem(0, { original: " ", isVague: false, suggestions: [] }),
    valid: false,
  },
];

for (const testCase of cases) {
  Deno.test(`sensation lexicon schema: ${testCase.name}`, () => {
    const result = testCase.schema.safeParse(testCase.value);

    if (result.success !== testCase.valid) {
      throw new Error(
        `${testCase.name}: expected valid=${testCase.valid}`,
      );
    }
  });
}

const sensations = sensationLexiconSchema.parse(request).sensations;

const matchCases = [
  {
    name: "accepts a response that echoes the request",
    value: response,
    matches: true,
  },
  {
    name: "rejects a reworded original",
    value: withItem(0, {
      original: "tense shoulders",
      isVague: false,
      suggestions: [],
    }),
    matches: false,
  },
  {
    name: "rejects items returned in a different order",
    value: {
      ...response,
      items: [response.items[2], response.items[1], response.items[0]],
    },
    matches: false,
  },
  {
    name: "rejects a suggestion that repeats the original",
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["Weird", "tingling"],
    }),
    matches: false,
  },
  {
    name: "rejects duplicate suggestions",
    value: withItem(1, {
      original: "weird",
      isVague: true,
      suggestions: ["tingling", "Tingling"],
    }),
    matches: false,
  },
];

for (const testCase of matchCases) {
  Deno.test(`sensation lexicon request check: ${testCase.name}`, () => {
    const parsed = sensationLexiconResponseSchema.parse(testCase.value);

    if (
      sensationLexiconMatchesRequest(sensations, parsed) !== testCase.matches
    ) {
      throw new Error(`${testCase.name}: expected matches=${testCase.matches}`);
    }
  });
}
