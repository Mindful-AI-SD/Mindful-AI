import { generateFutureGuidedReflection } from "../../functions/_shared/providers/futureProviderAdapter.ts";
import { ProviderNotConfiguredError } from "../../functions/_shared/providers/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("future provider rejects with ProviderNotConfiguredError", async () => {
  let thrown: unknown;

  try {
    await generateFutureGuidedReflection("context", "an ordinary reflection");
  } catch (error) {
    thrown = error;
  }

  assert(
    thrown instanceof ProviderNotConfiguredError,
    "must reject with ProviderNotConfiguredError",
  );
  assert(
    (thrown as ProviderNotConfiguredError).code === "PROVIDER_NOT_CONFIGURED",
    "error code must be the stable string PROVIDER_NOT_CONFIGURED",
  );
  assert(
    (thrown as ProviderNotConfiguredError).message.length > 0,
    "error must include a clear configuration message",
  );
});

Deno.test("future provider never resolves a response body", async () => {
  let resolved = false;

  try {
    await generateFutureGuidedReflection("context", "an ordinary reflection");
    resolved = true;
  } catch {
    // expected
  }

  assert(!resolved, "the future provider must reject, not resolve");
});

Deno.test("future provider fails the same way regardless of input", async () => {
  const inputs: Array<[string, string]> = [
    ["", ""],
    ["context", "I might hurt myself tonight."],
    ["a".repeat(4000), "b".repeat(2000)],
  ];

  for (const [activityContext, userReflection] of inputs) {
    let thrown: unknown;

    try {
      await generateFutureGuidedReflection(activityContext, userReflection);
    } catch (error) {
      thrown = error;
    }

    assert(
      thrown instanceof ProviderNotConfiguredError,
      "must always reject with ProviderNotConfiguredError",
    );
  }
});
