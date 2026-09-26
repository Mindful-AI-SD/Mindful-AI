import {
  guidedReflectionSchema,
  guidedReflectionResponseSchema,
} from "../../schema/guidedReflectionSchema.ts";

const request = {
  activityId: "week-1-intention",
  activityContext: "Intention Mirror",
  userReflection: "I noticed my breathing slow down.",
};

const response = {
  intentions: [
    { title: "Pause", explanation: "Take a breath before reacting." },
    { title: "Notice", explanation: "Observe a feeling without judgment." },
    { title: "Choose", explanation: "Choose a thoughtful next step." },
  ],
  provider: "mock",
};

const cases = [
  {
    name: "accepts a request with an activity slug, context, and reflection",
    schema: guidedReflectionSchema,
    value: request,
    valid: true,
  },
  {
    name: "rejects an empty reflection",
    schema: guidedReflectionSchema,
    value: { ...request, userReflection: "   " },
    valid: false,
  },
  {
    name: "rejects an oversized reflection",
    schema: guidedReflectionSchema,
    value: { ...request, userReflection: "x".repeat(2001) },
    valid: false,
  },
  {
    name: "rejects a missing context",
    schema: guidedReflectionSchema,
    value: {
      activityId: request.activityId,
      userReflection: request.userReflection,
    },
    valid: false,
  },
  {
    name: "rejects intentions in the request",
    schema: guidedReflectionSchema,
    value: { ...request, intentions: [] },
    valid: false,
  },
  {
    name: "accepts exactly three complete intentions",
    schema: guidedReflectionResponseSchema,
    value: response,
    valid: true,
  },
  {
    name: "rejects fewer than three intentions",
    schema: guidedReflectionResponseSchema,
    value: { ...response, intentions: response.intentions.slice(0, 2) },
    valid: false,
  },
  {
    name: "rejects more than three intentions",
    schema: guidedReflectionResponseSchema,
    value: {
      ...response,
      intentions: [
        ...response.intentions,
        { title: "Extra", explanation: "An extra reason." },
      ],
    },
    valid: false,
  },
  {
    name: "rejects a missing explanation",
    schema: guidedReflectionResponseSchema,
    value: {
      ...response,
      intentions: [
        { title: "Pause" },
        ...response.intentions.slice(1),
      ],
    },
    valid: false,
  },
  {
    name: "rejects a blank title",
    schema: guidedReflectionResponseSchema,
    value: {
      ...response,
      intentions: [
        { title: " ", explanation: "A reason." },
        ...response.intentions.slice(1),
      ],
    },
    valid: false,
  },
];

for (const testCase of cases) {
  Deno.test(testCase.name, () => {
    const result = testCase.schema.safeParse(testCase.value);

    if (result.success !== testCase.valid) {
      throw new Error(
        `${testCase.name}: expected valid=${testCase.valid}`,
      );
    }
  });
}