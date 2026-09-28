import { strict as assert } from "node:assert";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import endpoint from "./index.ts";

Deno.test("endpoint shell with real Supabase authentication middleware", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = {
    ...await exportJWK(publicKey),
    kid: "shell-test",
    alg: "ES256",
  };
  const env = {
    SUPABASE_URL: "http://127.0.0.1:54321",
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
    activityId: "week-1-intention",
    activityContext: "Intention Mirror",
    userReflection: "Private reflection text",
  };
  async function request(body: string, bearer?: string, method = "POST") {
    return await endpoint.fetch(
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
      "signed user receives the typed placeholder without private input",
      async () => {
        const response = await request(JSON.stringify(payload), validToken);
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get("content-type")!,
          /application\/json/,
        );
        assert.deepEqual(await response.json(), {
          activityId: payload.activityId,
          reply:
            "Your reflection has been received. Mindfulness responses are coming soon.",
          status: "placeholder",
        });
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
          assert.equal(typeof await response.json(), "object");
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
