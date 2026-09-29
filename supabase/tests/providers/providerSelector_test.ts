import {
  DEFAULT_PROVIDER_NAME,
  getGuidedReflectionProvider,
  isProviderName,
  resolveProviderName,
} from "../../functions/_shared/providers/providerSelector.ts";
import { ProviderNotConfiguredError } from "../../functions/_shared/providers/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const ENV_KEY = "GUIDED_REFLECTION_PROVIDER";

function withEnv(value: string | undefined, run: () => void | Promise<void>) {
  const previous = Deno.env.get(ENV_KEY);

  if (value === undefined) Deno.env.delete(ENV_KEY);
  else Deno.env.set(ENV_KEY, value);

  return (async () => {
    try {
      await run();
    } finally {
      if (previous === undefined) Deno.env.delete(ENV_KEY);
      else Deno.env.set(ENV_KEY, previous);
    }
  })();
}

Deno.test("defaults to the mock provider when unset", async () => {
  await withEnv(undefined, () => {
    assert(
      resolveProviderName() === "mock",
      "default provider must be mock",
    );
    assert(
      resolveProviderName() === DEFAULT_PROVIDER_NAME,
      "default provider must match the exported constant",
    );
  });
});

Deno.test("selects the configured provider by name", async () => {
  await withEnv("future", () => {
    assert(
      resolveProviderName() === "future",
      "must select the provider named by GUIDED_REFLECTION_PROVIDER",
    );
  });
});

Deno.test("falls back to mock for an unrecognized provider name", async () => {
  await withEnv("not-a-real-provider", () => {
    assert(
      resolveProviderName() === "mock",
      "must fall back to mock for an unrecognized value",
    );
  });
});

Deno.test("isProviderName recognizes valid and invalid names", () => {
  assert(isProviderName("mock"), "mock must be a valid provider name");
  assert(isProviderName("future"), "future must be a valid provider name");
  assert(!isProviderName("openai"), "unregistered names must be invalid");
  assert(!isProviderName(42), "non-string values must be invalid");
});

Deno.test("getGuidedReflectionProvider(\"mock\") returns a working provider", async () => {
  const provider = getGuidedReflectionProvider("mock");
  const response = await provider("context", "an ordinary reflection");

  assert(response.provider === "mock", "mock provider must self-identify as mock");
  assert(
    response.intentions.length === 3,
    "mock provider must return exactly three intentions",
  );
});

Deno.test("getGuidedReflectionProvider(\"future\") returns the unconfigured stub", async () => {
  const provider = getGuidedReflectionProvider("future");
  let thrown: unknown;

  try {
    await provider("context", "an ordinary reflection");
  } catch (error) {
    thrown = error;
  }

  assert(
    thrown instanceof ProviderNotConfiguredError,
    "future provider must reject with ProviderNotConfiguredError",
  );
});

Deno.test("getGuidedReflectionProvider defaults to the resolved provider name", async () => {
  await withEnv("future", async () => {
    const provider = getGuidedReflectionProvider();
    let thrown: unknown;

    try {
      await provider("context", "an ordinary reflection");
    } catch (error) {
      thrown = error;
    }

    assert(
      thrown instanceof ProviderNotConfiguredError,
      "omitting the name must use the environment-resolved provider",
    );
  });
});
