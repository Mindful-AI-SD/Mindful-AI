import { strict as assert } from "node:assert";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { type ActivityLookup, createAiActivityEndpoint } from "./index.ts";
import { aiActivityResponseSchema } from "../../schema/aiActivitySchema.ts";
import { CRISIS_SUPPORT_RESPONSE } from "../_shared/crisisSupport.ts";
import {
  NON_AI_CONTENT_VERSION,
  PREWRITTEN_LABELS,
  WEEK_ONE_CONTENT,
  WEEK_THREE_CONTENT,
  WEEK_TWO_CONTENT,
} from "../_shared/prewritten/prewrittenContent.ts";
import {
  claudeError,
  claudeMessage,
  claudeOk,
  modelOutput,
  syntheticEvents,
  syntheticReflection,
  syntheticSensations,
} from "../../tests/fixtures/claudeProviderFixtures.ts";

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

Deno.test("ai-activity mode control, through the real middleware", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(publicKey), kid: "modes", alg: "ES256" };
  const env: Record<string, string> = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    GUIDED_REFLECTION_PROVIDER: "prewritten",
    CLAUDE_MAX_RETRIES: "0",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: "sb_publishable_test",
    }),
    SUPABASE_JWKS: JSON.stringify({ keys: [jwk] }),
  };
  const previous = Object.fromEntries(
    [...Object.keys(env), "ANTHROPIC_API_KEY"].map((key) => [
      key,
      Deno.env.get(key),
    ]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  Deno.env.delete("ANTHROPIC_API_KEY");

  const realFetch = globalThis.fetch;
  const info = console.info;
  console.info = () => undefined;
  let networkCalls = 0;
  let anthropicReply: () => Response = () => {
    throw new Error("no reply set");
  };
  globalThis.fetch = (() => {
    networkCalls += 1;
    return Promise.resolve(anthropicReply());
  }) as typeof globalThis.fetch;

  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "modes" })
    .setSubject("8bd592c3-f11e-4e44-8c58-d753028028bc")
    .setAudience("authenticated")
    .setIssuer("http://127.0.0.1:54321/auth/v1")
    .setExpirationTime("5m").sign(privateKey);

  // The daily cap has its own tests in index_test.ts; here every claim is allowed.
  const endpoint = createAiActivityEndpoint(
    undefined,
    undefined,
    published,
    () => Promise.resolve(),
  );
  const send = (method: "GET" | "POST", body?: unknown) =>
    endpoint.fetch(
      new Request("http://localhost/ai-activity", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const setMode = (mode: string) =>
    Deno.env.set("GUIDED_REFLECTION_PROVIDER", mode);

  try {
    const expected = {
      intention_mirror: WEEK_ONE_CONTENT,
      sensation_lexicon: WEEK_TWO_CONTENT,
      distraction_audit: WEEK_THREE_CONTENT,
    };
    for (const kind of Object.keys(requests) as (keyof typeof requests)[]) {
      await t.step(`${kind}: fixed content, zero network calls`, async () => {
        setMode("prewritten");
        networkCalls = 0;
        const response = await send("POST", requests[kind]);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(aiActivityResponseSchema.safeParse(body).success, true);
        assert.deepEqual(body, {
          kind,
          provider: "prewritten",
          contentVersion: NON_AI_CONTENT_VERSION,
          labels: PREWRITTEN_LABELS,
          result: expected[kind],
        });
        assert.equal(networkCalls, 0);
      });
    }

    await t.step(
      "a changed mode is refused before anything is sent",
      async () => {
        setMode("claude");
        Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-synthetic");
        networkCalls = 0;
        const refused = await send("POST", {
          ...requests.intention_mirror,
          expectedMode: "prewritten",
        });
        assert.equal(refused.status, 409);
        assert.equal((await refused.json()).error, "MODE_CHANGED");
        assert.equal(networkCalls, 0);
        Deno.env.delete("ANTHROPIC_API_KEY");
        setMode("prewritten");
        const matching = await send("POST", {
          ...requests.intention_mirror,
          expectedMode: "prewritten",
        });
        assert.equal(matching.status, 200);
        await matching.body?.cancel();
      },
    );

    await t.step("an unknown expected mode is invalid", async () => {
      const response = await send("POST", {
        ...requests.intention_mirror,
        expectedMode: "other",
      });
      assert.equal(response.status, 400);
      await response.body?.cancel();
    });

    await t.step("student text is not echoed into the result", async () => {
      setMode("prewritten");
      const response = await send("POST", requests.intention_mirror);
      assert.ok(!(await response.text()).includes("another perspective"));
    });

    await t.step("the content counts match the content pack", () => {
      assert.equal(WEEK_ONE_CONTENT.examples.length, 10);
      assert.equal(WEEK_ONE_CONTENT.reflectionPrompts.length, 4);
      assert.equal(WEEK_TWO_CONTENT.vocabulary.length, 6);
      assert.equal(WEEK_TWO_CONTENT.reflectionPrompts.length, 4);
      assert.equal(WEEK_THREE_CONTENT.categories.length, 6);
      assert.equal(NON_AI_CONTENT_VERSION, "1.0.0");
      assert.equal(
        PREWRITTEN_LABELS.resultFooter,
        "Source: Prewritten content, version 1.0",
      );
    });

    await t.step("no prewritten copy claims AI or personalization", () => {
      const copy = JSON.stringify([
        WEEK_ONE_CONTENT,
        WEEK_TWO_CONTENT,
        WEEK_THREE_CONTENT,
        PREWRITTEN_LABELS.resultFooter,
        PREWRITTEN_LABELS.modeTitle,
      ]).toLowerCase();
      for (const claim of ["personalized", "ai generated", "ai-generated"]) {
        assert.ok(!copy.includes(claim));
      }
    });

    await t.step(
      "the crisis check still runs before fixed content",
      async () => {
        setMode("prewritten");
        const response = await send("POST", {
          ...requests.intention_mirror,
          input: { reflection: "I want to hurt myself" },
        });
        assert.deepEqual(await response.json(), CRISIS_SUPPORT_RESPONSE);
      },
    );

    await t.step("invalid input is still rejected", async () => {
      setMode("prewritten");
      const response = await send("POST", {
        ...requests.intention_mirror,
        input: { reflection: "x".repeat(2001) },
      });
      assert.equal(response.status, 400);
      await response.body?.cancel();
    });

    await t.step("GET identifies the prewritten mode", async () => {
      setMode("prewritten");
      const response = await send("GET");
      assert.deepEqual(await response.json(), {
        mode: "prewritten",
        available: true,
        contentVersion: NON_AI_CONTENT_VERSION,
        labels: PREWRITTEN_LABELS,
      });
    });

    await t.step(
      "GET reports Claude as unavailable without a key",
      async () => {
        setMode("claude");
        networkCalls = 0;
        const response = await send("GET");
        const body = await response.json();
        assert.equal(body.mode, "claude");
        assert.equal(body.available, false);
        assert.equal(networkCalls, 0);
        Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-synthetic");
        const configured = await (await send("GET")).json();
        assert.equal(configured.available, true);
        assert.ok(!JSON.stringify(configured).includes("sk-ant-synthetic"));
      },
    );

    for (
      const [name, reply, status] of [
        [
          "a rejected key",
          () => claudeError(401, "authentication_error", "no"),
          501,
        ],
        ["overload", () => claudeError(529, "overloaded_error", "busy"), 502],
        ["malformed output", () => claudeOk(claudeMessage("not json")), 502],
      ] as [string, () => Response, number][]
    ) {
      await t.step(
        `Claude failure from ${name} never switches modes`,
        async () => {
          setMode("claude");
          Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-synthetic");
          anthropicReply = reply;
          const response = await send("POST", requests.intention_mirror);
          assert.equal(response.status, status);
          const text = await response.text();
          for (
            const leak of [
              WEEK_ONE_CONTENT.examples[0],
              "prewritten",
              "[Demo:",
              "intentions",
            ]
          ) {
            assert.ok(!text.includes(leak), `must not serve ${leak}`);
          }
        },
      );
    }

    await t.step("Claude success in the same mode reports Claude", async () => {
      setMode("claude");
      anthropicReply = () =>
        claudeOk(claudeMessage(JSON.stringify(modelOutput.intention_mirror)));
      const response = await send("POST", requests.intention_mirror);
      assert.equal((await response.json()).provider, "claude");
    });

    await t.step(
      "an unrecognized mode fails rather than serving mock",
      async () => {
        setMode("cluade");
        networkCalls = 0;
        const response = await send("POST", requests.intention_mirror);
        assert.equal(response.status, 501);
        assert.equal((await response.json()).error, "PROVIDER_NOT_CONFIGURED");
        assert.equal(networkCalls, 0);
        assert.deepEqual(await (await send("GET")).json(), {
          mode: null,
          available: false,
          contentVersion: null,
          labels: null,
        });
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
