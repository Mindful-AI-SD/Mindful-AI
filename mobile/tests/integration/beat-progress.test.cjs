// Local Supabase Auth/Postgres/RLS tests, using public clients only.
const assert = require("node:assert/strict");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { createClient } = require("@supabase/supabase-js");
const load = require("../helpers/load-beat-progress.cjs");

test("MIN-110: independent weekly beats, real authentication, RLS, and legacy preservation", async (t) => {
  const root = resolve(__dirname, "../../..");
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
  const a = load(alice), b = load(bob), anon = load(unsigned);
  let weekId, otherWeekId, activityId, oldAlice, oldBob, arrive, fixtureWeekId;
  try {
    for (const c of [alice, bob]) {
      const { data, error } = await c.auth.signUp({
        email: `min110-${randomUUID()}@example.com`,
        password: `${randomUUID()}aA!9`,
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    await delay(1100); // Avoid the local Auth/PostgREST JWT issuance-second skew.
    const activities = await alice.from("activities").select(
      "id,week_id,weeks!inner(week_number)",
    ).eq("weeks.week_number", 1).limit(1);
    assert.equal(activities.error, null);
    assert.ok(activities.data.length);
    ({ id: activityId, week_id: weekId } = activities.data[0]);
    oldAlice = await a.legacy.upsertWeekOneProgress(activityId, {
      status: "in_progress",
      current_step: "yellowdig_draft",
      writing: "legacy draft",
      reflection_answers: {
        legacy_unknown_answer: "keep my private answer",
        yellowdig_draft: "old discussion draft",
      },
      generated_intentions: [{
        title: "Legacy",
        explanation: "Keep this result",
      }],
      started_at: "2026-09-25T12:00:00Z",
    });
    oldBob = await b.legacy.upsertWeekOneProgress(activityId, {
      status: "completed",
      current_step: "completed",
      writing: "completed draft",
      reflection_answers: { old_answer: "Keep completed answers" },
      completed_at: "2026-09-26T12:00:00Z",
    });
    await t.test("local migration applies without changing pre-existing legacy rows", async () => {
      execFileSync("npx", ["--yes", "supabase", "migration", "up", "--local"], {
        cwd: root,
        stdio: "pipe",
      });
      assert.deepEqual(
        await a.legacy.loadWeekOneProgress(activityId),
        oldAlice,
      );
      assert.deepEqual(await b.legacy.loadWeekOneProgress(activityId), oldBob);
      const weeks = await alice.from("weeks").select("id").eq("week_number", 2)
        .single();
      assert.equal(weeks.error, null);
      otherWeekId = weeks.data.id;
    });
    await t.test("signed-in owner creates Arrive with database timestamps", async () => {
      assert.equal(await a.beats.loadBeatProgress(weekId, "arrive"), null);
      arrive = await a.beats.upsertBeatProgress(weekId, "arrive", {
        status: "in_progress",
        answers: { mood: "3" },
        saved_data: { draft: { text: "private", values: [1, true, null] } },
        resume_state: { question: 2 },
      });
      assert.equal(arrive.user_id, users[0]);
      assert.equal(arrive.week_id, weekId);
      assert.equal(arrive.beat_id, "arrive");
      assert.equal(arrive.status, "in_progress");
      assert.ok(arrive.started_at);
      assert.equal(arrive.completed_at, null);
    });
    await t.test("reload returns exactly the saved Arrive data", async () => {
      assert.deepEqual(
        await a.beats.loadBeatProgress(weekId, "arrive"),
        arrive,
      );
    });
    await t.test("Practice, Explore, Notice save independently and list in canonical order", async () => {
      for (const id of ["notice", "explore", "practice"]) {
        await a.beats.upsertBeatProgress(weekId, id, {
          answers: { draft: id },
          resume_state: { screen: id },
        });
      }
      const rows = await a.beats.listWeekBeatProgress(weekId);
      assert.deepEqual(rows.map((row) => row.beat_id), [
        ...a.contract.BEAT_IDS,
      ]);
      for (const row of rows.slice(1)) {
        assert.equal(row.answers.draft, row.beat_id);
        assert.equal(row.resume_state.screen, row.beat_id);
        assert.equal(row.status, "not_started");
        assert.equal(row.started_at, null);
      }
    });
    await t.test("updating one beat preserves all other beats and omitted columns", async () => {
      const before = await a.beats.listWeekBeatProgress(weekId);
      const changed = await a.beats.upsertBeatProgress(weekId, "arrive", {
        answers: { mood: "4" },
      });
      assert.deepEqual(changed.saved_data, arrive.saved_data);
      assert.deepEqual(changed.resume_state, arrive.resume_state);
      assert.equal(changed.started_at, arrive.started_at);
      const after = await a.beats.listWeekBeatProgress(weekId);
      assert.deepEqual(after.slice(1), before.slice(1));
    });
    await t.test("concurrent duplicate upserts produce exactly one row", async () => {
      await Promise.all(
        Array.from(
          { length: 4 },
          () =>
            a.beats.upsertBeatProgress(weekId, "explore", {
              saved_data: { same: true },
            }),
        ),
      );
      const rows = await alice.from("beat_progress").select("beat_id").eq(
        "week_id",
        weekId,
      ).eq("beat_id", "explore");
      assert.equal(rows.error, null);
      assert.deepEqual(rows.data, [{ beat_id: "explore" }]);
    });
    await t.test("resume restores a specific beat's full state without saving or advancing", async () => {
      const before = await a.beats.loadBeatProgress(weekId, "arrive");
      const resume = await a.beats.restoreBeatResumeState(weekId, "arrive");
      assert.deepEqual(JSON.parse(JSON.stringify(resume)), {
        beat_id: "arrive",
        status: before.status,
        answers: before.answers,
        saved_data: before.saved_data,
        resume_state: before.resume_state,
      });
      assert.deepEqual(
        await a.beats.loadBeatProgress(weekId, "arrive"),
        before,
      );
      assert.equal(
        await a.beats.restoreBeatResumeState(otherWeekId, "practice"),
        null,
      );
    });
    await t.test("week IDs isolate the same beat across weekly modules", async () => {
      const before = await a.beats.loadBeatProgress(weekId, "arrive");
      await a.beats.upsertBeatProgress(otherWeekId, "arrive", {
        answers: { week_two_test: "separate synthetic test answer" },
      });
      assert.deepEqual(
        await a.beats.loadBeatProgress(weekId, "arrive"),
        before,
      );
      assert.equal((await a.beats.listWeekBeatProgress(otherWeekId)).length, 1);
    });
    await t.test("user A cannot read B's data through helpers or direct SELECT", async () => {
      await b.beats.upsertBeatProgress(weekId, "arrive", {
        answers: { private: "bob only" },
      });
      assert.equal(
        (await a.beats.loadBeatProgress(weekId, "arrive")).answers.private,
        undefined,
      );
      assert.equal(
        (await b.beats.loadBeatProgress(weekId, "arrive")).answers.private,
        "bob only",
      );
      const rows = await alice.from("beat_progress").select("*").eq(
        "user_id",
        users[1],
      );
      assert.equal(rows.error, null);
      assert.deepEqual(rows.data, []);
    });
    await t.test("explicit user B owner on user A's direct INSERT is rejected by RLS", async () => {
      assert.equal(await b.beats.loadBeatProgress(weekId, "practice"), null);
      const result = await alice.from("beat_progress").insert({
        user_id: users[1],
        week_id: weekId,
        beat_id: "practice",
        answers: { forged: "blocked" },
      });
      assert.equal(result.error?.code, "42501");
      assert.match(result.error.message, /row-level security/i);
      assert.equal(await b.beats.loadBeatProgress(weekId, "practice"), null);
    });
    await t.test("RLS prevents cross-owner upsert, update, and delete", async () => {
      const before = await b.beats.loadBeatProgress(weekId, "arrive");
      const forged = {
        user_id: users[1],
        week_id: weekId,
        beat_id: "practice",
        answers: { attack: "blocked" },
      };
      assert.ok(
        (await alice.from("beat_progress").upsert({
          ...forged,
          beat_id: "arrive",
        }, { onConflict: "user_id,week_id,beat_id" })).error,
      );
      for (const method of ["update", "delete"]) {
        const query = method === "update"
          ? alice.from("beat_progress").update({
            answers: { attack: "blocked" },
          })
          : alice.from("beat_progress").delete();
        const result = await query.eq("user_id", users[1]).select();
        assert.equal(result.error, null);
        assert.deepEqual(result.data, []);
      }
      assert.deepEqual(
        await b.beats.loadBeatProgress(weekId, "arrive"),
        before,
      );
      const ownDelete = await bob.from("beat_progress").delete().eq(
        "week_id",
        weekId,
      ).eq("beat_id", "arrive").select();
      assert.equal(ownDelete.error, null);
      assert.equal(ownDelete.data.length, 1);
    });
    await t.test("signed-out helpers and direct table access fail closed", async () => {
      await assert.rejects(
        anon.beats.loadBeatProgress(weekId, "arrive"),
        /Sign in/,
      );
      await assert.rejects(anon.beats.listWeekBeatProgress(weekId), /Sign in/);
      await assert.rejects(
        anon.beats.restoreBeatResumeState(weekId, "arrive"),
        /Sign in/,
      );
      await assert.rejects(
        anon.beats.upsertBeatProgress(weekId, "arrive", {}),
        /Sign in/,
      );
      assert.ok((await unsigned.from("beat_progress").select("*")).error);
      assert.ok(
        (await unsigned.from("beat_progress").insert({
          week_id: weekId,
          beat_id: "notice",
        })).error,
      );
      assert.ok(
        (await unsigned.from("beat_progress").update({ answers: {} }).eq(
          "week_id",
          weekId,
        )).error,
      );
      assert.ok(
        (await unsigned.from("beat_progress").delete().eq("week_id", weekId))
          .error,
      );
    });
    await t.test("lifecycle timestamps are consistent and completion is repeat-safe", async () => {
      const completed = await a.beats.upsertBeatProgress(weekId, "practice", {
        status: "completed",
      });
      assert.ok(completed.started_at && completed.completed_at);
      assert.ok(
        Date.parse(completed.completed_at) >= Date.parse(completed.started_at),
      );
      assert.equal(
        (await a.beats.upsertBeatProgress(weekId, "practice", {
          status: "completed",
        })).completed_at,
        completed.completed_at,
      );
      const reopened = await a.beats.upsertBeatProgress(weekId, "practice", {
        status: "in_progress",
      });
      assert.equal(reopened.started_at, completed.started_at);
      assert.equal(reopened.completed_at, null);
      const reset = await a.beats.upsertBeatProgress(weekId, "practice", {
        status: "not_started",
      });
      assert.equal(reset.started_at, null);
      assert.equal(reset.completed_at, null);
      const fakeDate = await alice.from("beat_progress").update({
        status: "completed",
        started_at: "2099-01-01",
        completed_at: "2099-01-01",
      }).eq("week_id", weekId).eq("beat_id", "practice").select().single();
      assert.equal(fakeDate.error, null);
      assert.ok(
        Date.parse(fakeDate.data.completed_at) < Date.parse("2099-01-01"),
      );
    });
    await t.test("direct updates cannot change user_id, week_id, or beat_id", async () => {
      const before = await a.beats.loadBeatProgress(weekId, "practice");
      for (
        const identity of [{ user_id: users[1] }, { week_id: otherWeekId }, {
          beat_id: "notice",
        }]
      ) {
        const result = await alice.from("beat_progress").update(identity)
          .eq("user_id", users[0]).eq("week_id", weekId).eq(
            "beat_id",
            "practice",
          ).select();
        assert.equal(result.error?.code, "P0001");
        assert.equal(
          result.error.message,
          "Beat progress identity cannot change",
        );
        assert.deepEqual(
          await a.beats.loadBeatProgress(weekId, "practice"),
          before,
        );
      }
    });
    await t.test("unpublishing retains owner reads/resume but denies inserts and updates", async () => {
      // Privileged SQL is limited to this disposable local curriculum fixture.
      // Never toggle visibility on an existing curriculum week.
      fixtureWeekId = Number(
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
          "-qAt",
          "-c",
          `insert into public.weeks (week_number, title, theme, is_published)
         select n, 'MIN-110 disposable integration fixture', 'Test fixture', true
         from generate_series(1, 8) as n
         where not exists (select 1 from public.weeks where week_number = n)
         order by n desc limit 1 returning id`,
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
      );
      assert.ok(
        Number.isSafeInteger(fixtureWeekId) && fixtureWeekId > 0,
        "This local suite needs one unused week_number for its disposable visibility fixture",
      );
      const saved = await a.beats.upsertBeatProgress(fixtureWeekId, "arrive", {
        status: "in_progress",
        answers: { draft: "retain this private answer" },
        resume_state: { question: 2 },
      });
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
        `update public.weeks set is_published = false where id = ${fixtureWeekId}`,
      ], { stdio: "pipe" });
      const curriculum = await alice.from("weeks").select("id").eq(
        "id",
        fixtureWeekId,
      );
      assert.equal(curriculum.error, null);
      assert.deepEqual(curriculum.data, []);
      assert.deepEqual(
        await a.beats.loadBeatProgress(fixtureWeekId, "arrive"),
        saved,
      );
      assert.deepEqual(await a.beats.listWeekBeatProgress(fixtureWeekId), [
        saved,
      ]);
      assert.equal(
        (await a.beats.restoreBeatResumeState(fixtureWeekId, "arrive"))
          .resume_state.question,
        2,
      );
      const insert = await alice.from("beat_progress").insert({
        week_id: fixtureWeekId,
        beat_id: "practice",
      });
      assert.equal(insert.error?.code, "42501");
      assert.match(insert.error.message, /row-level security/i);
      const update = await alice.from("beat_progress").update({
        answers: { attack: "blocked" },
      })
        .eq("week_id", fixtureWeekId).eq("beat_id", "arrive").select();
      assert.equal(update.error?.code, "42501");
      assert.match(update.error.message, /row-level security/i);
      await assert.rejects(
        a.beats.upsertBeatProgress(fixtureWeekId, "arrive", { answers: {} }),
        { message: "Could not save beat progress. Please retry." },
      );
      assert.equal(
        await a.beats.loadBeatProgress(fixtureWeekId, "practice"),
        null,
      );
      assert.deepEqual(
        await a.beats.loadBeatProgress(fixtureWeekId, "arrive"),
        saved,
      );
      const deleted = await alice.from("beat_progress").delete().eq(
        "week_id",
        fixtureWeekId,
      ).eq("beat_id", "arrive").select();
      assert.equal(deleted.error, null);
      assert.equal(deleted.data.length, 1);
    });
    await t.test("SQL independently rejects invalid beats, statuses, JSON objects, and non-string answers", async () => {
      for (
        const patch of [
          { beat_id: "reflection" },
          { status: "invalid" },
          { answers: [] },
          { answers: { number: 3 } },
          { saved_data: [] },
          { resume_state: "screen" },
          { answers: null },
          { saved_data: null },
          { resume_state: null },
          { week_id: -1 },
        ]
      ) {
        const result = await bob.from("beat_progress").insert({
          week_id: weekId,
          beat_id: "practice",
          ...patch,
        });
        assert.ok(result.error, "Invalid direct writes must be rejected");
      }
    });
    await t.test("helpers reject ownership, identity, timestamps, and invalid JSON before writing", async () => {
      const before = await a.beats.loadBeatProgress(weekId, "arrive");
      for (
        const patch of [
          { user_id: users[1] },
          { week_id: otherWeekId },
          { beat_id: "notice" },
          { started_at: "2099-01-01" },
          { completed_at: null },
          { updated_at: "2099-01-01" },
          { status: "invalid" },
          { answers: { mood: 3 } },
          { saved_data: [] },
          { resume_state: null },
        ]
      ) {
        await assert.rejects(
          a.beats.upsertBeatProgress(weekId, "arrive", patch),
        );
      }
      assert.deepEqual(
        await a.beats.loadBeatProgress(weekId, "arrive"),
        before,
      );
    });
    await t.test("legacy rows and completion requirements remain unchanged after all beat writes", async () => {
      assert.deepEqual(
        await a.legacy.loadWeekOneProgress(activityId),
        oldAlice,
      );
      assert.deepEqual(
        await a.weekOne.getWeekOneProgress(users[0], activityId),
        oldAlice,
      );
      assert.deepEqual(await b.legacy.loadWeekOneProgress(activityId), oldBob);
      assert.deepEqual(
        await b.weekOne.startWeekOne(users[1], activityId),
        oldBob,
      );
      const done = await b.weekOne.completeWeekOne(users[1], activityId);
      assert.equal(done.completed, true);
      assert.equal(done.alreadyCompleted, true);
      assert.equal(done.completedAt, oldBob.completed_at);
      assert.deepEqual(done.progress, oldBob);
      assert.equal(
        a.weekOne.getWeekOneCompletionIssue(oldAlice).missingStep,
        "breathing",
      );
      assert.deepEqual(
        await a.legacy.loadWeekOneProgress(activityId),
        oldAlice,
      );
    });
    await t.test("unchanged legacy restore rules still preserve old saved answers and writing", async () => {
      const expected = a.weekOne.deriveNextAllowedStep(oldAlice);
      const restored = await a.weekOne.startWeekOne(users[0], activityId);
      assert.equal(restored.current_step, expected);
      assert.deepEqual(
        restored.reflection_answers,
        oldAlice.reflection_answers,
      );
      assert.deepEqual(
        restored.generated_intentions,
        oldAlice.generated_intentions,
      );
      assert.equal(restored.writing, oldAlice.writing);
      assert.equal(restored.completed_at, oldAlice.completed_at);
    });
  } finally {
    if (Number.isSafeInteger(fixtureWeekId) && fixtureWeekId > 0) {
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
        `delete from public.weeks where id = ${fixtureWeekId}`,
      ], { stdio: "pipe" });
    }
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
