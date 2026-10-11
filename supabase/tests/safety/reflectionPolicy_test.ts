// The guided-reflection endpoint decides what to do with a reflection through
// getReflectionOutcome. These cases pin its crisis handling to the shared
// crisis check. All inputs are synthetic.
import { getReflectionOutcome } from "../../functions/guided-reflection/reflectionPolicy.ts";
import { CRISIS_SUPPORT_RESPONSE } from "../../functions/_shared/crisisSupport.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const CRISIS_REFLECTIONS = [
  "I am worried that I might hurt myself tonight.",
  "Lately I keep thinking everyone would be better off without me.",
  "   I want to die   ",
  `I don't want to live. ${"x".repeat(2001)}`,
];

for (const reflection of CRISIS_REFLECTIONS) {
  Deno.test(`reflection policy: crisis text gets the fixed support response (${reflection.trim().slice(0, 40)})`, () => {
    const outcome = getReflectionOutcome(reflection);

    assert(outcome.category === "concerning", "category must be concerning");
    assert(outcome.validation === "support", "must not continue as accepted");
    assert(outcome.mockBehavior === "not_called", "provider must not run");
    assert(outcome.result.status === 200, "support is a 200 response");
    assert(
      outcome.result.body === CRISIS_SUPPORT_RESPONSE,
      "body must be the shared fixed response, not generated text",
    );
  });
}

Deno.test("reflection policy: ordinary reflections are still accepted", () => {
  for (
    const reflection of [
      "I noticed my breathing slow down.",
      "I felt anxious after a private disagreement with a family member.",
      "I might have hurt myself at the gym",
      "Cal",
    ]
  ) {
    assert(
      getReflectionOutcome(reflection).validation === "accept",
      `"${reflection}" must be accepted`,
    );
  }
});

Deno.test("reflection policy: empty, too-short, and oversized reflections are still rejected", () => {
  const cases: Array<[string, string]> = [
    ["", "empty"],
    ["   ", "empty"],
    ["No", "too_short"],
    ["x".repeat(2001), "oversized"],
  ];

  for (const [reflection, category] of cases) {
    const outcome = getReflectionOutcome(reflection);

    assert(outcome.validation === "reject", `${category} must be rejected`);
    assert(outcome.category === category, `category must be ${category}`);
    assert(outcome.result.status === 400, `${category} must be a 400`);
  }
});
