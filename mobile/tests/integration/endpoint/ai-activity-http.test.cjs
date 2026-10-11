const assert = require("node:assert/strict");
const test = require("node:test");
const { isDeepStrictEqual } = require("node:util");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const vm = require("node:vm");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");
const serve = require("./local-server.cjs");
const { status, sql } = require("./local-supabase.cjs");

// Week 1, 2, and 3 mock paths through the real `ai-activity` route: the real
// Edge runtime, Supabase user authentication, the database activity lookup,
// and the merged mock adapter. Nothing here is replaced by a test double.
const root = resolve(__dirname, "../../../..");
const errors = {
  400: { error: "INVALID_INPUT", message: "The AI activity request is invalid." },
  401: { error: "AUTH_REQUIRED", message: "Sign in to use this activity." },
  404: { error: "ACTIVITY_NOT_FOUND", message: "This activity is not available." },
  405: { error: "METHOD_NOT_ALLOWED", message: "Use POST." },
  408: {
    error: "PROVIDER_TIMEOUT",
    message: "The provider timed out. Please try again.",
  },
  501: {
    error: "PROVIDER_NOT_CONFIGURED",
    message: "This activity is not available yet.",
  },
  502: {
    error: "PROVIDER_ERROR",
    message: "This activity is unavailable. Please try again.",
  },
};

// Fixtures shared with the Deno tests, e.g. the documented Week 3 example.
function fixture(name) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        resolve(root, `supabase/tests/fixtures/${name}.ts`),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    { exports },
  );
  return JSON.parse(JSON.stringify(exports));
}

test(
  "ai-activity: Week 1, 2, and 3 mock paths over real HTTP, authentication, and the database",
  { timeout: 600000 },
  async (t) => {
    const config = status(root);
    const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
    const gitDirectory = execFileSync("git", [
      "rev-parse",
      "--absolute-git-dir",
    ], { cwd: root, encoding: "utf8" }).trim();
    const directory = mkdtempSync(resolve(gitDirectory, "ai-activity-http-"));
    const client = createClient(config.API_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = `${randomUUID()}aA!9`;
    const unpublishedTitle = `integration-unpublished-${randomUUID()}`;
    const { exampleEvents, exampleResult } = fixture("distractionAuditExample");
    const { practicePlayerStates } = fixture("practicePlayerStates");
    let userId, token, stop, unpublishedId;
    const secrets = [
      password,
      "min74-private-config-sentinel",
      ...Object.entries(config)
        .filter(([name]) => /KEY|SECRET|PASSWORD/.test(name)).map(([, value]) =>
          value
        )
        .filter((value) => typeof value === "string" && value.length > 8),
    ];

    async function call(body, { authorization = token, raw = false, method = "POST" } = {}) {
      const response = await fetch(`${config.API_URL}/functions/v1/ai-activity`, {
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        },
        ...(method === "POST" ? { body: raw ? body : JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const text = await response.text();
      if (method === "OPTIONS") return { status: response.status, headers: response.headers };
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Endpoint must return valid JSON (body withheld)");
      }
      // Never print a body in assertion diagnostics, even on failure.
      assert.ok(
        !secrets.some((secret) => text.includes(secret)),
        "Response leaked a credential or private configuration value",
      );
      assert.ok(
        !/stack|SUPABASE_|MOCK_PROVIDER_|GUIDED_REFLECTION_PROVIDER|MIN74_PRIVATE_CONFIG|ProviderError|ProviderTimeoutError|Error:|\bat \S+.*:\d+/i
          .test(text),
        "Response leaked internal diagnostics",
      );
      if (response.status >= 400) {
        assert.ok(
          Object.hasOwn(errors, response.status),
          `Unexpected failure status ${response.status}`,
        );
        assert.ok(
          isDeepStrictEqual(json, errors[response.status]),
          "Failure must contain only the documented error and message",
        );
        assert.ok(!/\[Demo:/.test(text), "Failure leaked a mock label");
      }
      return { status: response.status, body: json, headers: response.headers };
    }

    async function scenario(name, extraEnv) {
      if (stop) await stop();
      stop = undefined;
      stop = await serve(root, directory, name, config.API_URL, "ai-activity", extraEnv);
    }

    function assertSupport(result) {
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.body).sort(), ["message", "outcome", "resources"]);
      assert.equal(result.body.outcome, "support");
      assert.ok(result.body.message.trim().length > 0);
      const names = result.body.resources.map((resource) => resource.name).join("\n");
      assert.match(names, /988/);
      assert.match(names, /UCF Counseling and Psychological Services/);
      for (const resource of result.body.resources) {
        assert.deepEqual(Object.keys(resource).sort(), ["contact", "name"]);
        assert.ok(resource.contact.trim().length > 0);
      }
    }

    // Rows this user can see in every table an AI endpoint could write to.
    async function storedRows() {
      const counts = {};
      for (const table of ["ai_sessions", "progress", "intention_submissions", "reflections"]) {
        const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
        assert.equal(error, null, `Could not count ${table}`);
        counts[table] = count;
      }
      return counts;
    }

    try {
      const { data, error } = await client.auth.signUp({
        email: `ai-activity-${randomUUID()}@example.com`,
        password,
      });
      assert.equal(error, null, "Temporary authenticated user signup failed");
      userId = data.user?.id;
      assert.ok(data.session, "Local signup must return an authenticated session");
      token = data.session.access_token;
      secrets.push(token, data.session.refresh_token);
      // Auth and PostgREST containers can disagree within the JWT issuance second.
      await delay(1100);

      const activities = await client.from("activities").select(
        "id,weeks!inner(week_number)",
      ).eq("weeks.week_number", 1).eq("is_published", true).limit(1);
      assert.equal(activities.error, null, "Could not load a published activity");
      assert.ok(activities.data.length, "Apply the local migrations before testing");
      const activityId = activities.data[0].id;
      unpublishedId = sql(
        `insert into public.activities (week_id, activity_type, title, sequence_number, is_published)
         select id, 'ai_lab', '${unpublishedTitle}', 9999, false from public.weeks where week_number = 1
         returning id`,
      ).split(/\s+/)[0];
      assert.match(unpublishedId, /^[0-9a-f-]{36}$/);

      const common = { activityId, activityContext: "Explore lab" };
      const sensations = ["tight shoulders", "a weird feeling in my chest", "fine"];
      const requests = {
        intention_mirror: { kind: "intention_mirror", ...common, input: { reflection: "I noticed my breathing slow down." } },
        sensation_lexicon: { kind: "sensation_lexicon", ...common, input: { sensations } },
        distraction_audit: { kind: "distraction_audit", ...common, input: { events: exampleEvents } },
      };
      const emptyAudit = { ...requests.distraction_audit, input: { events: [] } };
      const before = await storedRows();
      const saved = {};

      await scenario("success");

      await t.test("Week 1 intention_mirror returns 200 with exactly three typed intentions", async () => {
        const result = await call(requests.intention_mirror);
        assert.equal(result.status, 200);
        assert.deepEqual(Object.keys(result.body).sort(), ["kind", "provider", "result"]);
        assert.equal(result.body.kind, "intention_mirror");
        assert.equal(result.body.provider, "mock");
        assert.deepEqual(Object.keys(result.body.result), ["intentions"]);
        assert.equal(result.body.result.intentions.length, 3);
        for (const intention of result.body.result.intentions) {
          assert.deepEqual(Object.keys(intention).sort(), ["explanation", "title"]);
          assert.ok(intention.title.startsWith("[Demo: Normal Success]"), "Success scenario must be active");
          assert.ok(intention.explanation.trim().length > 0);
        }
        saved.intention_mirror = result.body;
      });

      await t.test("Week 2 sensation_lexicon returns 200 with three typed items that echo the request", async () => {
        const result = await call(requests.sensation_lexicon);
        assert.equal(result.status, 200);
        assert.deepEqual(Object.keys(result.body).sort(), ["kind", "provider", "result"]);
        assert.equal(result.body.kind, "sensation_lexicon");
        assert.equal(result.body.provider, "mock");
        const { items } = result.body.result;
        assert.deepEqual(items.map((item) => item.original), sensations);
        assert.deepEqual(items.map((item) => item.isVague), [false, true, true]);
        for (const item of items) {
          assert.deepEqual(Object.keys(item).sort(), ["isVague", "original", "suggestions"]);
          assert.equal(item.suggestions.length > 0, item.isVague);
        }
        saved.sensation_lexicon = result.body;
      });

      await t.test("Week 3 distraction_audit returns the documented audit for the documented log", async () => {
        const result = await call(requests.distraction_audit);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { kind: "distraction_audit", provider: "mock", result: exampleResult });
        saved.distraction_audit = result.body;
      });

      await t.test("Week 3 empty log returns an empty audit", async () => {
        const result = await call(emptyAudit);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.result, {
          totalEvents: 0, categories: [], uncategorized: { count: 0, percent: 0 }, assignments: [],
        });
      });

      await t.test("trimmed input and maximum lengths are accepted", async () => {
        assert.deepEqual(
          (await call({ ...requests.sensation_lexicon, input: { sensations: sensations.map((value) => `  ${value} `) } })).body,
          saved.sensation_lexicon,
        );
        assert.equal((await call({ ...requests.intention_mirror, activityContext: "x".repeat(4000), input: { reflection: "x".repeat(2000) } })).status, 200);
        assert.equal((await call({ ...requests.sensation_lexicon, input: { sensations: ["ok", "x".repeat(80), "warm hands"] } })).status, 200);
      });

      await t.test("after each Practice type, player state is rejected and clean Week 1 and Week 2 requests return identical typed results", async () => {
        for (const playerState of Object.values(practicePlayerStates)) {
          for (const kind of ["intention_mirror", "sensation_lexicon"]) {
            const request = requests[kind];
            for (const polluted of [
              { ...request, ...playerState },
              { ...request, playerState },
              { ...request, input: { ...request.input, playerState } },
            ]) {
              assert.equal((await call(polluted)).status, 400);
            }
            const result = await call(request);
            assert.equal(result.status, 200);
            assert.deepEqual(result.body, saved[kind]);
          }
        }
      });

      await t.test("missing and invalid authentication return controlled 401 for every kind", async () => {
        for (const request of Object.values(requests)) {
          for (const authorization of [null, "invalid-jwt-private-diagnostic-sentinel", key]) {
            assert.equal((await call(request, { authorization })).status, 401);
          }
        }
        assert.equal((await call("{", { authorization: null, raw: true })).status, 401);
      });

      await t.test("malformed bodies, unknown kinds, and input that does not fit the kind return controlled 400", async () => {
        for (const raw of ["", "{", "{}", "null", "[]"]) {
          assert.equal((await call(raw, { raw: true })).status, 400);
        }
        const { intention_mirror: mirror, sensation_lexicon: lexicon, distraction_audit: audit } = requests;
        for (const bad of [
          { ...lexicon, kind: "trigger_sensation_reaction" },
          { ...lexicon, kind: "intention_mirror" },
          { ...mirror, kind: "distraction_audit" },
          { ...mirror, input: { reflection: "ab" } },
          { ...mirror, input: { reflection: "   " } },
          { ...mirror, input: { reflection: "x".repeat(2001) } },
          { ...lexicon, input: { sensations: sensations.slice(0, 2) } },
          { ...lexicon, input: { sensations: [sensations[0], "x".repeat(81), sensations[2]] } },
          { ...audit, input: { events: [exampleEvents[0], exampleEvents[0]] } },
          { ...audit, input: { events: [{ ...exampleEvents[0], at: "yesterday" }] } },
          { ...audit, input: { events: [{ ...exampleEvents[0], label: "x".repeat(41) }] } },
          { ...lexicon, activityId: "week-2-sensation-lexicon" },
          { ...lexicon, activityId: "" },
          { ...lexicon, activityContext: "x".repeat(4001) },
          { ...lexicon, user_id: randomUUID() },
          { ...lexicon, provider: "future" },
          { ...lexicon, devMockScenario: "error" },
          { ...lexicon, result: saved.sensation_lexicon.result },
        ]) {
          assert.equal((await call(bad)).status, 400);
        }
      });

      await t.test("a missing activity and an unpublished activity return controlled 404", async () => {
        for (const id of [randomUUID(), unpublishedId]) {
          for (const request of Object.values(requests)) {
            assert.equal((await call({ ...request, activityId: id })).status, 404);
          }
        }
      });

      await t.test("crisis language returns the fixed support response for every kind", async () => {
        for (const request of [
          { ...requests.intention_mirror, input: { reflection: "I am worried that I might hurt myself tonight." } },
          { ...requests.intention_mirror, input: { reflection: "Lately I keep thinking everyone would be better off without me." } },
          { ...requests.sensation_lexicon, input: { sensations: [sensations[0], "I want to hurt myself", sensations[2]] } },
          { ...requests.distraction_audit, input: { events: [{ ...exampleEvents[0], label: "thinking about suicide" }] } },
          // Still answered when the request would otherwise be rejected.
          { ...requests.intention_mirror, input: { reflection: `I want to die ${"x".repeat(2001)}` } },
        ]) {
          assertSupport(await call(request));
        }
      });

      await t.test("non-POST returns 405 with Allow and preflight succeeds without a token", async () => {
        const get = await call(null, { method: "GET" });
        assert.equal(get.status, 405);
        assert.equal(get.headers.get("allow"), "POST");
        const preflight = await call(null, { method: "OPTIONS", authorization: null });
        assert.ok(preflight.status >= 200 && preflight.status < 300);
        assert.ok(preflight.headers.get("access-control-allow-origin"));
      });

      await scenario("error");
      await t.test("provider error returns controlled 502 for every kind; an empty log still succeeds", async () => {
        for (const request of Object.values(requests)) {
          assert.equal((await call(request)).status, 502);
        }
        assert.equal((await call(emptyAudit)).status, 200);
        assertSupport(await call({ ...requests.intention_mirror, input: { reflection: "I want to die" } }));
      });

      await scenario("timeout");
      await t.test("provider timeout returns controlled 408 for every kind", async () => {
        for (const request of Object.values(requests)) {
          assert.equal((await call(request)).status, 408);
        }
      });

      await scenario("delayed");
      await t.test("a provider slower than the five-second endpoint deadline returns 408 for every kind", async () => {
        const results = await Promise.all(Object.values(requests).map((request) => call(request)));
        assert.deepEqual(results.map((result) => result.status), [408, 408, 408]);
      });

      await scenario("success", { GUIDED_REFLECTION_PROVIDER: "future" });
      await t.test("selecting the unimplemented provider returns controlled 501 for every kind", async () => {
        for (const request of Object.values(requests)) {
          assert.equal((await call(request)).status, 501);
        }
      });

      await scenario("success", { GUIDED_REFLECTION_PROVIDER: "not-a-real-provider" });
      await t.test("after failures, the same requests succeed again with identical results (mock default)", async () => {
        for (const [kind, request] of Object.entries(requests)) {
          const result = await call(request);
          assert.equal(result.status, 200);
          assert.deepEqual(result.body, saved[kind]);
        }
      });

      await t.test("the endpoint stores nothing for this user", async () => {
        assert.deepEqual(await storedRows(), before);
      });
    } finally {
      if (stop) await stop();
      rmSync(directory, { recursive: true, force: true });
      sql(`delete from public.activities where title = '${unpublishedTitle}'`);
      if (userId) {
        assert.match(userId, /^[0-9a-f-]{36}$/);
        sql(`delete from auth.users where id = '${userId}'`);
      }
    }
  },
);
