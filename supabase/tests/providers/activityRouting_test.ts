// Tests for general AI activity routing: activity kind -> provider name ->
// implementation, with the mock as the default.
import {
  getActivityProvider,
  isProviderName,
  runAiActivity,
} from "../../functions/_shared/providers/providerSelector.ts";
import {
  AI_ACTIVITY_KINDS,
  type AiActivityCall,
  ProviderError,
  ProviderNotConfiguredError,
  ProviderTimeoutError,
} from "../../functions/_shared/providers/types.ts";
import { aiActivityResponseSchema } from "../../schema/aiActivitySchema.ts";
import {
  exampleEvents,
  exampleResult,
} from "../fixtures/distractionAuditExample.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const ENV_KEYS = [
  "GUIDED_REFLECTION_PROVIDER",
  "MOCK_PROVIDER_SCENARIO",
  "MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE",
  "MOCK_PROVIDER_DELAY_MS",
  "MOCK_PROVIDER_TIMEOUT_MS",
];

async function withEnv(
  vars: Record<string, string>,
  run: () => void | Promise<void>,
) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, Deno.env.get(key)]),
  );

  for (const key of ENV_KEYS) Deno.env.delete(key);
  for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);

  try {
    await run();
  } finally {
    for (const key of ENV_KEYS) Deno.env.delete(key);
    for (const [key, value] of Object.entries(previous)) {
      if (value !== undefined) Deno.env.set(key, value);
    }
  }
}

const CALLS: AiActivityCall[] = [
  {
    kind: "intention_mirror",
    activityContext: "Intention Mirror",
    input: { reflection: "I noticed my breathing slow down." },
  },
  {
    kind: "sensation_lexicon",
    activityContext: "Sensation Lexicon",
    input: { sensations: ["tight shoulders", "weird", "fine"] },
  },
  {
    kind: "distraction_audit",
    activityContext: "Distraction Audit",
    input: { events: exampleEvents },
  },
];

async function outcome(run: () => Promise<unknown>) {
  try {
    return { value: await run(), error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}

Deno.test("routing: every activity kind has a call in this suite", () => {
  assert(
    JSON.stringify(CALLS.map((call) => call.kind)) ===
      JSON.stringify(AI_ACTIVITY_KINDS),
    "add a call here when a new kind is added",
  );
});

for (const call of CALLS) {
  Deno.test(`routing: ${call.kind} defaults to the mock and returns its typed result`, async () => {
    await withEnv({}, async () => {
      const output = await runAiActivity(call);
      const parsed = aiActivityResponseSchema.safeParse(output);

      assert(output.kind === call.kind, "result must carry the call's kind");
      assert(output.provider === "mock", "the default provider is the mock");
      assert(parsed.success, "result must satisfy the shared response schema");
    });
  });

  Deno.test(`routing: ${call.kind} follows GUIDED_REFLECTION_PROVIDER`, async () => {
    await withEnv({ GUIDED_REFLECTION_PROVIDER: "future" }, async () => {
      const { error } = await outcome(() => runAiActivity(call));

      assert(
        error instanceof ProviderNotConfiguredError,
        "the unimplemented provider must reject, not fall back to the mock",
      );
    });
  });

  Deno.test(`routing: ${call.kind} falls back to the mock for an unrecognized provider name`, async () => {
    await withEnv(
      { GUIDED_REFLECTION_PROVIDER: "not-a-real-provider" },
      async () => {
        const warn = console.warn;
        console.warn = () => {};
        try {
          const output = await runAiActivity(call);
          assert(output.provider === "mock", "must fall back to the mock");
        } finally {
          console.warn = warn;
        }
      },
    );
  });

  Deno.test(`routing: ${call.kind} honors an explicit provider name over the environment`, async () => {
    await withEnv({ GUIDED_REFLECTION_PROVIDER: "future" }, async () => {
      const output = await runAiActivity(call, "mock");
      assert(output.provider === "mock", "explicit name must win");
    });
    await withEnv({}, async () => {
      const { error } = await outcome(() => runAiActivity(call, "future"));
      assert(
        error instanceof ProviderNotConfiguredError,
        "explicit name must win over the default",
      );
    });
  });

  Deno.test(`routing: ${call.kind} mock follows the server scenario settings`, async () => {
    await withEnv({ MOCK_PROVIDER_SCENARIO: "error" }, async () => {
      const { error } = await outcome(() => runAiActivity(call));
      assert(error instanceof ProviderError, "error scenario must reject");
    });
    await withEnv(
      { MOCK_PROVIDER_SCENARIO: "timeout", MOCK_PROVIDER_TIMEOUT_MS: "5" },
      async () => {
        const { error } = await outcome(() => runAiActivity(call));
        assert(
          error instanceof ProviderTimeoutError,
          "timeout scenario must reject",
        );
      },
    );
    await withEnv(
      { MOCK_PROVIDER_SCENARIO: "delayed", MOCK_PROVIDER_DELAY_MS: "20" },
      async () => {
        const start = performance.now();
        const output = await runAiActivity(call);
        assert(
          performance.now() - start >= 20,
          "delayed scenario must wait",
        );
        assert(
          aiActivityResponseSchema.safeParse(output).success,
          "delayed scenario must still return the typed result",
        );
      },
    );
  });

  Deno.test(`routing: ${call.kind} is deterministic for the same call`, async () => {
    await withEnv({}, async () => {
      assert(
        JSON.stringify(await runAiActivity(call)) ===
          JSON.stringify(await runAiActivity(call)),
        "same call must give the same result",
      );
    });
  });
}

Deno.test("routing: each kind returns its own result shape, not another kind's", async () => {
  await withEnv({}, async () => {
    const [mirror, lexicon] = await Promise.all(
      CALLS.map((call) => runAiActivity(call)),
    );

    assert(
      JSON.stringify(Object.keys(mirror.result)) === '["intentions"]',
      "intention_mirror returns intentions",
    );
    assert(
      JSON.stringify(Object.keys(lexicon.result)) === '["items"]',
      "sensation_lexicon returns items",
    );
  });
});

Deno.test("routing: every kind has an implementation for every provider name", () => {
  for (const kind of AI_ACTIVITY_KINDS) {
    for (const name of ["mock", "future"] as const) {
      assert(isProviderName(name), `${name} must be a provider name`);
      assert(
        typeof getActivityProvider(kind, name) === "function",
        `${kind} must have a ${name} implementation`,
      );
    }
  }
});

Deno.test("routing: getActivityProvider returns the unwrapped result for its kind", async () => {
  await withEnv({}, async () => {
    const output = await getActivityProvider("sensation_lexicon")(
      "Sensation Lexicon",
      { sensations: ["tight shoulders", "weird", "fine"] },
    );

    assert(
      JSON.stringify(Object.keys(output).sort()) === '["provider","result"]',
      "a provider returns provider and result only",
    );
    assert(output.result.items.length === 3, "three items");
  });
});

Deno.test("routing: distraction_audit returns the documented example through the mock", async () => {
  await withEnv({}, async () => {
    const output = await runAiActivity({
      kind: "distraction_audit",
      activityContext: "Distraction Audit",
      input: { events: exampleEvents },
    });

    assert(
      JSON.stringify(output) ===
        JSON.stringify({
          kind: "distraction_audit",
          provider: "mock",
          result: exampleResult,
        }),
      "routed result must equal the documented example",
    );
  });
});

Deno.test("routing: distraction_audit answers an empty log without calling any provider", async () => {
  const empty: AiActivityCall = {
    kind: "distraction_audit",
    activityContext: "Distraction Audit",
    input: { events: [] },
  };

  // Every one of these settings makes a provider call fail, so a result
  // proves no provider was called.
  const failingSettings: Record<string, string>[] = [
    { MOCK_PROVIDER_SCENARIO: "error" },
    { MOCK_PROVIDER_SCENARIO: "timeout", MOCK_PROVIDER_TIMEOUT_MS: "5000" },
    { GUIDED_REFLECTION_PROVIDER: "future" },
  ];
  for (const vars of failingSettings) {
    await withEnv(vars, async () => {
      const start = performance.now();
      const output = await runAiActivity(empty);

      assert(performance.now() - start < 1000, "must not wait on a provider");
      assert(
        JSON.stringify(output.result) ===
          JSON.stringify({
            totalEvents: 0,
            categories: [],
            uncategorized: { count: 0, percent: 0 },
            assignments: [],
          }),
        "empty log must produce an empty audit",
      );
    });
  }
});
