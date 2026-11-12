const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { createClient } = require("@supabase/supabase-js");
const { status, sql } = require("./endpoint/local-supabase.cjs");

// The per-student daily cap on model requests, against the real local database:
// the claim_ai_request function, the ai_request_counts table, and its access
// rules. No model is called.
const root = resolve(__dirname, "../../..");

test("AI request daily cap on local Supabase: counting, refusal, and access rules", { timeout: 120000 }, async (t) => {
  const config = status(root);
  const key = config.PUBLISHABLE_KEY || config.ANON_KEY;
  const users = [];
  async function signUp() {
    const client = createClient(config.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signUp({ email: `quota-${randomUUID()}@example.com`, password: `${randomUUID()}aA!9` });
    assert.equal(error, null, "Temporary user signup failed");
    assert.ok(data.session, "Local signup must return a session");
    users.push(data.user.id);
    return { client, id: data.user.id };
  }
  const claim = (client, limit) => client.rpc("claim_ai_request", { p_daily_limit: limit });

  try {
    const student = await signUp();
    const other = await signUp();
    // Auth and PostgREST can disagree within the token's issuance second.
    await delay(1100);

    await t.test("requests up to the limit are allowed and counted; the next is refused and not counted", async () => {
      const replies = [];
      for (let i = 0; i < 3; i++) replies.push(await claim(student.client, 2));
      for (const reply of replies) assert.equal(reply.error, null);
      assert.deepEqual(replies.map((reply) => reply.data.allowed), [true, true, false]);
      assert.deepEqual(replies.map((reply) => reply.data.count ?? null), [1, 2, null]);
      const { data, error } = await student.client.from("ai_request_counts").select("user_id,request_count");
      assert.equal(error, null);
      assert.deepEqual(data, [{ user_id: student.id, request_count: 2 }]);
    });

    await t.test("a higher limit allows more requests the same day", async () => {
      const { data, error } = await claim(student.client, 3);
      assert.equal(error, null);
      assert.deepEqual([data.allowed, data.count], [true, 3]);
    });

    await t.test("a student cannot reset, raise, delete, or write their own count", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const attempts = [
        student.client.from("ai_request_counts").update({ request_count: 0 }).eq("user_id", student.id).select(),
        student.client.from("ai_request_counts").delete().eq("user_id", student.id).select(),
        student.client.from("ai_request_counts").insert({ user_id: student.id, usage_date: "2099-01-01", request_count: 1 }).select(),
        student.client.from("ai_request_counts").upsert({ user_id: student.id, usage_date: today, request_count: 1 }).select(),
      ];
      for (const attempt of attempts) {
        const { data, error } = await attempt;
        assert.ok(error || (Array.isArray(data) && data.length === 0), "direct writes must be refused");
      }
      assert.equal(sql(`select request_count from public.ai_request_counts where user_id = '${student.id}'`), "3");
    });

    await t.test("each student sees only their own count, and counts are separate", async () => {
      const { data, error } = await other.client.from("ai_request_counts").select("user_id");
      assert.equal(error, null);
      assert.deepEqual(data, []);
      const first = await claim(other.client, 2);
      assert.deepEqual([first.data.allowed, first.data.count], [true, 1]);
    });

    await t.test("signed-out callers and out-of-range limits are refused", async () => {
      const anonymous = createClient(config.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
      assert.ok((await claim(anonymous, 2)).error, "anonymous call must fail");
      for (const limit of [0, -1, 501, null]) {
        assert.ok((await claim(student.client, limit)).error, `limit ${limit} must be refused`);
      }
      assert.equal(sql(`select request_count from public.ai_request_counts where user_id = '${student.id}'`), "3");
    });
  } finally {
    for (const id of users) {
      assert.match(id, /^[0-9a-f-]{36}$/);
      sql(`delete from auth.users where id = '${id}'`);
    }
  }
});
