import {
  guidedReflectionResponseSchema,
  guidedReflectionSchema,
} from "../../schema/guidedReflectionSchema.ts";
import {
  getReflectionOutcome,
  type ReflectionCategory,
} from "../../functions/guided-reflection/reflectionPolicy.ts";

type ReflectionTestCase = {
  name: string;
  request: Record<string, unknown> & {
    userReflection: string | { "$repeat": string; count: number };
  };
  response?: Record<string, unknown>;
  expected: {
    validation: "accept" | "reject";
    mockBehavior: string;
    category?: ReflectionCategory;
    result?: {
      status: number;
      body: Record<string, string>;
    };
  };
};

const testCases = JSON.parse(
  await Deno.readTextFile(
    new URL("./guidedReflectionTestCases.json", import.meta.url),
  ),
) as Record<string, ReflectionTestCase>;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function materializeRequest(
  testCase: ReflectionTestCase,
): Record<string, unknown> {
  const reflection = testCase.request.userReflection;
  if (typeof reflection === "string") {
    return testCase.request;
  }

  return {
    ...testCase.request,
    userReflection: reflection["$repeat"].repeat(reflection.count),
  };
}

Deno.test("fixture dataset contains at least ten cases", () => {
  assert(
    Object.keys(testCases).length >= 10,
    "Expected at least ten reflection cases",
  );
});

for (const testCase of Object.values(testCases)) {
  Deno.test(testCase.name, () => {
    const request = materializeRequest(testCase);
    const result = testCase.response === undefined
      ? guidedReflectionSchema.safeParse(request)
      : guidedReflectionResponseSchema.safeParse(testCase.response);
    const expectedToPass = testCase.expected.validation === "accept";

    assert(
      result.success === expectedToPass,
      `Expected validation to ${testCase.expected.validation}`,
    );

    if (
      testCase.response === undefined &&
      typeof request.userReflection === "string"
    ) {
      const outcome = getReflectionOutcome(request.userReflection);
      assert(
        outcome.category === testCase.expected.category,
        `Expected category ${testCase.expected.category}, received ${outcome.category}`,
      );
      assert(
        outcome.mockBehavior === testCase.expected.mockBehavior,
        `Expected mock behavior ${testCase.expected.mockBehavior}, received ${outcome.mockBehavior}`,
      );
      assert(
        JSON.stringify(outcome.result) ===
          JSON.stringify(testCase.expected.result),
        "Expected the exact fixture result",
      );
      assert(
        request.userReflection.length === 0 ||
          !JSON.stringify(outcome.result).includes(request.userReflection),
        "Reflection text must not be echoed in the result",
      );
    }
  });
}
