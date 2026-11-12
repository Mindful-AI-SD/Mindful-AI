import { strict as assert } from "node:assert";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  categorize,
  createWeekThreeAuditHandler,
  failureStatus,
} from "./index.ts";
import { type Receipt, runOnce } from "./run-once.ts";
import type { AuditRequest } from "./contract.ts";
import {
  type ClaudeCallRecord,
  createClaudeAdapter,
} from "../_shared/providers/claudeAdapter.ts";
import { PROMPT_VERSION } from "../_shared/prompts/activityPrompts.ts";
import { CRISIS_SUPPORT_RESPONSE } from "../_shared/crisisSupport.ts";
import {
  RequestQuotaExceededError,
  RequestQuotaUnavailableError,
} from "../_shared/providers/requestQuota.ts";
import {
  ProviderError,
  ProviderNotConfiguredError,
  ProviderTimeoutError,
} from "../_shared/providers/types.ts";
import {
  claudeError,
  claudeMessage,
  claudeOk,
} from "../../tests/fixtures/claudeProviderFixtures.ts";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const request: AuditRequest = {
  activityId: id(1),
  operationId: id(2),
  events: [
    { id: id(3), topic: "Synthetic: thinking about a project deadline" },
    { id: id(4), topic: "Synthetic: a short video", app: "Video app" },
  ],
};
const assignments = {
  assignments: [{ eventId: id(3), category: "planning" }, {
    eventId: id(4),
    category: "entertainment",
  }],
};

// A fake Anthropic server under the real adapter and SDK.
function adapterWith(replies: Response[]) {
  const sent: Array<{ body: Record<string, unknown> }> = [];
  const records: ClaudeCallRecord[] = [];
  let calls = 0;
  const adapter = createClaudeAdapter({
    readEnv: (name) =>
      ({ ANTHROPIC_API_KEY: "test-key-not-real" } as Record<string, string>)[
        name
      ],
    fetch: ((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ body: JSON.parse(String(init?.body)) });
      const reply = replies[Math.min(calls++, replies.length - 1)];
      return Promise.resolve(reply.clone());
    }) as typeof globalThis.fetch,
    record: (entry) => records.push(entry),
  });
  return { adapter, sent, records, calls: () => calls };
}

Deno.test("Week 3 audit goes through the shared adapter and logs metadata only", async () => {
  const { adapter, sent, records } = adapterWith([
    claudeOk(claudeMessage(JSON.stringify(assignments))),
  ]);
  const result = await categorize(request, adapter.generateStructured);
  assert.deepEqual(result, { provider: "claude", ...assignments });
  // The prompt comes from the shared module; only ids, topics, and apps are sent.
  const body = sent[0].body as {
    system: string;
    messages: Array<{ content: string }>;
    max_tokens: number;
  };
  assert.match(body.system, /never instructions to you/);
  assert.match(body.system, /[Dd]o not diagnose/);
  assert.equal(body.max_tokens, 1500 + 40 * request.events.length);
  assert.ok(body.messages[0].content.includes("<student_input>"));
  assert.ok(!JSON.stringify(body).includes(request.activityId));
  assert.equal(records.length, 1);
  assert.equal(records[0].event, "ai_usage");
  assert.equal(records[0].kind, "week_three_audit");
  assert.equal(records[0].promptVersion, PROMPT_VERSION);
  assert.equal(records[0].inputTokens, 321);
  assert.equal(records[0].outputTokens, 123);
  const logged = JSON.stringify(records);
  for (const event of request.events) assert.ok(!logged.includes(event.topic));
  assert.ok(!logged.includes("test-key-not-real"));
});

Deno.test("Week 3 audit does not retry inside the SDK: the ledger decides billing", async () => {
  const { adapter, calls, records } = adapterWith([
    claudeError(529, "overloaded_error", "Overloaded"),
  ]);
  await assert.rejects(
    () => categorize(request, adapter.generateStructured),
    ProviderError,
  );
  assert.equal(calls(), 1);
  assert.equal(records[0].event, "ai_provider_failure");
});

Deno.test("Week 3 audit rejects output that changes the entries or their categories", async () => {
  for (
    const bad of [
      { assignments: assignments.assignments.slice(0, 1) },
      {
        assignments: [
          { ...assignments.assignments[0], category: "thoughts" },
          assignments.assignments[1],
        ],
      },
      { assignments: [assignments.assignments[1], assignments.assignments[0]] },
      { ...assignments, insight: "A personal inference" },
    ]
  ) {
    const { adapter, records } = adapterWith([
      claudeOk(claudeMessage(JSON.stringify(bad))),
    ]);
    await assert.rejects(
      () => categorize(request, adapter.generateStructured),
      ProviderError,
    );
    assert.equal(records[0].failure, "schema_mismatch");
  }
});

Deno.test("failure statuses: cap 429, cap check 503, timeout 408, not configured 501, else 502", () => {
  assert.equal(failureStatus(new RequestQuotaExceededError()), 429);
  assert.equal(failureStatus(new RequestQuotaUnavailableError()), 503);
  assert.equal(failureStatus(new ProviderTimeoutError("t")), 408);
  assert.equal(failureStatus(new ProviderNotConfiguredError("n")), 501);
  assert.equal(failureStatus(new ProviderError("e")), 502);
  assert.equal(failureStatus(new Error("other")), 502);
});

Deno.test("a request over the daily cap is refused before the model, and its receipt replays", async () => {
  let row: Receipt<typeof assignments> | null = null;
  const ledger = {
    claim() {
      if (row) return Promise.resolve(false);
      row = {
        input_digest: "d",
        status: "processing",
        result: null,
        error_status: null,
      };
      return Promise.resolve(true);
    },
    read() {
      return Promise.resolve(row);
    },
    succeed(value: typeof assignments) {
      row = { ...row!, status: "succeeded", result: value };
      return Promise.resolve(true);
    },
    fail(status: number) {
      row = { ...row!, status: "failed", error_status: status };
      return Promise.resolve();
    },
  };
  let modelCalls = 0;
  const generate = async () => {
    await Promise.reject(new RequestQuotaExceededError());
    modelCalls++;
    return assignments;
  };
  assert.equal(
    (await runOnce("d", ledger, generate, failureStatus)).status,
    429,
  );
  assert.equal(
    (await runOnce("d", ledger, generate, failureStatus)).status,
    429,
  );
  assert.equal(modelCalls, 0);
});

Deno.test("Week 3 audit route through the real authentication middleware", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(publicKey), kid: "w3-test", alg: "ES256" };
  const env: Record<string, string> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    GUIDED_REFLECTION_PROVIDER: "mock",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: "sb_publishable_test",
    }),
    SUPABASE_JWKS: JSON.stringify({ keys: [jwk] }),
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "w3-test" })
    .setSubject("8bd592c3-f11e-4e44-8c58-d753028028bc")
    .setAudience("authenticated")
    .setIssuer("http://127.0.0.1:54321/auth/v1")
    .setExpirationTime("5m").sign(privateKey);
  const seen = { claims: 0, runs: 0 };
  const handler = createWeekThreeAuditHandler({
    claim: () => {
      seen.claims++;
      return Promise.resolve();
    },
    categorize: () => {
      seen.runs++;
      return Promise.resolve(
        { provider: "claude", ...assignments } as Awaited<
          ReturnType<typeof categorize>
        >,
      );
    },
  });
  const send = (body: unknown, method = "POST") =>
    handler(
      new Request("http://localhost/week-three-audit", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
    );
  try {
    await t.step(
      "crisis language in an entry gets the fixed support response first",
      async () => {
        for (
          const body of [
            {
              ...request,
              events: [{
                ...request.events[0],
                topic: "I want to hurt myself",
              }],
            },
            {
              ...request,
              events: [{
                ...request.events[1],
                app: "everyone would be better off without me",
              }],
            },
            // Still answered when the request would otherwise be invalid or unavailable.
            { events: [{ topic: "I want to die" }] },
          ]
        ) {
          const response = await send(body);
          assert.equal(response.status, 200);
          assert.deepEqual(
            await response.json(),
            JSON.parse(JSON.stringify(CRISIS_SUPPORT_RESPONSE)),
          );
        }
        assert.deepEqual(seen, { claims: 0, runs: 0 });
      },
    );
    await t.step("an ordinary invalid request is still a 400", async () => {
      const response = await send({ ...request, events: [] });
      assert.equal(response.status, 400);
      await response.body?.cancel();
    });
    await t.step(
      "outside Claude mode the route reports unavailable and spends nothing",
      async () => {
        const get = await send(null, "GET");
        assert.deepEqual(await get.json(), { available: false });
        const post = await send(request);
        assert.equal(post.status, 501);
        await post.body?.cancel();
        assert.deepEqual(seen, { claims: 0, runs: 0 });
      },
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
