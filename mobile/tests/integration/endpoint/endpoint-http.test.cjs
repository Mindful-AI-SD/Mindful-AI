const assert = require("node:assert/strict");
const test = require("node:test");
const { isDeepStrictEqual } = require("node:util");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { createClient } = require("@supabase/supabase-js");
const loadProgress = require("../../helpers/load-progress-helpers.cjs");
const serve = require("./local-server.cjs");

const errors = {
  400: {
    error: "INVALID_INPUT",
    message: "The mindfulness request is invalid.",
  },
  401: { error: "AUTH_REQUIRED", message: "Sign in to request intentions." },
  408: {
    error: "PROVIDER_TIMEOUT",
    message: "The provider timed out. Please try again.",
  },
  409: {
    error: "SUBMISSION_CONFLICT",
    message:
      "Submission is in progress or the ID was reused for different input.",
  },
  502: {
    error: "PROVIDER_ERROR",
    message: "Intentions are unavailable. Please try again.",
  },
};

test(
  "MIN-74: actual HTTP authentication, validation, and submission contracts",
  { timeout: 240000 },
  async (t) => {
    const root = resolve(__dirname, "../../../..");
    const config = JSON.parse(
      execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.equal(
      new URL(config.API_URL).hostname,
      "127.0.0.1",
      "Only local Supabase is supported",
    );
    const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
    const gitDirectory = execFileSync("git", [
      "rev-parse",
      "--absolute-git-dir",
    ], { cwd: root, encoding: "utf8" }).trim();
    const directory = mkdtempSync(resolve(gitDirectory, "min74-http-"));
    const client = createClient(config.API_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `${randomUUID()}aA!9`;
    let userId, token, stop;
    const secrets = [
      password,
      "min74-private-config-sentinel",
      ...Object.entries(config)
        .filter(([name]) => /KEY|SECRET|PASSWORD/.test(name)).map(([, value]) =>
          value
        )
        .filter((value) => typeof value === "string" && value.length > 8),
    ];
    async function post(body, authorization = token, raw = false) {
      const response = await fetch(
        `${config.API_URL}/functions/v1/mindfulness-response`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            ...(authorization
              ? { Authorization: `Bearer ${authorization}` }
              : {}),
          },
          body: raw ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const text = await response.text();
      assert.match(
        response.headers.get("content-type") || "",
        /application\/json/,
      );
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Endpoint must return valid JSON (body withheld)");
      }
      if (response.status >= 400) {
        // Do not print the body in assertion diagnostics, even on failure.
        // Exact contracts forbid extra keys, including private diagnostics.
        assert.ok(
          !secrets.some((secret) => text.includes(secret)),
          "Failure leaked a credential or private configuration value",
        );
        assert.ok(
          !/stack|SUPABASE_|MOCK_PROVIDER_|MIN74_PRIVATE_CONFIG|\[Demo:|ProviderError|ProviderTimeoutError|Error:|\bat \S+.*:\d+/i
            .test(text),
          "Failure leaked internal diagnostics",
        );
        assert.ok(
          Object.hasOwn(errors, response.status),
          `Unexpected failure status ${response.status}`,
        );
        assert.ok(
          isDeepStrictEqual(json, errors[response.status]),
          "Failure must contain only the documented error and message",
        );
      }
      return { status: response.status, body: json };
    }
    function success(result) {
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.body).sort(), [
        "intentions",
        "provider",
      ]);
      assert.equal(result.body.provider, "mock");
      assert.equal(result.body.intentions.length, 3);
      for (const intention of result.body.intentions) {
        assert.deepEqual(Object.keys(intention).sort(), [
          "explanation",
          "title",
        ]);
        for (const [field, limit] of [["title", 120], ["explanation", 1000]]) {
          assert.equal(typeof intention[field], "string");
          assert.ok(
            intention[field].trim().length > 0 &&
              intention[field].length <= limit,
          );
        }
      }
    }
    async function scenario(name) {
      if (stop) await stop();
      stop = undefined;
      stop = await serve(root, directory, name, config.API_URL);
    }
    try {
      const { data, error } = await client.auth.signUp({
        email: `min74-${randomUUID()}@example.com`,
        password,
      });
      assert.equal(error, null);
      userId = data.user?.id;
      assert.ok(data.session);
      token = data.session.access_token;
      secrets.push(token, data.session.refresh_token);
      // Auth and PostgREST containers can disagree within the JWT issuance second.
      await delay(1100);
      const activities = await client.from("activities").select(
        "id,weeks!inner(week_number)",
      ).eq("weeks.week_number", 1).limit(1);
      assert.equal(activities.error, null);
      assert.ok(
        activities.data.length,
        "Apply the merged local migrations/seed before testing",
      );
      const activityId = activities.data[0].id;
      const progress = loadProgress(client);
      const body = {
        activityId,
        submissionId: randomUUID(),
        activityContext: "Intention Mirror",
        userReflection: "I noticed my breathing.",
      };
      let saved;
      await scenario("success");
      await t.test("valid authentication returns 200 with exactly three typed intentions and reloads progress", async () => {
        saved = await post(body);
        success(saved);
        assert.ok(
          saved.body.intentions.every((item) =>
            item.title.startsWith("[Demo: Normal Success]")
          ),
          "Success scenario must be active",
        );
        assert.deepEqual(
          (await progress.loadWeekOneProgress(activityId)).generated_intentions,
          saved.body.intentions,
        );
      });
      await t.test("missing and invalid authentication return controlled 401", async () => {
        for (const auth of [null, "invalid-jwt-private-diagnostic-sentinel"]) {
          secrets.push(auth || "unused-secret-sentinel");
          assert.equal((await post(body, auth)).status, 401);
        }
      });
      await t.test("empty and malformed bodies and empty required fields return controlled 400", async () => {
        for (const raw of ["", "{", "{}", "null"]) {
          assert.equal(
            (await post(raw, token, true)).status,
            400,
          );
        }
        for (
          const field of [
            "activityId",
            "submissionId",
            "activityContext",
            "userReflection",
          ]
        ) {
          assert.equal((await post({ ...body, [field]: "" })).status, 400);
          const missing = { ...body };
          delete missing[field];
          assert.equal((await post(missing)).status, 400);
        }
        assert.equal(
          (await post({ ...body, userReflection: "   " })).status,
          400,
        );
      });
      await t.test("oversized context (4001) and reflection (2001) return controlled 400", async () => {
        for (
          const [field, length] of [["activityContext", 4001], [
            "userReflection",
            2001,
          ]]
        ) {
          assert.equal(
            (await post({ ...body, [field]: "x".repeat(length) })).status,
            400,
          );
        }
      });
      await t.test("client ownership and generated intentions cannot be submitted (400)", async () => {
        for (
          const extra of [{ user_id: randomUUID() }, {
            intentions: saved.body.intentions,
          }]
        ) {
          assert.equal((await post({ ...body, ...extra })).status, 400);
        }
      });
      await t.test("same submission and normalized retry replay 200 without rewriting progress", async () => {
        const before = await progress.loadWeekOneProgress(activityId);
        for (
          const retry of [body, body, {
            ...body,
            userReflection: `  ${body.userReflection}  `,
          }]
        ) {
          const result = await post(retry);
          success(result);
          assert.deepEqual(result, saved);
        }
        assert.deepEqual(
          await progress.loadWeekOneProgress(activityId),
          before,
        );
        const ledger = await client.from("intention_submissions").select(
          "status",
        ).eq("submission_id", body.submissionId);
        assert.equal(ledger.error, null);
        assert.deepEqual(ledger.data, [{ status: "completed" }]);
      });
      await t.test("reusing an ID with changed input returns controlled 409", async () => {
        assert.equal(
          (await post({ ...body, userReflection: "A different reflection." }))
            .status,
          409,
        );
      });
      await t.test("maximum allowed text lengths and a fresh submission ID return 200", async () => {
        success(
          await post({
            ...body,
            submissionId: randomUUID(),
            activityContext: "x".repeat(4000),
            userReflection: "x".repeat(2000),
          }),
        );
      });
      await scenario("error");
      await t.test("completed ID still replays 200 when the real provider is configured to fail", async () => {
        assert.deepEqual(await post(body), saved);
      });
      for (const [name, status] of [["error", 502], ["timeout", 408]]) {
        if (name !== "error") await scenario(name);
        await t.test(`actual provider ${name} returns ${status}; failed ID replays and preserves progress`, async () => {
          const before = await progress.loadWeekOneProgress(activityId);
          const request = { ...body, submissionId: randomUUID() };
          for (let i = 0; i < 2; i++) {
            assert.equal(
              (await post(request)).status,
              status,
            );
          }
          assert.deepEqual(
            await progress.loadWeekOneProgress(activityId),
            before,
          );
          const ledger = await client.from("intention_submissions").select(
            "status,failure_status,response",
          ).eq("submission_id", request.submissionId);
          assert.equal(ledger.error, null);
          assert.deepEqual(ledger.data, [{
            status: "failed",
            failure_status: status,
            response: null,
          }]);
        });
      }
      await scenario("delayed");
      await t.test("pending duplicate returns 409; five-second endpoint deadline returns 408 without late persistence", async () => {
        const before = await progress.loadWeekOneProgress(activityId);
        const request = { ...body, submissionId: randomUUID() };
        const first = post(request);
        // Observe the real claim before retrying, rather than manufacturing a row.
        let claimed = false;
        for (let i = 0; i < 40; i++) {
          const row = await client.from("intention_submissions").select(
            "status",
          ).eq("submission_id", request.submissionId);
          assert.equal(row.error, null);
          if (row.data[0]?.status === "processing") {
            claimed = true;
            break;
          }
          await delay(50);
        }
        // Always settle the request before assertions/cleanup.
        const duplicate = claimed ? await post(request) : null;
        const result = await first;
        assert.ok(claimed, "Request must reach the real processing state");
        assert.equal(duplicate.status, 409);
        assert.equal(result.status, 408);
        await delay(1500);
        assert.equal((await post(request)).status, 408);
        assert.deepEqual(
          await progress.loadWeekOneProgress(activityId),
          before,
        );
      });
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
