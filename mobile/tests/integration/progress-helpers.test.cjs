// Local Docker-backed integration test. Never uses a service-role client.
const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const load = require("../helpers/load-progress-helpers.cjs");

test("progress helpers against local Supabase Auth, Postgres and RLS", async (t) => {
  const config = JSON.parse(
    execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
      cwd: require("node:path").join(__dirname, "../../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assert.equal(
    new URL(config.API_URL).hostname,
    "127.0.0.1",
    "Only local Supabase is permitted",
  );
  const client = () =>
    createClient(config.API_URL, config.PUBLISHABLE_KEY || config.ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const alice = client(), bob = client(), unsigned = client();
  const users = [];
  try {
    for (const c of [alice, bob]) {
      const { data, error } = await c.auth.signUp({
        email: `min64-${randomUUID()}@example.com`,
        password: `${randomUUID()}aA!9`,
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    const { data: activities, error } = await alice.from("activities")
      .select("id,weeks!inner(week_number)").eq("weeks.week_number", 1).limit(
        1,
      );
    assert.equal(error, null);
    assert.ok(
      activities.length,
      "Local migrations must seed a published Week 1 activity",
    );
    const id = activities[0].id,
      a = load(alice),
      b = load(bob),
      anon = load(unsigned);
    await t.test("create using defaults and reload", async () => {
      assert.equal(await a.loadWeekOneProgress(id), null);
      const created = await a.upsertWeekOneProgress(id, {});
      assert.equal(created.user_id, users[0]);
      assert.equal(created.status, "not_started");
      assert.equal(created.current_step, "breathing");
      assert.equal(created.completed_at, null);
      assert.deepEqual(await a.loadWeekOneProgress(id), created);
    });
    await t.test("update all allowed fields and preserve omitted values", async () => {
      const patch = {
        status: "in_progress",
        current_step: "writing",
        writing: "private draft",
        generated_intentions: [{ title: "Notice", explanation: "Breathe" }],
        reflection_answers: { first: "Noticed my breath" },
        started_at: new Date().toISOString(),
        completed_at: null,
      };
      await a.upsertWeekOneProgress(id, patch);
      const changed = await a.upsertWeekOneProgress(id, {
        current_step: "intention_mirror",
      });
      assert.equal(changed.writing, patch.writing);
      assert.deepEqual(
        changed.generated_intentions,
        patch.generated_intentions,
      );
      assert.deepEqual(changed.reflection_answers, patch.reflection_answers);
      const completed = await a.upsertWeekOneProgress(id, {
        status: "completed",
        current_step: "completed",
        completed_at: new Date().toISOString(),
      });
      assert.equal(completed.status, "completed");
      assert.ok(completed.completed_at);
    });
    await t.test("repeated and concurrent upserts keep one row", async () => {
      await Promise.all(
        Array.from(
          { length: 4 },
          () => a.upsertWeekOneProgress(id, { writing: "same" }),
        ),
      );
      const { data, error } = await alice.from("progress").select("user_id").eq(
        "activity_id",
        id,
      );
      assert.equal(error, null);
      assert.equal(data.length, 1);
      assert.equal((await a.loadWeekOneProgress(id)).writing, "same");
    });
    await t.test("missing auth and client-supplied ownership rejected", async () => {
      await assert.rejects(anon.loadWeekOneProgress(id), /Sign in/);
      await assert.rejects(anon.upsertWeekOneProgress(id, {}), /Sign in/);
      for (const field of ["user_id", "activity_id", "updated_at", "unknown"]) {
        await assert.rejects(
          a.upsertWeekOneProgress(id, { [field]: users[1] }),
          /Unsupported/,
        );
      }
    });
    await t.test("helpers isolate two real users", async () => {
      assert.equal(await b.loadWeekOneProgress(id), null);
      await b.upsertWeekOneProgress(id, { writing: "bob private" });
      assert.equal((await a.loadWeekOneProgress(id)).writing, "same");
      assert.equal((await b.loadWeekOneProgress(id)).writing, "bob private");
    });
    await t.test("RLS blocks direct cross-user SELECT, INSERT, UPDATE and ownership transfer", async () => {
      const read = await bob.from("progress").select("*").eq(
        "user_id",
        users[0],
      );
      assert.equal(read.error, null);
      assert.deepEqual(read.data, []);
      const insert = await bob.from("progress").upsert({
        user_id: users[0],
        activity_id: id,
        writing: "attack",
      }, { onConflict: "user_id,activity_id" });
      assert.ok(insert.error);
      const update = await bob.from("progress").update({ writing: "attack" })
        .eq("user_id", users[0]).select();
      assert.equal(update.error, null);
      assert.deepEqual(update.data, []);
      const transfer = await alice.from("progress").update({
        user_id: users[1],
      }).eq("user_id", users[0]);
      assert.ok(transfer.error);
      assert.equal((await a.loadWeekOneProgress(id)).writing, "same");
    });
    await t.test("database completion constraint is retained with safe errors", async () => {
      await assert.rejects(
        b.upsertWeekOneProgress(id, { status: "completed" }),
        { message: "Could not save progress. Please retry." },
      );
      assert.equal((await b.loadWeekOneProgress(id)).status, "not_started");
    });
  } finally {
    // Remove only these newly created local fixture accounts; FK cascades remove
    // their progress. Admin SQL is test cleanup only, never used by the helpers.
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
