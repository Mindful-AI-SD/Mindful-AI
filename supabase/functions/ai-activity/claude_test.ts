import { strict as assert } from "node:assert";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { type ActivityLookup, createAiActivityEndpoint } from "./index.ts";
import { aiActivityResponseSchema } from "../../schema/aiActivitySchema.ts";
import { CRISIS_SUPPORT_RESPONSE } from "../_shared/crisisSupport.ts";
import {
  claudeError,
  claudeMessage,
  claudeOk,
  modelOutput,
  syntheticEvents,
  syntheticReflection,
  syntheticSensations,
} from "../../tests/fixtures/claudeProviderFixtures.ts";

const SECRET = "sk-ant-synthetic-endpoint-key";
const ANTHROPIC = "https://api.anthropic.com/";
const published: ActivityLookup = () => Promise.resolve(true);

const common = {
  activityId: "550e8400-e29b-41d4-a716-446655440000",
  activityContext: "Explore lab",
};
const requests = {
  intention_mirror: {
    kind: "intention_mirror",
    ...common,
    input: { reflection: syntheticReflection },
  },
  sensation_lexicon: {
    kind: "sensation_lexicon",
    ...common,
    input: { sensations: syntheticSensations },
  },
  distraction_audit: {
    kind: "distraction_audit",
    ...common,
    input: { events: syntheticEvents },
  },
};

// The real endpoint, auth middleware, routing, adapter, and SDK, with only the
// network to Anthropic replaced.
Deno.test("ai-activity in Claude mode, through the real middleware", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(publicKey), kid: "claude", alg: "ES256" };
  const env: Record<string, string> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    GUIDED_REFLECTION_PROVIDER: "claude",
    ANTHROPIC_API_KEY: SECRET,
    CLAUDE_MAX_RETRIES: "0",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: "sb_publishable_test",
    }),
    SUPABASE_JWKS: JSON.stringify({ keys: [jwk] }),
  };
  const previous = Object.fromEntries(
    [...Object.keys(env), "CLAUDE_TIMEOUT_MS"].map((key) => [
      key,
      Deno.env.get(key),
    ]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const realFetch = globalThis.fetch;
  const info = console.info;
  console.info = () => undefined;

  let anthropicCalls = 0;
  let reply: () => Promise<Response> = () => {
    throw new Error("no reply set");
  };
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith(ANTHROPIC)) return realFetch(input, init);
    anthropicCalls += 1;
    return reply();
  }) as typeof globalThis.fetch;

  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "claude" })
    .setSubject("8bd592c3-f11e-4e44-8c58-d753028028bc")
    .setAudience("authenticated")
    .setIssuer("http://127.0.0.1:54321/auth/v1")
    .setExpirationTime("5m").sign(privateKey);

  const endpoint = createAiActivityEndpoint(undefined, undefined, published);
  const send = (body: unknown) =>
    endpoint.fetch(
      new Request("http://localhost/ai-activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }),
    );
  const replyWith = (output: unknown) => {
    reply = () =>
      Promise.resolve(claudeOk(claudeMessage(JSON.stringify(output))));
  };

  try {
    for (const kind of Object.keys(requests) as (keyof typeof requests)[]) {
      await t.step(`${kind}: validated Claude response`, async () => {
        replyWith(modelOutput[kind]);
        const response = await send(requests[kind]);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(aiActivityResponseSchema.safeParse(body).success, true);
        assert.equal(body.kind, kind);
        assert.equal(body.provider, "claude");
        const text = JSON.stringify(body);
        for (const internal of ["claude-sonnet", "input_tokens", "req_"]) {
          assert.ok(!text.includes(internal), "no internals reach the app");
        }
      });
    }

    await t.step("Week 3: the server does the arithmetic", async () => {
      replyWith(modelOutput.distraction_audit);
      const response = await send(requests.distraction_audit);
      const { result } = await response.json();
      assert.equal(result.totalEvents, 3);
      assert.deepEqual(result.uncategorized, { count: 1, percent: 33 });
    });

    await t.step(
      "an empty Week 3 log makes no call and claims no model",
      async () => {
        anthropicCalls = 0;
        const response = await send({
          ...requests.distraction_audit,
          input: { events: [] },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.provider, "server");
        assert.equal(body.result.totalEvents, 0);
        assert.deepEqual(body.result.categories, []);
        assert.equal(anthropicCalls, 0);
      },
    );

    await t.step("crisis language never reaches the model", async () => {
      anthropicCalls = 0;
      replyWith(modelOutput.intention_mirror);
      const response = await send({
        ...requests.intention_mirror,
        input: { reflection: "I want to hurt myself" },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), CRISIS_SUPPORT_RESPONSE);
      assert.equal(anthropicCalls, 0);
    });

    await t.step("invalid input never reaches the model", async () => {
      anthropicCalls = 0;
      const response = await send({
        ...requests.intention_mirror,
        input: { reflection: "x".repeat(2001) },
      });
      assert.equal(response.status, 400);
      await response.body?.cancel();
      assert.equal(anthropicCalls, 0);
    });

    const failures: [string, () => Promise<Response>, number, string][] = [
      [
        "rejected key",
        () =>
          Promise.resolve(
            claudeError(401, "authentication_error", SECRET),
          ),
        501,
        "PROVIDER_NOT_CONFIGURED",
      ],
      [
        "overload",
        () => Promise.resolve(claudeError(529, "overloaded_error", SECRET)),
        502,
        "PROVIDER_ERROR",
      ],
      [
        "malformed output",
        () => Promise.resolve(claudeOk(claudeMessage("not json"))),
        502,
        "PROVIDER_ERROR",
      ],
      [
        "refusal",
        () =>
          Promise.resolve(
            claudeOk(claudeMessage("", {
              content: [],
              stop_reason: "refusal",
            })),
          ),
        502,
        "PROVIDER_ERROR",
      ],
    ];
    for (const [name, respond, status, error] of failures) {
      await t.step(
        `${name} gives ${status} ${error}, no fake result`,
        async () => {
          reply = respond;
          const response = await send(requests.sensation_lexicon);
          assert.equal(response.status, status);
          const body = await response.json();
          assert.equal(body.error, error);
          assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
          assert.ok(!JSON.stringify(body).includes(SECRET));
        },
      );
    }

    await t.step("a provider timeout is reported as 408", async () => {
      Deno.env.set("CLAUDE_TIMEOUT_MS", "1000");
      reply = () => new Promise(() => undefined);
      // The SDK gets no abortable fetch here, so this exercises the endpoint's
      // own deadline, which outlasts the provider's by half a second.
      const started = Date.now();
      const response = await send(requests.intention_mirror);
      assert.equal(response.status, 408);
      assert.equal((await response.json()).error, "PROVIDER_TIMEOUT");
      assert.ok(Date.now() - started < 3_000);
      Deno.env.delete("CLAUDE_TIMEOUT_MS");
    });

    await t.step(
      "missing key gives 501 without calling Anthropic",
      async () => {
        Deno.env.delete("ANTHROPIC_API_KEY");
        anthropicCalls = 0;
        const response = await send(requests.intention_mirror);
        assert.equal(response.status, 501);
        assert.deepEqual(await response.json(), {
          error: "PROVIDER_NOT_CONFIGURED",
          message: "This activity is not available yet.",
        });
        assert.equal(anthropicCalls, 0);
      },
    );
  } finally {
    globalThis.fetch = realFetch;
    console.info = info;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
