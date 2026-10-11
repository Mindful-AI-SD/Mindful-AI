const assert = require("node:assert/strict");
const test = require("node:test");
const { isDeepStrictEqual } = require("node:util");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { createClient } = require("@supabase/supabase-js");
const serve = require("./local-server.cjs");
const { status } = require("./local-supabase.cjs");

const root = resolve(__dirname, "../../../..");
const fixturePath = resolve(
  root,
  "supabase/tests/fixtures/guidedReflectionEndpointTestCases.json",
);
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
const invalidRequest = {
  error: "INVALID_GUIDED_REFLECTION",
  message: "The guided reflection request is invalid",
};
const expectedIntentions = {
  ordinary: [
    {
      title: "[Demo: Normal Success] Name one sensation",
      explanation:
        "Notice a single physical sensation from this activity and describe it without judging it.",
    },
    {
      title: "[Demo: Normal Success] Name one thought",
      explanation:
        "Identify a thought that came up during this activity and observe it as separate from yourself.",
    },
    {
      title: "[Demo: Normal Success] Carry it forward",
      explanation:
        "Choose one small way to bring this awareness into the next hour of your day.",
    },
  ],
};

// Crisis language gets the fixed support response from
// supabase/functions/_shared/crisisSupport.ts: no intentions and no session.
// The wording is still a placeholder, so assert its shape and its resources
// rather than the exact sentences.
function assertSupportResponse(body, fixtureKey) {
  assert.deepEqual(
    Object.keys(body).sort(),
    ["message", "outcome", "resources"],
    `${fixtureKey}: support response must contain only its documented fields`,
  );
  assert.equal(body.outcome, "support", `${fixtureKey}: outcome`);
  assert.ok(
    typeof body.message === "string" && body.message.trim().length > 0,
    `${fixtureKey}: support message must be present`,
  );
  assert.ok(Array.isArray(body.resources), `${fixtureKey}: resources`);
  const names = body.resources.map((resource) => resource.name).join("\n");
  assert.match(names, /988/, `${fixtureKey}: must name the 988 lifeline`);
  assert.match(
    names,
    /UCF Counseling and Psychological Services/,
    `${fixtureKey}: must name UCF CAPS`,
  );
  for (const resource of body.resources) {
    assert.deepEqual(Object.keys(resource).sort(), ["contact", "name"]);
    assert.ok(resource.contact.trim().length > 0);
  }
}

function materializeRequest(fixture, activityId) {
  const reflection = fixture.request.userReflection;
  return {
    ...fixture.request,
    activityId,
    userReflection: typeof reflection === "string"
      ? reflection
      : reflection["$repeat"].repeat(reflection.count),
  };
}

function expectedResult(fixture) {
  if (fixture.expected.status === 400) {
    return { status: 400, body: invalidRequest };
  }
  return {
    status: 200,
    body: {
      sessionId: "$uuid",
      intentions: expectedIntentions[fixture.expected.profile],
      provider: "mock",
    },
  };
}

test(
  "guided-reflection fixtures pass through the authenticated HTTP endpoint",
  { timeout: 240000 },
  async (t) => {
    const config = status(root);
    const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
    const gitDirectory = execFileSync("git", [
      "rev-parse",
      "--absolute-git-dir",
    ], { cwd: root, encoding: "utf8" }).trim();
    const directory = mkdtempSync(resolve(gitDirectory, "guided-fixtures-"));
    const client = createClient(config.API_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `${randomUUID()}aA!9`;
    let userId, token, stop;

    async function post(body) {
      const response = await fetch(
        `${config.API_URL}/functions/v1/guided-reflection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const text = await response.text();
      assert.match(
        response.headers.get("content-type") || "",
        /application\/json/,
        "Endpoint must return JSON",
      );
      let responseBody;
      try {
        responseBody = JSON.parse(text);
      } catch {
        throw new Error("Endpoint must return valid JSON");
      }
      return { status: response.status, body: responseBody };
    }

    try {
      const { data, error } = await client.auth.signUp({
        email: `guided-fixtures-${randomUUID()}@example.com`,
        password,
      });
      assert.equal(error, null, "Temporary authenticated user signup failed");
      userId = data.user?.id;
      assert.ok(data.session, "Local signup must return an authenticated session");
      token = data.session.access_token;
      await delay(1100);

      const activities = await client.from("activities").select(
        "id,weeks!inner(week_number)",
      ).eq("weeks.week_number", 1).eq("is_published", true).limit(1);
      assert.equal(activities.error, null, "Could not load a published activity");
      assert.ok(activities.data.length, "Apply the local migrations before testing");
      const activityId = activities.data[0].id;

      stop = await serve(
        root,
        directory,
        "success",
        config.API_URL,
        "guided-reflection",
      );

      for (const [fixtureKey, fixture] of Object.entries(fixtures)) {
        await t.test(fixture.name, async () => {
          const result = await post(materializeRequest(fixture, activityId));
          const expected = expectedResult(fixture);
          assert.equal(result.status, expected.status, `${fixtureKey}: HTTP status`);

          if (fixture.expected.profile === "support") {
            assertSupportResponse(result.body, fixtureKey);
          } else if (expected.status === 200) {
            assert.match(
              result.body.sessionId,
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
              `${fixtureKey}: sessionId must be a UUID`,
            );
            assert.ok(
              isDeepStrictEqual(
                { ...result.body, sessionId: "$uuid" },
                expected.body,
              ),
              `${fixtureKey}: response body must match the expected shape and values`,
            );
          } else {
            assert.ok(
              isDeepStrictEqual(result.body, expected.body),
              `${fixtureKey}: error body must match the expected shape and values`,
            );
          }
        });
      }
    } finally {
      if (stop) await stop();
      rmSync(directory, { recursive: true, force: true });
      if (userId) {
        assert.match(userId, /^[0-9a-f-]{36}$/);
        execFileSync("docker", [
          "exec",
          "supabase_db_Mindful-AI",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `delete from auth.users where id = '${userId}'`,
        ], { stdio: "pipe" });
      }
    }
  },
);