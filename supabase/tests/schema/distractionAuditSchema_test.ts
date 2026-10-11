import {
  aiActivityRequestSchema,
  aiActivityResponseMatchesRequest,
  aiActivityResponseSchema,
} from "../../schema/aiActivitySchema.ts";
import {
  exampleEvents,
  exampleResult,
} from "../fixtures/distractionAuditExample.ts";

const request = {
  kind: "distraction_audit",
  activityId: "6f1c2b9e-5a7d-4e3f-9b1a-2c4d6e8f0a1b",
  activityContext: "Distraction Audit",
  input: { events: exampleEvents },
};

const response = {
  kind: "distraction_audit",
  provider: "mock",
  result: exampleResult,
};

const [first, ...rest] = exampleEvents;
const withEvents = (events: unknown) => ({ ...request, input: { events } });
const withFirst = (changes: Record<string, unknown>) =>
  withEvents([{ ...first, ...changes }, ...rest]);
const withResult = (changes: Record<string, unknown>) => ({
  ...response,
  result: { ...exampleResult, ...changes },
});
const manyEvents = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index}`,
    at: "2026-10-12T09:15:00Z",
    label: "Instagram",
  }));

const cases = [
  {
    name: "accepts the documented three-day log",
    schema: aiActivityRequestSchema,
    value: request,
    valid: true,
  },
  {
    name: "accepts an empty log",
    schema: aiActivityRequestSchema,
    value: withEvents([]),
    valid: true,
  },
  {
    name: "accepts 300 events",
    schema: aiActivityRequestSchema,
    value: withEvents(manyEvents(300)),
    valid: true,
  },
  {
    name: "accepts UTC and offset timestamps",
    schema: aiActivityRequestSchema,
    value: withEvents([
      { id: "a", at: "2026-10-12T09:15:00Z", label: "email" },
      { id: "b", at: "2026-10-12T09:15:00.123+02:00", label: "email" },
    ]),
    valid: true,
  },
  {
    name: "accepts a 40-character label",
    schema: aiActivityRequestSchema,
    value: withFirst({ label: "x".repeat(40) }),
    valid: true,
  },
  {
    name: "rejects more than 300 events",
    schema: aiActivityRequestSchema,
    value: withEvents(manyEvents(301)),
    valid: false,
  },
  {
    name: "rejects a missing events field",
    schema: aiActivityRequestSchema,
    value: { ...request, input: {} },
    valid: false,
  },
  {
    name: "rejects events that are not a list",
    schema: aiActivityRequestSchema,
    value: withEvents("Instagram, TikTok"),
    valid: false,
  },
  {
    name: "rejects duplicate event IDs",
    schema: aiActivityRequestSchema,
    value: withEvents([first, first]),
    valid: false,
  },
  {
    name: "rejects an event without an ID",
    schema: aiActivityRequestSchema,
    value: withEvents([{ at: first.at, label: first.label }]),
    valid: false,
  },
  {
    name: "rejects a blank event ID",
    schema: aiActivityRequestSchema,
    value: withFirst({ id: " " }),
    valid: false,
  },
  {
    name: "rejects an over-limit event ID",
    schema: aiActivityRequestSchema,
    value: withFirst({ id: "x".repeat(65) }),
    valid: false,
  },
  {
    name: "rejects an event without a timestamp",
    schema: aiActivityRequestSchema,
    value: withEvents([{ id: first.id, label: first.label }]),
    valid: false,
  },
  {
    name: "rejects a date without a time",
    schema: aiActivityRequestSchema,
    value: withFirst({ at: "2026-10-12" }),
    valid: false,
  },
  {
    name: "rejects a timestamp without a time zone",
    schema: aiActivityRequestSchema,
    value: withFirst({ at: "2026-10-12T09:15:00" }),
    valid: false,
  },
  {
    name: "rejects a numeric timestamp",
    schema: aiActivityRequestSchema,
    value: withFirst({ at: 1791800100 }),
    valid: false,
  },
  {
    name: "rejects an impossible date",
    schema: aiActivityRequestSchema,
    value: withFirst({ at: "2026-13-45T09:15:00Z" }),
    valid: false,
  },
  {
    name: "rejects an empty label",
    schema: aiActivityRequestSchema,
    value: withFirst({ label: "   " }),
    valid: false,
  },
  {
    name: "rejects an over-limit label",
    schema: aiActivityRequestSchema,
    value: withFirst({ label: "x".repeat(41) }),
    valid: false,
  },
  {
    name: "rejects a client-supplied category on an event",
    schema: aiActivityRequestSchema,
    value: withFirst({ category: "social_media" }),
    valid: false,
  },
  {
    name: "rejects client-supplied percentages",
    schema: aiActivityRequestSchema,
    value: { ...request, input: { events: exampleEvents, categories: [] } },
    valid: false,
  },
  {
    name: "rejects events sent under another kind",
    schema: aiActivityRequestSchema,
    value: { ...request, kind: "sensation_lexicon" },
    valid: false,
  },
  {
    name: "accepts the documented result",
    schema: aiActivityResponseSchema,
    value: response,
    valid: true,
  },
  {
    name: "accepts an empty audit",
    schema: aiActivityResponseSchema,
    value: withResult({
      totalEvents: 0,
      categories: [],
      uncategorized: { count: 0, percent: 0 },
      assignments: [],
    }),
    valid: true,
  },
  {
    name: "rejects a result missing its total",
    schema: aiActivityResponseSchema,
    value: {
      ...response,
      result: {
        categories: exampleResult.categories,
        uncategorized: exampleResult.uncategorized,
        assignments: exampleResult.assignments,
      },
    },
    valid: false,
  },
  {
    name: "rejects a result missing its assignments",
    schema: aiActivityResponseSchema,
    value: {
      ...response,
      result: {
        totalEvents: exampleResult.totalEvents,
        categories: exampleResult.categories,
        uncategorized: exampleResult.uncategorized,
      },
    },
    valid: false,
  },
  {
    name: "rejects a fractional percentage",
    schema: aiActivityResponseSchema,
    value: withResult({ uncategorized: { count: 1, percent: 12.5 } }),
    valid: false,
  },
  {
    name: "rejects a percentage over 100",
    schema: aiActivityResponseSchema,
    value: withResult({ uncategorized: { count: 1, percent: 101 } }),
    valid: false,
  },
  {
    name: "rejects a negative count",
    schema: aiActivityResponseSchema,
    value: withResult({ uncategorized: { count: -1, percent: 12 } }),
    valid: false,
  },
  {
    name: "rejects a percentage written as text",
    schema: aiActivityResponseSchema,
    value: withResult({ uncategorized: { count: 1, percent: "12%" } }),
    valid: false,
  },
  {
    name: "rejects a category that is not on the list",
    schema: aiActivityResponseSchema,
    value: withResult({
      categories: [{ category: "doomscrolling", count: 8, percent: 100 }],
    }),
    valid: false,
  },
  {
    name: "rejects a listed category with no events",
    schema: aiActivityResponseSchema,
    value: withResult({
      categories: [
        ...exampleResult.categories,
        { category: "thoughts", count: 0, percent: 0 },
      ],
    }),
    valid: false,
  },
  {
    name: "rejects an extra field on a category",
    schema: aiActivityResponseSchema,
    value: withResult({
      categories: [
        { ...exampleResult.categories[0], advice: "use your phone less" },
        ...exampleResult.categories.slice(1),
      ],
    }),
    valid: false,
  },
  {
    name: "rejects an extra top-level result field",
    schema: aiActivityResponseSchema,
    value: withResult({ streak: 3 }),
    valid: false,
  },
  {
    name: "rejects an audit returned under another kind",
    schema: aiActivityResponseSchema,
    value: { ...response, kind: "intention_mirror" },
    valid: false,
  },
];

for (const testCase of cases) {
  Deno.test(`distraction audit schema: ${testCase.name}`, () => {
    const result = testCase.schema.safeParse(testCase.value);

    if (result.success !== testCase.valid) {
      throw new Error(`${testCase.name}: expected valid=${testCase.valid}`);
    }
  });
}

const { categories, assignments } = exampleResult;
const matchCases = [
  { name: "the documented result matches its log", value: response, ok: true },
  {
    name: "percentages that do not total 100 do not match",
    value: withResult({ uncategorized: { count: 1, percent: 13 } }),
    ok: false,
  },
  {
    name: "percentages rounded the other way do not match",
    value: withResult({
      categories: [
        { ...categories[0], percent: 37 },
        categories[1],
        { ...categories[2], percent: 13 },
      ],
    }),
    ok: false,
  },
  {
    name: "a count that disagrees with the assignments does not match",
    value: withResult({
      categories: [{ ...categories[0], count: 4 }, ...categories.slice(1)],
    }),
    ok: false,
  },
  {
    name: "a wrong total does not match",
    value: withResult({ totalEvents: 9 }),
    ok: false,
  },
  {
    name: "categories in a different order do not match",
    value: withResult({
      categories: [categories[1], categories[0], categories[2]],
    }),
    ok: false,
  },
  {
    name: "a dropped category does not match",
    value: withResult({ categories: categories.slice(0, 2) }),
    ok: false,
  },
  {
    name: "a dropped event does not match",
    value: withResult({ assignments: assignments.slice(0, 7) }),
    ok: false,
  },
  {
    name: "an invented event does not match",
    value: withResult({
      assignments: [...assignments, { eventId: "e9", category: null }],
    }),
    ok: false,
  },
  {
    name: "assignments in a different order do not match",
    value: withResult({
      assignments: [assignments[1], assignments[0], ...assignments.slice(2)],
    }),
    ok: false,
  },
  {
    name: "a recategorized event without updated numbers does not match",
    value: withResult({
      assignments: [
        { eventId: "e1", category: "thoughts" },
        ...assignments.slice(1),
      ],
    }),
    ok: false,
  },
];

for (const testCase of matchCases) {
  Deno.test(`distraction audit request check: ${testCase.name}`, () => {
    const parsedRequest = aiActivityRequestSchema.parse(request);
    const parsedResponse = aiActivityResponseSchema.parse(testCase.value);

    if (
      aiActivityResponseMatchesRequest(parsedRequest, parsedResponse) !==
        testCase.ok
    ) {
      throw new Error(`${testCase.name}: expected matches=${testCase.ok}`);
    }
  });
}

Deno.test("distraction audit request check: an audit of a different log does not match", () => {
  const otherLog = aiActivityRequestSchema.parse(
    withEvents(exampleEvents.slice(0, 7)),
  );
  const parsedResponse = aiActivityResponseSchema.parse(response);

  if (aiActivityResponseMatchesRequest(otherLog, parsedResponse)) {
    throw new Error("an audit must only match the log it was computed from");
  }
});
