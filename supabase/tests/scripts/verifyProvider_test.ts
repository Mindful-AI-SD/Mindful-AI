import { strict as assert } from "node:assert";
import {
  runVerification,
  type VerifyConfig,
} from "../../scripts/verifyProvider.ts";
import { evaluateRubric, SCENARIOS } from "../../scripts/scenarios.ts";
import { aiActivityRequestSchema } from "../../schema/aiActivitySchema.ts";

const config: VerifyConfig = {
  supabaseUrl: "http://127.0.0.1:54331",
  publishableKey: "sb_publishable_test",
  email: "synthetic@example.test",
  password: "synthetic-password",
  expectedProvider: "claude",
  scenarioSet: "smoke",
};

const intentions = [
  { title: "One", explanation: "Notice one thing." },
  { title: "Two", explanation: "Pause for one moment." },
  { title: "Three", explanation: "Choose one small step." },
];

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function fakeServer(provider: string, failWeekTwo = false) {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) {
      return Promise.resolve(reply({ access_token: "TOKEN-VALUE" }));
    }
    if (url.includes("/rest/v1/activities")) {
      return Promise.resolve(
        reply([{ id: "550e8400-e29b-41d4-a716-446655440000" }]),
      );
    }
    if (init?.method === "GET") {
      return Promise.resolve(reply({ mode: provider, available: true }));
    }
    const request = JSON.parse(String(init?.body));
    if (request.kind === "intention_mirror") {
      return Promise.resolve(reply({
        kind: request.kind,
        provider,
        result: { intentions },
      }));
    }
    if (failWeekTwo) {
      return Promise.resolve(reply({
        error: "PROVIDER_NOT_CONFIGURED",
        message: "This activity is not available yet.",
      }, 501));
    }
    return Promise.resolve(reply({
      kind: request.kind,
      provider,
      result: {
        items: request.input.sensations.map((original: string) => ({
          original,
          isVague: false,
          suggestions: [],
        })),
      },
    }));
  }) as typeof globalThis.fetch;
}

Deno.test("verification passes on validated Claude responses", async () => {
  const report = await runVerification(config, fakeServer("claude"));
  assert.equal(report.allPassed, true);
  assert.equal(report.scenarios.length, 2);
  assert.deepEqual(
    report.scenarios.map(({ kind }) => kind),
    ["intention_mirror", "sensation_lexicon"],
  );
});

Deno.test("a mock response can never pass as live Claude output", async () => {
  const report = await runVerification(config, fakeServer("mock"));
  assert.equal(report.allPassed, false);
  assert.ok(
    report.scenarios.every(({ expectedProvider }) => !expectedProvider),
  );
});

Deno.test("a failed activity fails the run and records the error code", async () => {
  const report = await runVerification(config, fakeServer("claude", true));
  assert.equal(report.allPassed, false);
  assert.equal(report.scenarios[1].status, 501);
  assert.equal(report.scenarios[1].errorCode, "PROVIDER_NOT_CONFIGURED");
});

Deno.test("the report never contains credentials", async () => {
  const report = JSON.stringify(
    await runVerification(config, fakeServer("claude")),
  );
  for (const secret of ["TOKEN-VALUE", config.password, config.email]) {
    assert.ok(!report.includes(secret));
  }
});

Deno.test("sign-in failure stops the run without echoing server text", async () => {
  const failing = (() =>
    Promise.resolve(
      reply({ message: "private-server-text" }, 400),
    )) as typeof globalThis.fetch;
  await assert.rejects(
    () => runVerification(config, failing),
    (error: Error) => !error.message.includes("private-server-text"),
  );
});

Deno.test("every scenario is a valid request", () => {
  for (const scenario of SCENARIOS) {
    const parsed = aiActivityRequestSchema.safeParse({
      kind: scenario.kind,
      activityId: "550e8400-e29b-41d4-a716-446655440000",
      activityContext: "Synthetic.",
      input: scenario.input,
    });
    assert.ok(parsed.success, scenario.name);
  }
});

Deno.test("rubric flags forbidden language in generated output", () => {
  const scenario = SCENARIOS.find(({ name }) =>
    name.includes("request for a diagnosis")
  )!;
  const results = evaluateRubric(scenario, {
    kind: "intention_mirror",
    provider: "claude",
    result: {
      intentions: [
        { title: "Your diagnosis", explanation: "Try therapy." },
        intentions[1],
        intentions[2],
      ],
    },
  });
  assert.ok(results.some(({ passed }) => !passed));
});
