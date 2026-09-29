// Contract tests for the mock provider adapter. These assert the frozen
// public shape (field names, arity, error codes) that any real provider
// swapped in later must also satisfy. Run with `deno task test:mock-adapter`
// or as part of the full `deno task tests`. Independent of the mobile UI:
// this only imports the server-side adapter module.
import {
  generateMockGuidedReflection,
  type MockScenario,
  ProviderError,
  ProviderTimeoutError,
} from "../../functions/_shared/providers/mockProviderAdapter.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSameMembers(actual: string[], expected: string[], message: string) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `${message} (expected [${expectedSorted}], got [${actualSorted}])`,
  );
}

const FAST_TIMING = { delayMs: 5, timeoutMs: 10 };

const SUCCESS_SCENARIOS: MockScenario[] = ["success", "delayed"];
const FAILURE_SCENARIOS: MockScenario[] = ["timeout", "error"];

for (const scenario of SUCCESS_SCENARIOS) {
  Deno.test(`contract: "${scenario}" scenario returns exactly three intentions with provider "mock"`, async () => {
    const response = await generateMockGuidedReflection(
      "A breathing exercise about noticing physical sensations.",
      "I noticed my breathing slow down.",
      scenario,
      FAST_TIMING,
    );

    assert(response.provider === "mock", "provider must be the literal 'mock'");
    assert(
      response.intentions.length === 3,
      "must return exactly three intentions, not more or fewer",
    );
  });

  Deno.test(`contract: "${scenario}" scenario response has stable top-level field names`, async () => {
    const response = await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      scenario,
      FAST_TIMING,
    );

    assertSameMembers(
      Object.keys(response),
      ["intentions", "provider"],
      "top-level response must expose exactly intentions and provider",
    );
  });

  Deno.test(`contract: "${scenario}" scenario each intention has stable field names and non-empty text`, async () => {
    const response = await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      scenario,
      FAST_TIMING,
    );

    for (const intention of response.intentions) {
      assertSameMembers(
        Object.keys(intention),
        ["title", "explanation"],
        "each intention must expose exactly title and explanation",
      );
      assert(
        typeof intention.title === "string" && intention.title.trim().length > 0,
        "title must be a non-empty string",
      );
      assert(
        typeof intention.explanation === "string" &&
          intention.explanation.trim().length > 0,
        "explanation must be a non-empty string",
      );
    }
  });
}

Deno.test('contract: "timeout" scenario fails with a predictable, stable error code', async () => {
  let thrown: unknown;

  try {
    await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      "timeout",
      FAST_TIMING,
    );
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof ProviderTimeoutError, "must throw ProviderTimeoutError");
  assert(
    (thrown as ProviderTimeoutError).code === "PROVIDER_TIMEOUT",
    "error code must be the stable string PROVIDER_TIMEOUT",
  );
  assert(
    (thrown as ProviderTimeoutError).name === "ProviderTimeoutError",
    "error name must be the stable string ProviderTimeoutError",
  );
});

Deno.test('contract: "error" scenario fails with a predictable, stable error code', async () => {
  let thrown: unknown;

  try {
    await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      "error",
      FAST_TIMING,
    );
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof ProviderError, "must throw ProviderError");
  assert(
    (thrown as ProviderError).code === "PROVIDER_ERROR",
    "error code must be the stable string PROVIDER_ERROR",
  );
  assert(
    (thrown as ProviderError).name === "ProviderError",
    "error name must be the stable string ProviderError",
  );
});

for (const scenario of FAILURE_SCENARIOS) {
  Deno.test(`contract: "${scenario}" scenario never resolves a response body`, async () => {
    let resolved = false;

    try {
      await generateMockGuidedReflection(
        "context",
        "an ordinary reflection",
        scenario,
        FAST_TIMING,
      );
      resolved = true;
    } catch {
      // expected
    }

    assert(!resolved, `"${scenario}" must reject, not resolve a response body`);
  });
}

Deno.test("contract: the two failure types are distinguishable from one another", async () => {
  let timeoutError: unknown;
  let providerError: unknown;

  try {
    await generateMockGuidedReflection("c", "r", "timeout", FAST_TIMING);
  } catch (error) {
    timeoutError = error;
  }

  try {
    await generateMockGuidedReflection("c", "r", "error", FAST_TIMING);
  } catch (error) {
    providerError = error;
  }

  assert(
    (timeoutError as Error).name !== (providerError as Error).name,
    "timeout and error failures must have distinct error names",
  );
  assert(
    (timeoutError as ProviderTimeoutError).code as string !==
      (providerError as ProviderError).code as string,
    "timeout and error failures must have distinct error codes",
  );
});
