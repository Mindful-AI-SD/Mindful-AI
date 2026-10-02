import {
  generateMockGuidedReflection,
  ProviderError,
  ProviderTimeoutError,
} from "../../functions/_shared/providers/mockProviderAdapter.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValidResponse(
  response: { intentions: unknown[]; provider: string },
): void {
  assert(response.provider === "mock", "provider must be mock");
  assert(
    response.intentions.length === 3,
    "must return exactly three intentions",
  );

  for (const intention of response.intentions) {
    const { title, explanation } = intention as Record<string, unknown>;
    assert(
      typeof title === "string" && title.length > 0,
      "title must be a non-empty string",
    );
    assert(
      typeof explanation === "string" && explanation.length > 0,
      "explanation must be a non-empty string",
    );
  }
}

const FAST_TIMING = { delayMs: 20, timeoutMs: 40 };

Deno.test("defaults to the success scenario", async () => {
  const response = await generateMockGuidedReflection(
    "A breathing exercise about noticing physical sensations.",
    "I noticed my breathing slow down.",
  );

  assertValidResponse(response);
});

Deno.test("success scenario resolves without delay", async () => {
  const start = performance.now();
  const response = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "success",
    FAST_TIMING,
  );
  const elapsed = performance.now() - start;

  assertValidResponse(response);
  assert(elapsed < FAST_TIMING.delayMs, "success must not be delayed");
});

Deno.test("is deterministic for the same input", async () => {
  const first = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
  );
  const second = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
  );

  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "must return the same output for the same input",
  );
});

Deno.test("returns a different intention set for concerning language", async () => {
  const ordinary = await generateMockGuidedReflection(
    "context",
    "I felt calm today.",
  );
  const concerning = await generateMockGuidedReflection(
    "context",
    "I might hurt myself tonight.",
  );

  assert(
    JSON.stringify(ordinary.intentions) !==
      JSON.stringify(concerning.intentions),
    "concerning language must produce a different intention set",
  );
});

Deno.test("does not echo the reflection text back", async () => {
  const reflectionText = "unique_marker_reflection_xyz";
  const response = await generateMockGuidedReflection(
    "context",
    reflectionText,
  );

  assert(
    !JSON.stringify(response).includes(reflectionText),
    "reflection text must not be echoed in the result",
  );
});

Deno.test("does not echo the activity context back", async () => {
  const activityContext = "unique_marker_context_xyz";
  const response = await generateMockGuidedReflection(
    activityContext,
    "an ordinary reflection",
  );

  assert(
    !JSON.stringify(response).includes(activityContext),
    "activity context must not be echoed in the result",
  );
});

Deno.test("delayed scenario resolves with a valid response after the configured delay", async () => {
  const start = performance.now();
  const response = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "delayed",
    FAST_TIMING,
  );
  const elapsed = performance.now() - start;

  assertValidResponse(response);
  assert(
    elapsed >= FAST_TIMING.delayMs,
    `delayed scenario must wait at least ${FAST_TIMING.delayMs}ms, took ${elapsed}ms`,
  );
});

Deno.test("timeout scenario throws ProviderTimeoutError after the configured timeout", async () => {
  const start = performance.now();
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

  const elapsed = performance.now() - start;

  assert(
    thrown instanceof ProviderTimeoutError,
    "timeout scenario must throw ProviderTimeoutError",
  );
  assert(
    elapsed >= FAST_TIMING.timeoutMs,
    `timeout scenario must wait at least ${FAST_TIMING.timeoutMs}ms, took ${elapsed}ms`,
  );
});

Deno.test("error scenario throws ProviderError immediately", async () => {
  const start = performance.now();
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

  const elapsed = performance.now() - start;

  assert(
    thrown instanceof ProviderError,
    "error scenario must throw ProviderError",
  );
  assert(
    elapsed < FAST_TIMING.delayMs,
    "error scenario must not be delayed",
  );
});
