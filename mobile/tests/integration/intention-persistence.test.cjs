const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const loadProgress = require("../helpers/load-progress-helpers.cjs");

test("MIN-67: authenticated endpoint, durable submissions, and progress reload", async (t) => {
  const config = JSON.parse(
    execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
      cwd: require("node:path").join(__dirname, "../../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assert.equal(new URL(config.API_URL).hostname, "127.0.0.1");
  const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
  const clients = [], users = [], tokens = [];
  const hash = (body) =>
    createHash("sha256").update(
      JSON.stringify([
        body.activityId,
        body.activityContext,
        body.userReflection,
      ]),
    ).digest("hex");
  async function post(body, token = tokens[0]) {
    const response = await fetch(
      `${config.API_URL}/functions/v1/mindfulness-response`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  }
  try {
    for (let i = 0; i < 2; i++) {
      const c = createClient(config.API_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await c.auth.signUp({
        email: `min67-${randomUUID()}@example.com`,
        password: `${randomUUID()}aA!9`,
      });
      assert.equal(error, null);
      assert.ok(data.session);
      clients.push(c);
      users.push(data.user.id);
      tokens.push(data.session.access_token);
    }
    const { data: activities, error } = await clients[0].from("activities")
      .select("id,weeks!inner(week_number)").eq("weeks.week_number", 1).limit(
        1,
      );
    assert.equal(error, null);
    assert.ok(activities.length);
    const activityId = activities[0].id;
    const body = {
      activityId,
      submissionId: randomUUID(),
      activityContext: "Intention Mirror",
      userReflection: "I noticed my breathing.",
    };
    const a = loadProgress(clients[0]), b = loadProgress(clients[1]);
    let saved;
    await t.test("success is saved and reloads through the existing MIN-64 helper", async () => {
      await a.upsertWeekOneProgress(activityId, {
        writing: "keep my draft",
        reflection_answers: { first: "keep answer" },
      });
      const result = await post(body);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      saved = result.body;
      assert.equal(saved.intentions.length, 3);
      const progress = await a.loadWeekOneProgress(activityId);
      assert.deepEqual(progress.generated_intentions, saved.intentions);
      assert.equal(progress.writing, "keep my draft");
      assert.deepEqual(progress.reflection_answers, { first: "keep answer" });
    });
    await t.test("same ID replays without rewriting progress, changed input conflicts", async () => {
      const before = await a.loadWeekOneProgress(activityId);
      for (let i = 0; i < 3; i++) {
        assert.deepEqual((await post(body)).body, saved);
      }
      assert.equal(
        (await a.loadWeekOneProgress(activityId)).updated_at,
        before.updated_at,
      );
      assert.equal(
        (await post({ ...body, userReflection: "different reflection" }))
          .status,
        409,
      );
      const rows = await clients[0].from("intention_submissions").select(
        "submission_id",
      );
      assert.equal(rows.error, null);
      assert.equal(rows.data.length, 1);
    });
    await t.test("concurrent identical requests result in one completed submission", async () => {
      const parallel = { ...body, submissionId: randomUUID() };
      const results = await Promise.all(
        Array.from({ length: 4 }, () => post(parallel)),
      );
      assert.ok(results.every((r) => r.status === 200 || r.status === 409));
      assert.ok(results.some((r) => r.status === 200));
      assert.equal((await post(parallel)).status, 200);
      const rows = await clients[0].from("intention_submissions").select(
        "status",
      ).eq("submission_id", parallel.submissionId);
      assert.equal(rows.error, null);
      assert.deepEqual(rows.data, [{ status: "completed" }]);
    });
    await t.test("missing auth and supplied ownership are rejected", async () => {
      assert.equal((await post(body, null)).status, 401);
      assert.equal((await post({ ...body, user_id: users[1] })).status, 400);
      assert.equal(
        (await post({ ...body, activityId: randomUUID() })).status,
        400,
      );
    });
    await t.test("same submission ID is isolated by user; RLS hides other submissions", async () => {
      assert.equal(await b.loadWeekOneProgress(activityId), null);
      assert.equal((await post(body, tokens[1])).status, 200);
      assert.equal((await b.loadWeekOneProgress(activityId)).user_id, users[1]);
      const other = await clients[1].from("intention_submissions").select("*")
        .eq("user_id", users[0]);
      assert.equal(other.error, null);
      assert.deepEqual(other.data, []);
      const attack = await clients[1].from("intention_submissions").update({
        status: "failed",
        response: null,
        failure_status: 502,
      }).eq("user_id", users[0]).select();
      assert.equal(attack.error, null);
      assert.deepEqual(attack.data, []);
    });
    await t.test("failed submission replays a safe error and preserves last valid intentions", async () => {
      const failed = { ...body, submissionId: randomUUID() },
        token = randomUUID();
      const before = await a.loadWeekOneProgress(activityId);
      const claim = await clients[0].rpc("claim_intention_submission", {
        p_submission_id: failed.submissionId,
        p_activity_id: activityId,
        p_request_hash: hash(failed),
        p_claim_token: token,
      });
      assert.equal(claim.error, null);
      assert.equal(claim.data.status, "claimed");
      const finish = await clients[0].rpc("finish_intention_submission", {
        p_submission_id: failed.submissionId,
        p_claim_token: token,
        p_failure_status: 502,
      });
      assert.equal(finish.error, null);
      const response = await post(failed);
      assert.equal(response.status, 502);
      assert.deepEqual(response.body, {
        error: "PROVIDER_ERROR",
        message: "Intentions are unavailable. Please try again.",
      });
      assert.deepEqual(await a.loadWeekOneProgress(activityId), before);
    });
    await t.test("in-flight submission is not reclaimed or regenerated", async () => {
      const pending = { ...body, submissionId: randomUUID() };
      const claim = await clients[0].rpc("claim_intention_submission", {
        p_submission_id: pending.submissionId,
        p_activity_id: activityId,
        p_request_hash: hash(pending),
        p_claim_token: randomUUID(),
      });
      assert.equal(claim.error, null);
      assert.equal((await post(pending)).status, 409);
    });
    await t.test("invalid output rolls back; older success cannot overwrite newer success", async () => {
      const ids = [randomUUID(), randomUUID()],
        claims = [randomUUID(), randomUUID()];
      for (let i = 0; i < 2; i++) {
        const result = await clients[0].rpc("claim_intention_submission", {
          p_submission_id: ids[i],
          p_activity_id: activityId,
          p_request_hash: hash(body),
          p_claim_token: claims[i],
        });
        assert.equal(result.error, null);
      }
      const newer = {
        ...saved,
        intentions: saved.intentions.map((x) => ({
          ...x,
          title: "Newer result",
        })),
      };
      assert.equal(
        (await clients[0].rpc("finish_intention_submission", {
          p_submission_id: ids[1],
          p_claim_token: claims[1],
          p_response: newer,
        })).error,
        null,
      );
      const bad = await clients[0].rpc("finish_intention_submission", {
        p_submission_id: ids[0],
        p_claim_token: claims[0],
        p_response: { intentions: [], provider: "mock" },
      });
      assert.ok(bad.error);
      assert.equal(
        (await clients[0].rpc("finish_intention_submission", {
          p_submission_id: ids[0],
          p_claim_token: claims[0],
          p_response: saved,
        })).error,
        null,
      );
      assert.deepEqual(
        (await a.loadWeekOneProgress(activityId)).generated_intentions,
        newer.intentions,
      );
    });
  } finally {
    for (const id of users) {
      assert.match(id, /^[0-9a-f-]{36}$/);
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
        `delete from auth.users where id = '${id}'`,
      ], { stdio: "pipe" });
    }
  }
});
