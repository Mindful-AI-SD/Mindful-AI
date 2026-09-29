import {
  DEFAULT_SCENARIO,
  DEFAULT_TIMING_CONFIG,
  DEV_SCENARIO_OVERRIDE_FIELD,
  extractDevScenarioOverride,
  resolveMockScenario,
  resolveMockTimingConfig,
} from "../../functions/_shared/providers/mockProviderAdapter.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SCENARIO_ENV_KEYS = [
  "MOCK_PROVIDER_SCENARIO",
  "MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE",
  "MOCK_PROVIDER_DELAY_MS",
  "MOCK_PROVIDER_TIMEOUT_MS",
];

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(
    SCENARIO_ENV_KEYS.map((key) => [key, Deno.env.get(key)]),
  );

  for (const key of SCENARIO_ENV_KEYS) Deno.env.delete(key);
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) Deno.env.set(key, value);
  }

  try {
    run();
  } finally {
    for (const key of SCENARIO_ENV_KEYS) Deno.env.delete(key);
    for (const [key, value] of Object.entries(previous)) {
      if (value !== undefined) Deno.env.set(key, value);
    }
  }
}

Deno.test("defaults to normal success with no environment configuration", () => {
  withEnv({}, () => {
    assert(
      resolveMockScenario() === "success",
      "default scenario must be success",
    );
    assert(
      resolveMockScenario() === DEFAULT_SCENARIO,
      "default scenario must match the exported constant",
    );
  });
});

Deno.test("uses the environment variable when set", () => {
  withEnv({ MOCK_PROVIDER_SCENARIO: "error" }, () => {
    assert(
      resolveMockScenario() === "error",
      "must use MOCK_PROVIDER_SCENARIO when set",
    );
  });
});

Deno.test("falls back to the default scenario for an invalid environment value", () => {
  withEnv({ MOCK_PROVIDER_SCENARIO: "not-a-real-scenario" }, () => {
    assert(
      resolveMockScenario() === "success",
      "must fall back to success for an invalid scenario value",
    );
  });
});

Deno.test("ignores a request override when overrides are not explicitly allowed", () => {
  withEnv({ MOCK_PROVIDER_SCENARIO: "success" }, () => {
    assert(
      resolveMockScenario("error") === "success",
      "request override must be ignored when MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE is unset",
    );
  });
});

Deno.test("honors a request override only when explicitly allowed", () => {
  withEnv(
    {
      MOCK_PROVIDER_SCENARIO: "success",
      MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE: "true",
    },
    () => {
      assert(
        resolveMockScenario("timeout") === "timeout",
        "request override must win when explicitly allowed",
      );
    },
  );
});

Deno.test("ignores an invalid request override even when overrides are allowed", () => {
  withEnv(
    {
      MOCK_PROVIDER_SCENARIO: "delayed",
      MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE: "true",
    },
    () => {
      assert(
        resolveMockScenario("not-a-real-scenario") === "delayed",
        "must fall back to the environment scenario for an invalid override",
      );
    },
  );
});

Deno.test("timing config defaults when environment variables are unset or invalid", () => {
  withEnv({}, () => {
    const config = resolveMockTimingConfig();
    assert(
      config.delayMs === DEFAULT_TIMING_CONFIG.delayMs,
      "delayMs must default when unset",
    );
    assert(
      config.timeoutMs === DEFAULT_TIMING_CONFIG.timeoutMs,
      "timeoutMs must default when unset",
    );
  });

  withEnv(
    { MOCK_PROVIDER_DELAY_MS: "not-a-number", MOCK_PROVIDER_TIMEOUT_MS: "-5" },
    () => {
      const config = resolveMockTimingConfig();
      assert(
        config.delayMs === DEFAULT_TIMING_CONFIG.delayMs,
        "delayMs must default for an invalid value",
      );
      assert(
        config.timeoutMs === DEFAULT_TIMING_CONFIG.timeoutMs,
        "timeoutMs must default for a negative value",
      );
    },
  );
});

Deno.test("timing config reads valid environment overrides", () => {
  withEnv(
    { MOCK_PROVIDER_DELAY_MS: "250", MOCK_PROVIDER_TIMEOUT_MS: "9000" },
    () => {
      const config = resolveMockTimingConfig();
      assert(config.delayMs === 250, "delayMs must reflect the env override");
      assert(
        config.timeoutMs === 9000,
        "timeoutMs must reflect the env override",
      );
    },
  );
});

Deno.test("extractDevScenarioOverride extracts and strips the reserved field", () => {
  const requestBody = {
    activityId: "breathing-exercise",
    userReflection: "I noticed my breathing slow down.",
    [DEV_SCENARIO_OVERRIDE_FIELD]: "timeout",
  };

  const { override, sanitizedBody } = extractDevScenarioOverride(requestBody);

  assert(override === "timeout", "must extract the raw field value");
  assert(
    !(DEV_SCENARIO_OVERRIDE_FIELD in (sanitizedBody as object)),
    "sanitized body must not contain the reserved field",
  );
  assert(
    (sanitizedBody as Record<string, unknown>).activityId ===
      "breathing-exercise",
    "sanitized body must keep every other field untouched",
  );
});

Deno.test("extractDevScenarioOverride is a no-op when the field is absent", () => {
  const requestBody = { activityId: "breathing-exercise" };
  const { override, sanitizedBody } = extractDevScenarioOverride(requestBody);

  assert(override === undefined, "no field means no override");
  assert(
    JSON.stringify(sanitizedBody) === JSON.stringify(requestBody),
    "body without the field must be returned unchanged",
  );
});

Deno.test("extractDevScenarioOverride safely handles non-object bodies", () => {
  for (const body of [null, undefined, "a string", 42, ["array", "body"]]) {
    const { override, sanitizedBody } = extractDevScenarioOverride(body);
    assert(override === undefined, `non-object body ${JSON.stringify(body)} must yield no override`);
    assert(
      sanitizedBody === body,
      `non-object body ${JSON.stringify(body)} must be returned unchanged`,
    );
  }
});
