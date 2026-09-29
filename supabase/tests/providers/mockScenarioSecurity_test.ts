// Security-focused tests for scenario selection. These exercise the exact
// functions the guided-reflection endpoint calls (extractDevScenarioOverride
// -> resolveMockScenario -> generateMockGuidedReflection) so we're proving
// the endpoint's actual behavior is production-safe, not just that an
// isolated helper is safe in theory.
import {
  DEFAULT_SCENARIO,
  DEV_SCENARIO_OVERRIDE_FIELD,
  extractDevScenarioOverride,
  generateMockGuidedReflection,
  resolveMockScenario,
} from "../../functions/_shared/providers/mockProviderAdapter.ts";
import { ProviderError } from "../../functions/_shared/providers/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SCENARIO_ENV_KEYS = [
  "MOCK_PROVIDER_SCENARIO",
  "MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE",
];

function withProductionEnv(run: () => void | Promise<void>) {
  const previous = Object.fromEntries(
    SCENARIO_ENV_KEYS.map((key) => [key, Deno.env.get(key)]),
  );

  for (const key of SCENARIO_ENV_KEYS) Deno.env.delete(key);

  return (async () => {
    try {
      await run();
    } finally {
      for (const key of SCENARIO_ENV_KEYS) Deno.env.delete(key);
      for (const [key, value] of Object.entries(previous)) {
        if (value !== undefined) Deno.env.set(key, value);
      }
    }
  })();
}

const ATTEMPTED_OVERRIDES: unknown[] = [
  "error",
  "timeout",
  "delayed",
  "success",
  "not-a-real-scenario",
  "",
  123,
  true,
  null,
  { toString: () => "error" },
  ["error"],
];

Deno.test("production default: normal success is the only outcome with no server configuration", async () => {
  await withProductionEnv(async () => {
    assert(
      resolveMockScenario() === "success",
      "with nothing configured, the scenario must be success",
    );
    assert(
      resolveMockScenario() === DEFAULT_SCENARIO,
      "the production default must match the exported DEFAULT_SCENARIO constant",
    );

    const response = await generateMockGuidedReflection(
      "context",
      "an ordinary reflection",
    );
    assert(
      response.provider === "mock" && response.intentions.length === 3,
      "the default call must resolve a normal successful response",
    );
  });
});

Deno.test("production default: an ordinary client cannot trigger any scenario via the request body", async () => {
  await withProductionEnv(async () => {
    for (const attemptedOverride of ATTEMPTED_OVERRIDES) {
      const requestBody = {
        activityId: "breathing-exercise",
        activityContext: "A breathing exercise.",
        userReflection: "I noticed my breathing slow down.",
        [DEV_SCENARIO_OVERRIDE_FIELD]: attemptedOverride,
      };

      const { override, sanitizedBody } = extractDevScenarioOverride(
        requestBody,
      );
      const resolvedScenario = resolveMockScenario(override);

      assert(
        resolvedScenario === "success",
        `an ordinary request with ${
          JSON.stringify(attemptedOverride)
        } as the override must still resolve to success, got "${resolvedScenario}"`,
      );

      assert(
        !(DEV_SCENARIO_OVERRIDE_FIELD in (sanitizedBody as object)),
        "the dev override field must never reach the sanitized/validated body",
      );
    }
  });
});

Deno.test("production default: the dev override field is stripped even when no override was sent", async () => {
  await withProductionEnv(() => {
    const requestBody = {
      activityId: "breathing-exercise",
      activityContext: "A breathing exercise.",
      userReflection: "I noticed my breathing slow down.",
    };

    const { override, sanitizedBody } = extractDevScenarioOverride(
      requestBody,
    );

    assert(override === undefined, "no override field means no override value");
    assert(
      JSON.stringify(sanitizedBody) === JSON.stringify(requestBody),
      "a request without the dev field must pass through unchanged",
    );
  });
});

Deno.test("the override mechanism only ever activates with an explicit server opt-in", async () => {
  const requestBody = {
    activityId: "breathing-exercise",
    activityContext: "A breathing exercise.",
    userReflection: "I noticed my breathing slow down.",
    [DEV_SCENARIO_OVERRIDE_FIELD]: "error",
  };
  const { override } = extractDevScenarioOverride(requestBody);

  await withProductionEnv(async () => {
    // Same override value, opt-in unset: ignored.
    assert(
      resolveMockScenario(override) === "success",
      "without the explicit opt-in, the override must be ignored",
    );

    // Now explicitly opt in, proving the gate — not some other restriction —
    // is what was blocking it above.
    Deno.env.set("MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE", "true");
    const scenario = resolveMockScenario(override);
    assert(
      scenario === "error",
      "with the explicit opt-in, the same override must now be honored",
    );

    let thrown: unknown;
    try {
      await generateMockGuidedReflection(
        "context",
        "an ordinary reflection",
        scenario,
      );
    } catch (error) {
      thrown = error;
    }
    assert(
      thrown instanceof ProviderError,
      "the opted-in override must actually change adapter behavior",
    );
  });
});

Deno.test("near-miss field names on the request body are not treated as the override", async () => {
  await withProductionEnv(() => {
    const nearMisses = [
      "devmockscenario",
      "DevMockScenario",
      "dev_mock_scenario",
      "mockScenario",
      "scenario",
    ];

    for (const fieldName of nearMisses) {
      const requestBody = { [fieldName]: "error" };
      const { override, sanitizedBody } = extractDevScenarioOverride(
        requestBody,
      );

      assert(
        override === undefined,
        `"${fieldName}" must not be treated as the override field`,
      );
      assert(
        fieldName in (sanitizedBody as object),
        `"${fieldName}" is not the reserved field, so it must be left in the body for schema validation to reject or accept normally`,
      );
    }
  });
});
