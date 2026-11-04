// Real local Auth/REST/RLS tests; synthetic definitions only. No service-role client.
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const load = require("../helpers/load-baseline.cjs");
const { cli, quote, sql, migrate } = require("../helpers/local-supabase.cjs");
const version = "20261029000000";
const plain = (value) => JSON.parse(JSON.stringify(value));

test("MIN-220 baseline through local Auth, public REST, RPC and RLS", async (t) => {
  const config = JSON.parse(cli(["status", "-o", "json"])); // Never print config (contains local credentials).
  assert.equal(new URL(config.API_URL).hostname, "127.0.0.1");
  const client = () =>
    createClient(config.API_URL, config.PUBLISHABLE_KEY || config.ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const a = client(), b = client(), unsigned = client();
  const users = [];
  const definitionId = "min220-test-" + randomUUID();
  const questions = Array.from(
    { length: 5 },
    (_, i) => ({
      questionId: "synthetic-" + i,
      prompt: "Synthetic question " + i,
      maxCharacters: 80,
    }),
  );
  const answers = Object.fromEntries(
    questions.map((q, i) => [q.questionId, "Synthetic answer " + i]),
  );
  const request = (revision, values = answers, operationId = randomUUID()) => ({
    operationId,
    expectedRevision: revision,
    definitionId,
    definitionVersion: 1,
    answers: values,
  });
  const raw = (value) => ({
    p_request: { ...value, contractVersion: "sprint3-storage/v1" },
  });
  let services;
  try {
    for (const c of [a, b]) {
      const { data, error } = await c.auth.signUp({
        email: "min220-" + randomUUID() + "@example.test",
        password: randomUUID() + "aA!9",
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    const { data: activities, error } = await a.from("activities").select(
      "id,weeks!inner(week_number)",
    );
    assert.equal(error, null);
    const one = activities.find((row) => row.weeks.week_number === 1),
      two = activities.find((row) => row.weeks.week_number === 2);
    assert.ok(one && two, "Published Week 1/2 fixtures must exist");
    const legacy = [
      {
        user_id: users[0],
        activity_id: one.id,
        status: "in_progress",
        current_step: "writing",
        writing: "Synthetic legacy draft",
        generated_intentions: [],
        reflection_answers: { old_unknown_key: "synthetic retained" },
        started_at: "2026-10-01T12:00:00Z",
        completed_at: null,
      },
      {
        user_id: users[1],
        activity_id: two.id,
        status: "completed",
        current_step: "completed",
        writing: "Synthetic old writing",
        generated_intentions: [{ title: "Synthetic", explanation: "Legacy" }],
        reflection_answers: {
          arrive_body_region: "head",
          old_unknown_key: "synthetic completed",
        },
        started_at: "2026-10-01T12:00:00Z",
        completed_at: "2026-10-01T12:15:00Z",
      },
    ];
    for (let i = 0; i < 2; i++) {
      assert.equal(
        (await [a, b][i].from("progress").insert(legacy[i])).error,
        null,
      );
    }
    const before = await Promise.all(
      [a, b].map((c) => c.from("progress").select("*").single()),
    );
    if (
      sql(
        "select count(*) from supabase_migrations.schema_migrations where version='" +
          version + "';",
      ) === "0"
    ) {
      migrate();
    }
    assert.equal(
      sql(
        "select count(*) from supabase_migrations.schema_migrations where version='" +
          version + "';",
      ),
      "1",
    );
    await t.test("additive migration leaves every legacy Week 1/2 field unchanged", async () => {
      const after = await Promise.all(
        [a, b].map((c) => c.from("progress").select("*").single()),
      );
      assert.deepEqual(after.map((r) => r.data), before.map((r) => r.data));
    });
    sql(
      "insert into public.baseline_definitions(definition_id,definition_version,questions,is_published) values (" +
        quote(definitionId) + ",1," + quote(JSON.stringify(questions)) +
        "::jsonb,true);",
    );
    services = [load(a), load(b), load(unsigned)];
    const [aa, bb, anon] = services;
    await t.test("restricted writer has no bypass, login, legacy-table or client membership privilege", () => {
      assert.equal(
        sql(
          "select rolcanlogin or rolbypassrls from pg_roles where rolname='baseline_writer';",
        ),
        "f",
      );
      assert.equal(
        sql(
          "select has_table_privilege('baseline_writer','public.progress','select');",
        ),
        "f",
      );
      assert.equal(
        sql("select pg_has_role('authenticated','baseline_writer','member');"),
        "f",
      );
    });
    await t.test("definitions validate five ordered unique string questions and numeric bounds", () => {
      for (
        const bad of [
          questions.slice(0, 4),
          [...questions.slice(0, 4), questions[0]],
          questions.map((q) => ({ ...q, maxCharacters: -1 })),
          questions.map((q) => ({ ...q, maxCharacters: 1.5 })),
        ]
      ) {
        assert.throws(() =>
          sql(
            "insert into public.baseline_definitions(definition_id,definition_version,questions) values(" +
              quote(definitionId) + ",9," + quote(JSON.stringify(bad)) +
              "::jsonb);",
          )
        );
      }
    });
    await t.test("raw RPC errors are controlled and do not echo synthetic private input", async () => {
      const invalid = raw(request(0));
      invalid.p_request.answers = { unknown: "MIN220_PRIVATE_SENTINEL" };
      const result = await a.rpc("save_baseline_draft", invalid);
      assert.equal(result.error.message, "INVALID_INPUT");
      assert.ok(
        !/MIN220_PRIVATE_SENTINEL|CONTEXT|stack|password|baseline_private/.test(
          JSON.stringify(result.error),
        ),
      );
      const missing = await a.rpc(
        "save_baseline_draft",
        raw({ ...request(0), definitionVersion: 99 }),
      );
      assert.equal(missing.error.message, "DEFINITION_NOT_AVAILABLE");
    });
    await t.test("missing auth is rejected by helpers, RPCs and table grants", async () => {
      for (
        const call of [
          () => anon.loadBaseline(),
          () => anon.loadOriginalBaseline(),
          () => anon.saveBaselineDraft(request(0)),
          () => anon.submitBaseline(request(0)),
        ]
      ) await assert.rejects(call, (e) => e.code === "AUTH_REQUIRED");
      for (const name of ["load_baseline", "load_original_baseline"]) {
        assert.ok((await unsigned.rpc(name)).error);
      }
      assert.ok((await unsigned.rpc("submit_baseline", raw(request(0)))).error);
      assert.ok((await unsigned.from("baseline_records").select("*")).error);
    });
    let save;
    await t.test("owner creates, reloads and updates a definition-driven draft", async () => {
      assert.equal(await aa.loadBaseline(), null);
      const draft = {
        [questions[0].questionId]: answers[questions[0].questionId],
      };
      save = request(0, draft);
      assert.equal((await aa.saveBaselineDraft(save)).revision, 1);
      assert.deepEqual(plain((await aa.loadBaseline()).answers), draft);
      assert.equal((await aa.saveBaselineDraft(request(1))).revision, 2);
      assert.deepEqual(plain((await aa.loadBaseline()).answers), answers);
      assert.equal((await aa.loadOriginalBaseline()).original, null);
    });
    await t.test("draft retry acknowledges original revision without overwriting newer draft", async () => {
      const replay = await aa.saveBaselineDraft(save);
      assert.equal(replay.replayed, true);
      assert.equal(replay.revision, 1);
      assert.equal((await aa.loadBaseline()).revision, 2);
    });
    await t.test("stale revision and invalid answers preserve the current draft", async () => {
      await assert.rejects(
        () => aa.saveBaselineDraft(request(1)),
        (e) => e.code === "STALE_REVISION",
      );
      await assert.rejects(
        () => aa.saveBaselineDraft(request(2, { unknown: "synthetic" })),
        (e) => e.code === "INVALID_INPUT",
      );
      await assert.rejects(
        () =>
          aa.submitBaseline(
            request(2, { ...answers, [questions[0].questionId]: " \n\t" }),
          ),
        (e) => e.code === "INVALID_INPUT",
      );
      await assert.rejects(
        () =>
          aa.saveBaselineDraft(
            request(2, {
              ...answers,
              [questions[0].questionId]: "x".repeat(81),
            }),
          ),
        (e) => e.code === "INVALID_INPUT",
      );
      assert.equal((await aa.loadBaseline()).revision, 2);
    });
    await t.test("cross-owner draft reads, inserts, updates and forged RPC ownership fail", async () => {
      assert.equal(await bb.loadBaseline(), null);
      assert.deepEqual(
        (await b.from("baseline_records").select("*").eq("user_id", users[0]))
          .data,
        [],
      );
      assert.ok(
        (await b.from("baseline_records").insert({
          user_id: users[0],
          definition_id: definitionId,
          definition_version: 1,
          status: "draft",
          revision: 1,
        })).error,
      );
      assert.ok(
        (await b.from("baseline_records").update({ answers: {} }).eq(
          "user_id",
          users[0],
        )).error,
      );
      const forged = raw(request(0));
      forged.p_request.user_id = users[0];
      assert.equal(
        (await b.rpc("submit_baseline", forged)).error.message,
        "INVALID_INPUT",
      );
      assert.equal((await aa.loadBaseline()).revision, 2);
    });
    await t.test("RLS independently isolates the restricted writer role", () => {
      const claims = quote(
        JSON.stringify({ sub: users[1], role: "authenticated" }),
      );
      assert.equal(
        sql(
          "begin; set local role baseline_writer; select set_config('request.jwt.claims'," +
            claims +
            ",true) is not null; select count(*) from public.baseline_records where user_id=" +
            quote(users[0]) + "; rollback;",
        ).split("\n").at(-1),
        "0",
      );
      assert.equal(
        sql("select pg_has_role('authenticated','baseline_writer','member');"),
        "f",
      );
      assert.throws(() =>
        sql(
          "begin; set local role baseline_writer; select set_config('request.jwt.claims'," +
            claims +
            ",true); insert into public.baseline_records(user_id,definition_id,definition_version,status,revision) values(" +
            quote(users[0]) + "," + quote(definitionId) +
            ",1,'draft',1); rollback;",
        )
      );
    });
    await t.test("simultaneous draft updates from one revision cannot both win", async () => {
      const outcomes = await Promise.allSettled([
        aa.saveBaselineDraft(request(2)),
        aa.saveBaselineDraft(request(2)),
      ]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        outcomes.find((r) => r.status === "rejected").reason.code,
        "STALE_REVISION",
      );
      assert.equal((await aa.loadBaseline()).revision, 3);
    });
    let submit, submitted;
    await t.test("first submission freezes exact original and ordered definition", async () => {
      submit = request(3);
      submitted = await aa.submitBaseline(submit);
      assert.equal(submitted.revision, 4);
      assert.ok(submitted.submittedAt);
      const original = await aa.loadOriginalBaseline();
      assert.deepEqual(plain(original.original.answers), answers);
      assert.deepEqual(plain(original.definition.questions), questions);
      assert.equal(original.original.status, "submitted");
    });
    await t.test("identical submit retry, parallel retry and lost-response retry replay once", async () => {
      const results = await Promise.all([
        aa.submitBaseline(submit),
        aa.submitBaseline(submit),
      ]);
      assert.ok(
        results.every((r) =>
          r.replayed && r.revision === 4 &&
          r.submittedAt === submitted.submittedAt
        ),
      );
      await aa.submitBaseline(submit); // Discard transport acknowledgement, then retry same ID.
      assert.equal(
        (await aa.submitBaseline(submit)).submittedAt,
        submitted.submittedAt,
      );
      assert.equal(
        (await a.from("baseline_write_receipts").select("operation_id").eq(
          "operation_id",
          submit.operationId,
        )).data.length,
        1,
      );
    });
    await t.test("altered retry and second original cannot replace committed answers", async () => {
      await assert.rejects(
        () =>
          aa.submitBaseline({
            ...submit,
            answers: { ...answers, [questions[0].questionId]: "altered" },
          }),
        (e) => e.code === "OPERATION_CONFLICT",
      );
      await assert.rejects(
        () => aa.submitBaseline(request(4)),
        (e) => e.code === "BASELINE_IMMUTABLE",
      );
      await assert.rejects(
        () => aa.saveBaselineDraft(request(4)),
        (e) => e.code === "BASELINE_IMMUTABLE",
      );
      assert.deepEqual(
        plain((await aa.loadOriginalBaseline()).original.answers),
        answers,
      );
    });
    await t.test("ordinary clients cannot edit/delete originals, definitions or receipts", async () => {
      for (
        const table of [
          "baseline_records",
          "baseline_write_receipts",
          "baseline_definitions",
        ]
      ) {
        assert.ok(
          (await a.from(table).update({ created_at: "2020-01-01" })).error,
        );
        assert.ok((await a.from(table).delete()).error);
      }
      assert.ok(
        (await a.from("baseline_definitions").insert({
          definition_id: "forged",
          definition_version: 1,
          questions,
          is_published: true,
        })).error,
      );
    });
    await t.test("database trigger rejects writer-role changes to submitted original", () => {
      const claims = quote(
        JSON.stringify({ sub: users[0], role: "authenticated" }),
      );
      assert.throws(() =>
        sql(
          "begin; set local role baseline_writer; select set_config('request.jwt.claims'," +
            claims +
            ",true); update public.baseline_records set answers='{}'::jsonb,revision=revision+1 where user_id=" +
            quote(users[0]) + "; rollback;",
        )
      );
    });
    await t.test("cross-account original and receipt reads remain isolated", async () => {
      assert.equal((await bb.loadOriginalBaseline()).original, null);
      assert.deepEqual(
        (await b.from("baseline_records").select("*").eq("user_id", users[0]))
          .data,
        [],
      );
      assert.deepEqual(
        (await b.from("baseline_write_receipts").select("*").eq(
          "user_id",
          users[0],
        )).data,
        [],
      );
    });
    await t.test("unpublishing retains owner original and identical replay but blocks new writes", async () => {
      sql(
        "update public.baseline_definitions set is_published=false where definition_id=" +
          quote(definitionId) + ";",
      );
      assert.deepEqual(
        plain((await aa.loadOriginalBaseline()).original.answers),
        answers,
      );
      assert.equal((await aa.submitBaseline(submit)).replayed, true);
      await assert.rejects(
        () => bb.saveBaselineDraft(request(0)),
        (e) => e.code === "DEFINITION_NOT_AVAILABLE",
      );
      sql(
        "update public.baseline_definitions set is_published=true where definition_id=" +
          quote(definitionId) + ";",
      );
    });
    await t.test("transaction interrupted after write/receipt rolls back and same ID safely retries", async () => {
      const pending = request(0);
      const claims = quote(
        JSON.stringify({ sub: users[1], role: "authenticated" }),
      );
      sql(
        "begin; set local role authenticated; select set_config('request.jwt.claims'," +
          claims + ",true); select public.save_baseline_draft(" +
          quote(JSON.stringify(raw(pending).p_request)) + "::jsonb); rollback;",
      );
      assert.equal(await bb.loadBaseline(), null);
      assert.equal((await bb.saveBaselineDraft(pending)).revision, 1);
      assert.equal((await bb.saveBaselineDraft(pending)).replayed, true);
    });
    await t.test("unpublished pinned definition preserves a draft but blocks fresh edits", async () => {
      const before = plain(await bb.loadBaseline());
      sql(
        "update public.baseline_definitions set is_published=false where definition_id=" +
          quote(definitionId) + ";",
      );
      await assert.rejects(
        () => bb.saveBaselineDraft(request(1)),
        (e) => e.code === "DEFINITION_NOT_AVAILABLE",
      );
      assert.deepEqual(plain(await bb.loadBaseline()), before);
      assert.equal((await bb.loadOriginalBaseline()).original, null);
      sql(
        "update public.baseline_definitions set is_published=true where definition_id=" +
          quote(definitionId) + ";",
      );
    });
    await t.test("simultaneous different submissions produce one immutable original", async () => {
      const x = request(1),
        y = request(1, {
          ...answers,
          [questions[0].questionId]: "Synthetic competitor",
        });
      const result = await Promise.allSettled([
        bb.submitBaseline(x),
        bb.submitBaseline(y),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        result.find((r) => r.status === "rejected").reason.code,
        "BASELINE_IMMUTABLE",
      );
      const first = plain((await bb.loadOriginalBaseline()).original);
      await assert.rejects(
        () => bb.submitBaseline(request(2)),
        (e) => e.code === "BASELINE_IMMUTABLE",
      );
      assert.deepEqual(
        plain((await bb.loadOriginalBaseline()).original),
        first,
      );
    });
    await t.test("definition content cannot be edited and version changes cannot create a second original", async () => {
      assert.throws(() =>
        sql(
          "update public.baseline_definitions set questions='[]'::jsonb where definition_id=" +
            quote(definitionId) + ";",
        )
      );
      sql(
        "insert into public.baseline_definitions(definition_id,definition_version,questions,is_published) values(" +
          quote(definitionId) + ",2," + quote(JSON.stringify(questions)) +
          "::jsonb,true);",
      );
      await assert.rejects(
        () => aa.submitBaseline({ ...request(4), definitionVersion: 2 }),
        (e) => e.code === "BASELINE_IMMUTABLE",
      );
      assert.equal(
        (await aa.loadOriginalBaseline()).original.definitionVersion,
        1,
      );
    });
    await t.test("both directions remain isolated and legacy records stay unchanged after all writes", async () => {
      assert.deepEqual(
        (await a.from("baseline_records").select("*").eq("user_id", users[1]))
          .data,
        [],
      );
      assert.deepEqual(
        (await b.from("baseline_records").select("*").eq("user_id", users[0]))
          .data,
        [],
      );
      const after = await Promise.all(
        [a, b].map((c) => c.from("progress").select("*").single()),
      );
      assert.deepEqual(after.map((r) => r.data), before.map((r) => r.data));
    });
  } finally {
    if (users.length) {
      sql(
        "delete from auth.users where id in (" + users.map(quote).join(",") +
          ");",
      );
    }
    if (
      sql("select to_regclass('public.baseline_definitions') is not null;") ===
        "t"
    ) {
      sql(
        "delete from public.baseline_definitions where definition_id=" +
          quote(definitionId) + ";",
      );
    }
  }
});
