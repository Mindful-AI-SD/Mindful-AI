import { strict as assert } from "node:assert";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createMindfulnessEndpoint as createActualEndpoint } from "./index.ts";
import type { SubmissionStore } from "./submissions.ts";
const passStore: SubmissionStore = {
  claim: () => Promise.resolve({ status: "claimed" }),
  finish: () => Promise.resolve(),
};
const createMindfulnessEndpoint = (
  provider?: Parameters<typeof createActualEndpoint>[0],
  timeout?: number,
) => createActualEndpoint(provider, timeout, passStore);
const endpoint = createMindfulnessEndpoint();
import {
  ProviderError,
  ProviderTimeoutError,
} from "../_shared/providers/types.ts";
import { guidedReflectionResponseSchema } from "../../schema/guidedReflectionSchema.ts";

Deno.test("mindfulness endpoint with real Supabase authentication middleware", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = {
    ...await exportJWK(publicKey),
    kid: "shell-test",
    alg: "ES256",
  };
  const env = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    MOCK_PROVIDER_SCENARIO: "success",
    MOCK_PROVIDER_TIMEOUT_MS: "1",
    MOCK_PROVIDER_DELAY_MS: "1",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: "sb_publishable_test",
    }),
    SUPABASE_JWKS: JSON.stringify({ keys: [jwk] }),
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const token = (expiration: string, key = privateKey) =>
    new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "shell-test" })
      .setSubject("8bd592c3-f11e-4e44-8c58-d753028028bc")
      .setAudience("authenticated")
      .setIssuer("http://127.0.0.1:54321/auth/v1")
      .setExpirationTime(expiration).sign(key);
  const validToken = await token("5m");
  const payload = {
    activityId: "550e8400-e29b-41d4-a716-446655440000",
    submissionId: "660e8400-e29b-41d4-a716-446655440000",
    activityContext: "Intention Mirror",
    userReflection: "Private reflection text",
  };
  async function request(
    body: string,
    bearer?: string,
    method = "POST",
    handler = endpoint,
  ) {
    return await handler.fetch(
      new Request("http://localhost/mindfulness-response", {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        ...(method === "POST" ? { body } : {}),
      }),
    );
  }
  try {
    await t.step(
      "signed user receives exactly three mock intentions without private input",
      async () => {
        const response = await request(JSON.stringify(payload), validToken);
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get("content-type")!,
          /application\/json/,
        );
        const output = await response.json();
        assert.ok(guidedReflectionResponseSchema.safeParse(output).success);
        assert.equal(output.intentions.length, 3);
        assert.equal(output.provider, "mock");
        assert.ok(!JSON.stringify(output).includes(payload.userReflection));
      },
    );
    const wrongKey = (await generateKeyPair("ES256")).privateKey;
    for (
      const [name, bearer] of [
        ["missing", undefined],
        ["malformed", "invalid"],
        ["expired", await token("-1h")],
        ["wrong signature", await token("5m", wrongKey)],
      ] as const
    ) {
      await t.step(
        `${name} token returns controlled JSON 401 before parsing input`,
        async () => {
          const response = await request("not json", bearer);
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), {
            error: "AUTH_REQUIRED",
            message: "Sign in to request intentions.",
          });
          assert.ok(response.headers.get("access-control-allow-origin"));
        },
      );
    }
    for (
      const body of [
        "not json",
        "null",
        "[]",
        "{}",
        JSON.stringify({ ...payload, userReflection: 42 }),
      ]
    ) {
      await t.step(`invalid body ${body} returns 400`, async () => {
        assert.equal((await request(body, validToken)).status, 400);
      });
    }
    await t.step(
      "validation runs before the provider and rejects generated intentions",
      async () => {
        let calls = 0;
        const handler = createMindfulnessEndpoint(() => {
          calls++;
          throw new Error("must not run");
        });
        for (
          const bad of [
            null,
            {},
            { ...payload, intentions: [] },
            { ...payload, activityId: "Bad ID" },
            { ...payload, activityContext: " " },
            { ...payload, userReflection: "ab" },
            { ...payload, userReflection: "x".repeat(2001) },
          ]
        ) {
          const response = await request(
            JSON.stringify(bad),
            validToken,
            "POST",
            handler,
          );
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), {
            error: "INVALID_INPUT",
            message: "The mindfulness request is invalid.",
          });
        }
        assert.equal(calls, 0);
        const unsigned = await request(
          JSON.stringify(payload),
          undefined,
          "POST",
          handler,
        );
        assert.equal(unsigned.status, 401);
        assert.deepEqual(await unsigned.json(), {
          error: "AUTH_REQUIRED",
          message: "Sign in to request intentions.",
        });
        assert.equal(calls, 0);
      },
    );
    const intentions = Array.from(
      { length: 3 },
      () => ({ title: " Notice ", explanation: " Breathe slowly. " }),
    );
    await t.step("normalizes validated input and output", async () => {
      const handler = createMindfulnessEndpoint((context, reflection) => {
        assert.equal(context, payload.activityContext);
        assert.equal(reflection, payload.userReflection);
        return Promise.resolve({ intentions, provider: "mock" });
      });
      const response = await request(
        JSON.stringify({
          ...payload,
          activityContext: ` ${payload.activityContext} `,
          userReflection: ` ${payload.userReflection} `,
        }),
        validToken,
        "POST",
        handler,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        intentions: intentions.map(() => ({
          title: "Notice",
          explanation: "Breathe slowly.",
        })),
        provider: "mock",
      });
    });
    for (
      const bad of [
        null,
        { intentions: intentions.slice(0, 2), provider: "mock" },
        { intentions: [...intentions, intentions[0]], provider: "mock" },
        { intentions: ["one", "two", "three"], provider: "mock" },
        { intentions, provider: "other" },
        { intentions, provider: "mock", stack: "private-diagnostic" },
      ]
    ) {
      await t.step("invalid provider output returns safe 502", async () => {
        const response = await request(
          JSON.stringify(payload),
          validToken,
          "POST",
          createMindfulnessEndpoint(() => Promise.resolve(bad)),
        );
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
          error: "PROVIDER_ERROR",
          message: "Intentions are unavailable. Please try again.",
        });
      });
    }
    for (
      const error of [
        new ProviderTimeoutError("private-diagnostic"),
        new ProviderError("private-diagnostic"),
        new Error("private-diagnostic"),
        "private-diagnostic",
      ]
    ) {
      await t.step("provider exceptions never leak diagnostics", async () => {
        const response = await request(
          JSON.stringify(payload),
          validToken,
          "POST",
          createMindfulnessEndpoint(() => {
            throw error;
          }),
        );
        const timeout = error instanceof ProviderTimeoutError;
        assert.equal(response.status, timeout ? 408 : 502);
        assert.deepEqual(
          await response.json(),
          timeout
            ? {
              error: "PROVIDER_TIMEOUT",
              message: "The provider timed out. Please try again.",
            }
            : {
              error: "PROVIDER_ERROR",
              message: "Intentions are unavailable. Please try again.",
            },
        );
      });
    }
    await t.step(
      "unsettled provider is bounded by the endpoint deadline",
      async () => {
        const handler = createMindfulnessEndpoint(
          () => new Promise(() => {}),
          5,
        );
        const response = await request(
          JSON.stringify(payload),
          validToken,
          "POST",
          handler,
        );
        assert.equal(response.status, 408);
        assert.deepEqual(await response.json(), {
          error: "PROVIDER_TIMEOUT",
          message: "The provider timed out. Please try again.",
        });
      },
    );
    for (const scenario of ["delayed", "timeout", "error"]) {
      await t.step(`real adapter ${scenario} scenario`, async () => {
        Deno.env.set("MOCK_PROVIDER_SCENARIO", scenario);
        try {
          const response = await request(JSON.stringify(payload), validToken);
          assert.equal(
            response.status,
            scenario === "delayed" ? 200 : scenario === "timeout" ? 408 : 502,
          );
          const output = await response.json();
          if (scenario === "delayed") {
            assert.ok(guidedReflectionResponseSchema.safeParse(output).success);
          } else {assert.deepEqual(
              output,
              scenario === "timeout"
                ? {
                  error: "PROVIDER_TIMEOUT",
                  message: "The provider timed out. Please try again.",
                }
                : {
                  error: "PROVIDER_ERROR",
                  message: "Intentions are unavailable. Please try again.",
                },
            );}
        } finally {
          Deno.env.set("MOCK_PROVIDER_SCENARIO", "success");
        }
      });
    }
    await t.step(
      "durable submission contract: replay, conflict, and concurrent claims",
      async () => {
        const rows = new Map<
          string,
          { hash: string; response?: unknown; failureStatus?: 408 | 502 }
        >();
        let saves = 0, calls = 0;
        const store: SubmissionStore = {
          claim(id, _activity, hash) {
            const row = rows.get(id);
            if (row) {
              return Promise.resolve({
                status: row.hash !== hash
                  ? "conflict"
                  : row.response
                  ? "completed"
                  : row.failureStatus
                  ? "failed"
                  : "processing",
                response: row.response,
                failureStatus: row.failureStatus,
              });
            }
            rows.set(id, { hash });
            return Promise.resolve({ status: "claimed" });
          },
          finish(id, _token, response, failureStatus) {
            const row = rows.get(id)!;
            if (failureStatus) row.failureStatus = failureStatus;
            else {
              row.response = response;
              saves++;
            }
            return Promise.resolve();
          },
        };
        const handler = createActualEndpoint(
          () => {
            calls++;
            return Promise.resolve({ intentions, provider: "mock" });
          },
          5000,
          store,
        );
        const results = await Promise.all([
          request(JSON.stringify(payload), validToken, "POST", handler),
          request(JSON.stringify(payload), validToken, "POST", handler),
        ]);
        assert.ok(results.some((r) => r.status === 200));
        assert.ok(results.every((r) => r.status === 200 || r.status === 409));
        const replay = await request(
          JSON.stringify(payload),
          validToken,
          "POST",
          handler,
        );
        assert.equal(replay.status, 200);
        assert.equal(calls, 1);
        assert.equal(saves, 1);
        assert.equal(
          (await request(
            JSON.stringify({
              ...payload,
              userReflection: "different reflection",
            }),
            validToken,
            "POST",
            handler,
          )).status,
          409,
        );
        assert.equal(calls, 1);
        const failed = createActualEndpoint(
          () => {
            calls++;
            throw new Error("private diagnostic");
          },
          5000,
          store,
        );
        const retryBody = JSON.stringify({
          ...payload,
          submissionId: crypto.randomUUID(),
        });
        assert.equal(
          (await request(retryBody, validToken, "POST", failed)).status,
          502,
        );
        assert.equal(
          (await request(retryBody, validToken, "POST", failed)).status,
          502,
        );
        assert.equal(calls, 2);
        assert.equal(saves, 1);
      },
    );
    await t.step(
      "storage failure never returns unsaved success or calls provider before claim",
      async () => {
        let calls = 0;
        const broken: SubmissionStore = {
          claim: () => {
            throw new Error("private storage details");
          },
          finish: () => Promise.resolve(),
        };
        const handler = createActualEndpoint(
          () => {
            calls++;
            return Promise.resolve({ intentions, provider: "mock" });
          },
          5000,
          broken,
        );
        const response = await request(
          JSON.stringify(payload),
          validToken,
          "POST",
          handler,
        );
        assert.equal(response.status, 503);
        assert.equal(calls, 0);
        assert.deepEqual(await response.json(), {
          error: "PERSISTENCE_UNAVAILABLE",
          message:
            "Could not save intentions. Retry with the same submission ID.",
        });
        const commitFailure = createActualEndpoint(
          () => Promise.resolve({ intentions, provider: "mock" }),
          5000,
          {
            ...passStore,
            finish: () => {
              throw new Error("private storage details");
            },
          },
        );
        assert.equal(
          (await request(
            JSON.stringify(payload),
            validToken,
            "POST",
            commitFailure,
          )).status,
          503,
        );
      },
    );
    await t.step(
      "requires a submission UUID and rejects client user IDs",
      async () => {
        const { submissionId: _id, ...missing } = payload;
        for (
          const bad of [missing, { ...payload, submissionId: "bad" }, {
            ...payload,
            user_id: "other-user",
          }, { ...payload, activityId: "week-1-intention" }]
        ) {
          assert.equal(
            (await request(JSON.stringify(bad), validToken)).status,
            400,
          );
        }
      },
    );
    await t.step("authenticated GET returns 405 with Allow", async () => {
      const response = await request("", validToken, "GET");
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "POST");
    });
    await t.step("unsigned browser preflight succeeds", async () => {
      const response = await request("", undefined, "OPTIONS");
      assert.ok(response.ok);
      assert.ok(response.headers.get("access-control-allow-origin"));
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
