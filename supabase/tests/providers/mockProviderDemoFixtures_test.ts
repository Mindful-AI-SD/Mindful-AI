// Verifies each demo scenario is short, recognizable, and distinct from the
// others — QA must be able to tell which of the four states fired from the
// response/error alone, without timing the request or reading server logs.
import {
  DEMO_LABELS,
  generateMockGuidedReflection,
  ProviderError,
  ProviderTimeoutError,
} from "../../functions/_shared/providers/mockProviderAdapter.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const FAST_TIMING = { delayMs: 5, timeoutMs: 10 };

Deno.test("normal success fixture is tagged and short", async () => {
  const response = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "success",
    FAST_TIMING,
  );

  for (const intention of response.intentions) {
    assert(
      intention.title.startsWith(DEMO_LABELS.success),
      `title must start with ${DEMO_LABELS.success}`,
    );
    assert(intention.title.length < 80, "title must be short");
  }
});

Deno.test("slow success fixture is tagged and short", async () => {
  const response = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "delayed",
    FAST_TIMING,
  );

  for (const intention of response.intentions) {
    assert(
      intention.title.startsWith(DEMO_LABELS.delayed),
      `title must start with ${DEMO_LABELS.delayed}`,
    );
    assert(intention.title.length < 80, "title must be short");
  }
});

Deno.test("normal success and slow success are visually distinguishable", async () => {
  const success = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "success",
    FAST_TIMING,
  );
  const delayed = await generateMockGuidedReflection(
    "context",
    "an ordinary reflection",
    "delayed",
    FAST_TIMING,
  );

  assert(
    success.intentions[0].title !== delayed.intentions[0].title,
    "success and delayed fixtures must not read identically",
  );
});

Deno.test("timeout failure message is tagged and short", async () => {
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
  const message = (thrown as ProviderTimeoutError).message;
  assert(
    message.startsWith(DEMO_LABELS.timeout),
    `message must start with ${DEMO_LABELS.timeout}`,
  );
  assert(message.length < 80, "message must be short");
});

Deno.test("provider failure message is tagged and short", async () => {
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
  const message = (thrown as ProviderError).message;
  assert(
    message.startsWith(DEMO_LABELS.error),
    `message must start with ${DEMO_LABELS.error}`,
  );
  assert(message.length < 80, "message must be short");
});

Deno.test("all four demo labels are distinct", () => {
  const labels = Object.values(DEMO_LABELS);
  const uniqueLabels = new Set(labels);

  assert(
    uniqueLabels.size === labels.length,
    "each scenario must have its own distinct label",
  );
});

Deno.test("repeated calls with the same scenario are reproducible", async () => {
  for (const scenario of ["success", "delayed"] as const) {
    const first = await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      scenario,
      FAST_TIMING,
    );
    const second = await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
      scenario,
      FAST_TIMING,
    );

    assert(
      JSON.stringify(first) === JSON.stringify(second),
      `"${scenario}" must produce the same fixture every time`,
    );
  }
});
