import {
  aiActivityRequestSchema,
  aiActivityResponseMatchesRequest,
  aiActivityResponseSchema,
} from "../../schema/aiActivitySchema.ts";

const common = {
  activityId: "6f1c2b9e-5a7d-4e3f-9b1a-2c4d6e8f0a1b",
  activityContext: "Explore lab",
};

const mirrorRequest = {
  kind: "intention_mirror",
  ...common,
  input: { reflection: "I noticed my breathing slow down." },
};

const lexiconRequest = {
  kind: "sensation_lexicon",
  ...common,
  input: { sensations: ["tight shoulders", "weird", "warm hands"] },
};

const intentions = [
  { title: "Pause", explanation: "Take a breath before reacting." },
  { title: "Notice", explanation: "Observe a feeling without judgment." },
  { title: "Choose", explanation: "Choose a thoughtful next step." },
];

const items = [
  { original: "tight shoulders", isVague: false, suggestions: [] },
  { original: "weird", isVague: true, suggestions: ["tingling", "buzzing"] },
  { original: "warm hands", isVague: false, suggestions: [] },
];

const mirrorResponse = {
  kind: "intention_mirror",
  provider: "mock",
  result: { intentions },
};

const lexiconResponse = {
  kind: "sensation_lexicon",
  provider: "mock",
  result: { items },
};

const cases = [
  {
    name: "accepts an intention_mirror request",
    schema: aiActivityRequestSchema,
    value: mirrorRequest,
    valid: true,
  },
  {
    name: "accepts a sensation_lexicon request",
    schema: aiActivityRequestSchema,
    value: lexiconRequest,
    valid: true,
  },
  {
    name: "accepts reflections at the 3 and 2000 character boundaries",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, input: { reflection: "x".repeat(2000) } },
    valid: true,
  },
  {
    name: "rejects a missing kind",
    schema: aiActivityRequestSchema,
    value: { ...common, input: lexiconRequest.input },
    valid: false,
  },
  {
    name: "rejects an unknown kind",
    schema: aiActivityRequestSchema,
    value: { ...lexiconRequest, kind: "distraction_audit" },
    valid: false,
  },
  {
    name: "rejects sensation input sent under intention_mirror",
    schema: aiActivityRequestSchema,
    value: { ...lexiconRequest, kind: "intention_mirror" },
    valid: false,
  },
  {
    name: "rejects reflection input sent under sensation_lexicon",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, kind: "sensation_lexicon" },
    valid: false,
  },
  {
    name: "rejects input that mixes two kinds",
    schema: aiActivityRequestSchema,
    value: {
      ...mirrorRequest,
      input: { ...mirrorRequest.input, ...lexiconRequest.input },
    },
    valid: false,
  },
  {
    name: "rejects a missing input",
    schema: aiActivityRequestSchema,
    value: { kind: "intention_mirror", ...common },
    valid: false,
  },
  {
    name: "rejects an empty reflection",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, input: { reflection: "   " } },
    valid: false,
  },
  {
    name: "rejects a too-short reflection",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, input: { reflection: "ab" } },
    valid: false,
  },
  {
    name: "rejects an over-limit reflection",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, input: { reflection: "x".repeat(2001) } },
    valid: false,
  },
  {
    name: "rejects an over-limit sensation",
    schema: aiActivityRequestSchema,
    value: {
      ...lexiconRequest,
      input: { sensations: ["tight shoulders", "x".repeat(81), "warm hands"] },
    },
    valid: false,
  },
  {
    name: "rejects two sensations",
    schema: aiActivityRequestSchema,
    value: { ...lexiconRequest, input: { sensations: ["weird", "fine"] } },
    valid: false,
  },
  {
    name: "rejects a slug activity ID",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, activityId: "week-1-intention" },
    valid: false,
  },
  {
    name: "rejects a blank activity context",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, activityContext: " " },
    valid: false,
  },
  {
    name: "rejects an over-limit activity context",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, activityContext: "x".repeat(4001) },
    valid: false,
  },
  {
    name: "rejects a client-supplied user ID",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, userId: common.activityId },
    valid: false,
  },
  {
    name: "rejects a client-supplied provider name",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, provider: "future" },
    valid: false,
  },
  {
    name: "rejects a client-supplied result",
    schema: aiActivityRequestSchema,
    value: { ...mirrorRequest, result: { intentions } },
    valid: false,
  },
  {
    name: "accepts an intention_mirror response",
    schema: aiActivityResponseSchema,
    value: mirrorResponse,
    valid: true,
  },
  {
    name: "accepts a sensation_lexicon response",
    schema: aiActivityResponseSchema,
    value: lexiconResponse,
    valid: true,
  },
  {
    name: "accepts a provider other than the mock",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, provider: "copilot" },
    valid: true,
  },
  {
    name: "rejects a response without a kind",
    schema: aiActivityResponseSchema,
    value: { provider: "mock", result: { intentions } },
    valid: false,
  },
  {
    name: "rejects a response with an unknown kind",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, kind: "distraction_audit" },
    valid: false,
  },
  {
    name: "rejects a blank provider",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, provider: " " },
    valid: false,
  },
  {
    name: "rejects intentions returned under sensation_lexicon",
    schema: aiActivityResponseSchema,
    value: { ...lexiconResponse, result: { intentions } },
    valid: false,
  },
  {
    name: "rejects items returned under intention_mirror",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, result: { items } },
    valid: false,
  },
  {
    name: "rejects a result holding both shapes",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, result: { intentions, items } },
    valid: false,
  },
  {
    name: "rejects the unwrapped Week 1 shape",
    schema: aiActivityResponseSchema,
    value: { intentions, provider: "mock" },
    valid: false,
  },
  {
    name: "rejects two intentions",
    schema: aiActivityResponseSchema,
    value: {
      ...mirrorResponse,
      result: { intentions: intentions.slice(0, 2) },
    },
    valid: false,
  },
  {
    name: "rejects four items",
    schema: aiActivityResponseSchema,
    value: { ...lexiconResponse, result: { items: [...items, items[0]] } },
    valid: false,
  },
  {
    name: "rejects an extra top-level field",
    schema: aiActivityResponseSchema,
    value: { ...mirrorResponse, model: "mindful-reflection-v0" },
    valid: false,
  },
];

for (const testCase of cases) {
  Deno.test(`AI activity schema: ${testCase.name}`, () => {
    const result = testCase.schema.safeParse(testCase.value);

    if (result.success !== testCase.valid) {
      throw new Error(`${testCase.name}: expected valid=${testCase.valid}`);
    }
  });
}

const matchCases = [
  {
    name: "an intention_mirror response matches its request",
    request: mirrorRequest,
    response: mirrorResponse,
    matches: true,
  },
  {
    name: "a sensation_lexicon response matches its request",
    request: lexiconRequest,
    response: lexiconResponse,
    matches: true,
  },
  {
    name: "a response of another kind does not match",
    request: lexiconRequest,
    response: mirrorResponse,
    matches: false,
  },
  {
    name: "a sensation_lexicon response to different sensations does not match",
    request: {
      ...lexiconRequest,
      input: { sensations: ["cold feet", "weird", "warm hands"] },
    },
    response: lexiconResponse,
    matches: false,
  },
];

for (const testCase of matchCases) {
  Deno.test(`AI activity request check: ${testCase.name}`, () => {
    const request = aiActivityRequestSchema.parse(testCase.request);
    const response = aiActivityResponseSchema.parse(testCase.response);

    if (
      aiActivityResponseMatchesRequest(request, response) !== testCase.matches
    ) {
      throw new Error(`${testCase.name}: expected matches=${testCase.matches}`);
    }
  });
}
