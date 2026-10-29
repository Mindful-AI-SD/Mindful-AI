const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const load = require("../helpers/load-week-three.cjs");
const { cli, quote, sql, migrate } = require("../helpers/local-supabase.cjs");
const {
  distractionAuditInputSchema,
  distractionAuditResultSchema,
  distractionAuditMatchesRequest,
} = require("../helpers/load-distraction-audit.cjs");
const plain = (x) => JSON.parse(JSON.stringify(x));
test("MIN-226 owner draft persistence and backend prerequisites", async (t) => {
  const config = JSON.parse(cli(["status", "-o", "json"]));
  assert.equal(new URL(config.API_URL).hostname, "127.0.0.1");
  const client = () =>
    createClient(config.API_URL, config.PUBLISHABLE_KEY || config.ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const a = client(), b = client(), unsigned = client(), users = [];
  const target = randomUUID(),
    alternate = randomUUID(),
    prior1 = randomUUID(),
    prior2 = randomUUID();
  const slug = "synthetic-w3-" + randomUUID(),
    other = slug + "-other",
    wrong = slug + "-wrong";
  let weekId, oldSnapshot, required = [];
  const services = [load(a), load(b)];
  const events = distractionAuditInputSchema.parse({
    events: [{
      id: " event-a ",
      at: "2026-10-29T14:00:00Z",
      label: " Example ",
    }],
  }).events;
  const write = (
    revision,
    patch,
    operationId = randomUUID(),
    requestedSlug = slug,
  ) => ({
    slug: requestedSlug,
    expectedRevision: revision,
    operationId,
    contentVersion: "synthetic/v1",
    patch,
  });
  const raw = (c, input) =>
    c.rpc("save_week_three_draft", {
      p_request: { ...input, contractVersion: "sprint3-storage/v1" },
    });
  const failure = async (input, code, status = 400, c = a) => {
    const r = await raw(c, input);
    assert.equal(r.status, status);
    assert.equal(r.error?.message, code);
    assert.doesNotMatch(
      JSON.stringify(r.error),
      /stack|password|secret|postgres|INSERT INTO|SELECT /i,
    );
  };
  const report = {
    contractVersion: "distraction-audit-cache/v1",
    inputEventsRevision: 1,
    inputEvents: events,
    provider: "mock",
    data: {
      totalEvents: 1,
      categories: [{ category: "thoughts", count: 1, percent: 100 }],
      uncategorized: { count: 0, percent: 0 },
      assignments: [{ eventId: "event-a", category: "thoughts" }],
    },
  };
  try {
    migrate();
    for (const c of [a, b]) {
      const { data, error } = await c.auth.signUp({
        email: "min226-" + randomUUID() + "@example.test",
        password: randomUUID() + "Aa9!",
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    const weeks = JSON.parse(
      sql(
        "select json_object_agg(week_number,id) from public.weeks where week_number in (1,2);",
      ),
    );
    assert.ok(weeks[1] && weeks[2]);
    assert.equal(
      sql("select count(*) from public.weeks where week_number=3;"),
      "0",
      "Test needs unused Week 3; do not overwrite curriculum",
    );
    weekId = Number(
      sql(
        "insert into public.weeks(week_number,title,theme,is_published) values(3,'Synthetic Week 3','Synthetic',true) returning id;",
      ),
    );
    for (
      const [id, w, seq, kind] of [
        [prior1, weeks[1], 31000, "reflection"],
        [prior2, weeks[2], 31000, "reflection"],
        [target, weekId, 1, "ai_lab"],
        [alternate, weekId, 2, "ai_lab"],
      ]
    ) {
      sql(
        `insert into public.activities(id,week_id,activity_type,title,sequence_number,is_published) values(${
          quote(id)
        },${w},${quote(kind)},'Synthetic prerequisite',${seq},true);`,
      );
    }
    sql(
      `insert into public.activity_aliases values(${quote(slug)},${
        quote(target)
      }),(${quote(other)},${quote(alternate)}),(${quote(wrong)},${
        quote(prior1)
      });`,
    );
    required = [prior1, prior2];
    await t.test("unconfigured target is fail closed, not any-completed-week fallback", async () => {
      await failure(
        write(0, { events }),
        "PREREQUISITE_CONFIGURATION_UNAVAILABLE",
        503,
      );
    });
    sql(
      `insert into public.week_three_modules(activity_id,content_version,required_activity_ids,allowed_answer_keys,is_enabled)
      values(${quote(target)},'synthetic/v1',array[${quote(prior1)}::uuid,${
        quote(prior2)
      }::uuid],array['synthetic-answer'],true);`,
    );
    await t.test("missing prior completion blocks helper and direct RPC", async () => {
      await assert.rejects(
        services[0].saveWeekThreeDraft(write(0, { events })),
        { code: "PREREQUISITE_NOT_MET" },
      );
      await failure(write(0, { events }), "PREREQUISITE_NOT_MET", 403);
      assert.ok(
        (await a.from("week_three_progress").insert({
          user_id: users[0],
          activity_id: target,
        })).error,
      );
    });
    // Existing current main progress signal, not a new curricular completion predicate.
    for (const id of required) {
      assert.equal(
        (await a.from("progress").insert({
          user_id: users[0],
          activity_id: id,
          status: "completed",
          current_step: "completed",
          completed_at: "2026-10-28T12:00:00Z",
          reflection_answers: { legacy: "Synthetic retained" },
        })).error,
        null,
      );
    }
    oldSnapshot = plain(
      (await a.from("progress").select("*").in("activity_id", required).order(
        "activity_id",
      )).data,
    );
    await t.test("eligible owner creates and reloads normalized current event log", async () => {
      assert.equal(
        (await services[0].saveWeekThreeDraft(write(0, { events }))).revision,
        1,
      );
      const row = await services[0].loadWeekThreeProgress(slug);
      assert.deepEqual(plain(row.events), plain(events));
      assert.equal(row.status, "in_progress");
      assert.equal(row.eventsRevision, 1);
      assert.ok(!Object.hasOwn(row, "user_id"));
    });
    await t.test("partial resume save preserves events and restores paused state", async () => {
      const resume = {
        elapsedActiveMs: 1200,
        positionMs: 500,
        state: "paused",
      };
      await services[0].saveWeekThreeDraft(
        write(1, { resumeState: resume, currentBeat: "practice" }),
      );
      assert.deepEqual(
        plain(await services[0].restoreWeekThreeResume(slug)),
        resume,
      );
      const row = await services[0].loadWeekThreeProgress(slug);
      assert.deepEqual(plain(row.events), plain(events));
      assert.equal(row.eventsRevision, 1);
    });
    await t.test("actual shared result schema and arithmetic validate cached report", async () => {
      assert.ok(distractionAuditResultSchema.safeParse(report.data).success);
      assert.equal(distractionAuditMatchesRequest(events, report.data), true);
      await services[0].saveWeekThreeDraft(
        write(2, {
          auditResult: report,
          answers: { "synthetic-answer": "Synthetic answer" },
        }),
      );
      assert.deepEqual(
        plain((await services[0].loadWeekThreeProgress(slug)).auditResult),
        plain(report),
      );
    });
    await t.test("event update preserves older report snapshot and unrelated answers/resume", async () => {
      await services[0].saveWeekThreeDraft(
        write(3, {
          events: [...events, {
            id: "event-b",
            at: "2026-10-29T14:05:00+00:00",
            label: "Another",
          }],
        }),
      );
      const row = await services[0].loadWeekThreeProgress(slug);
      assert.equal(row.eventsRevision, 2);
      assert.equal(row.auditResult.inputEventsRevision, 1);
      assert.deepEqual(plain(row.auditResult), plain(report));
      assert.equal(row.resumeState.elapsedActiveMs, 1200);
      assert.equal(row.answers["synthetic-answer"], "Synthetic answer");
    });
    await t.test("same operation replay, altered retry and stale saves preserve state", async () => {
      const input = write(4, { currentBeat: "explore" });
      assert.equal(
        (await services[0].saveWeekThreeDraft(input)).replayed,
        false,
      );
      assert.equal(
        (await services[0].saveWeekThreeDraft(input)).replayed,
        true,
      );
      await failure(
        { ...input, patch: { currentBeat: "notice" } },
        "OPERATION_CONFLICT",
        409,
      );
      await failure(write(4, { events: [] }), "STALE_REVISION", 409);
      assert.equal((await services[0].loadWeekThreeProgress(slug)).revision, 5);
    });
    await t.test("two simultaneous stale snapshots have one winner", async () => {
      const results = await Promise.all([
        raw(a, write(5, { currentBeat: "arrive" })),
        raw(a, write(5, { currentBeat: "notice" })),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    });
    await t.test("raw invalid events rejected consistently with checked-in schema", async () => {
      const cases = [
        [...events, ...events],
        [{ ...events[0], at: "yesterday" }],
        [{ ...events[0], at: "2026-02-30T14:00:00Z" }],
        [{ ...events[0], at: "2026-10-29T24:00:00Z" }],
        [{ ...events[0], label: "" }],
        [{ ...events[0], label: "x".repeat(41) }],
        [{ ...events[0], extra: "private" }],
      ];
      for (const ev of cases) {
        assert.equal(
          distractionAuditInputSchema.safeParse({ events: ev }).success,
          false,
        );
        await failure(write(6, { events: ev }), "INVALID_INPUT");
      }
    });
    await t.test("invalid report, resume, policy answer keys and terminal fields fail without data loss", async () => {
      for (
        const patch of [
          {
            resumeState: {
              elapsedActiveMs: -1,
              positionMs: null,
              state: "idle",
            },
          },
          {
            resumeState: {
              elapsedActiveMs: 0,
              positionMs: null,
              state: "running",
            },
          },
          { answers: { unapproved: "Private" } },
          { auditResult: { ...report, inputEventsRevision: 2 } },
          {
            auditResult: {
              ...report,
              data: { ...report.data, totalEvents: 99 },
            },
          },
          { auditResult: null },
          { status: "completed" },
          { user_id: users[1] },
        ]
      ) await failure(write(6, patch), "INVALID_INPUT");
      assert.equal((await services[0].loadWeekThreeProgress(slug)).revision, 6);
    });
    await t.test("user B cannot read A, borrow A prerequisites, or forge owner via any public path", async () => {
      assert.equal(await services[1].loadWeekThreeProgress(slug), null);
      assert.deepEqual(
        (await b.from("week_three_progress").select("*").eq(
          "user_id",
          users[0],
        )).data,
        [],
      );
      await failure(write(0, { events }), "PREREQUISITE_NOT_MET", 403, b);
      await failure(
        { ...write(6, { events }), user_id: users[0] },
        "INVALID_INPUT",
        400,
        b,
      );
      assert.ok(
        (await b.from("week_three_progress").insert({
          user_id: users[0],
          activity_id: target,
        })).error,
      );
      assert.ok(
        (await b.from("week_three_progress").update({ events: [] }).eq(
          "user_id",
          users[0],
        )).error,
      );
      assert.ok(
        (await b.from("week_three_progress").delete().eq("user_id", users[0]))
          .error,
      );
    });
    await t.test("arbitrary UUID, substituted slug and wrong week do not bypass", async () => {
      await failure(
        { ...write(6, { events }), activityId: target },
        "INVALID_INPUT",
      );
      await failure(
        write(0, { events }, randomUUID(), wrong),
        "ACTIVITY_NOT_AVAILABLE",
        404,
      );
      await failure(
        write(0, { events }, randomUUID(), other),
        "PREREQUISITE_CONFIGURATION_UNAVAILABLE",
        503,
      );
      await failure(
        { ...write(6, { events }), expectedWeek: 1 },
        "INVALID_INPUT",
      );
    });
    await t.test("owner reload survives withdrawal but fresh save is denied", async () => {
      sql(
        `update public.activities set is_published=false where id=${
          quote(target)
        };`,
      );
      assert.equal((await services[0].loadWeekThreeProgress(slug)).revision, 6);
      await failure(
        write(6, { currentBeat: "arrive" }),
        "ACTIVITY_NOT_AVAILABLE",
        404,
      );
      sql(
        `update public.activities set is_published=true where id=${
          quote(target)
        };`,
      );
    });
    await t.test("signed out helper and direct RPC/REST deny private access", async () => {
      await assert.rejects(load(unsigned).loadWeekThreeProgress(slug), {
        code: "AUTH_REQUIRED",
      });
      assert.equal((await raw(unsigned, write(0, { events }))).status, 401);
      assert.equal(
        (await unsigned.rpc("load_week_three_progress", {
          p_request: { slug },
        })).status,
        401,
      );
      assert.ok((await unsigned.from("week_three_progress").select("*")).error);
    });
    await t.test("completion explicitly unavailable, draft unchanged", async () => {
      const r = await a.rpc("complete_week_three", { p_request: { slug } });
      assert.equal(r.status, 503);
      assert.equal(r.error.message, "COMPLETION_POLICY_UNAVAILABLE");
      assert.equal(
        (await services[0].loadWeekThreeProgress(slug)).status,
        "in_progress",
      );
    });
    await t.test("restricted writer remains owner scoped and cannot administer configuration", () => {
      assert.equal(
        sql(
          "select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='week_three_writer';",
        ),
        "f",
      );
      assert.equal(
        sql(
          "select pg_has_role('authenticated','week_three_writer','member');",
        ),
        "f",
      );
      assert.throws(() =>
        sql(
          `begin;set local role week_three_writer;select set_config('request.jwt.claims',${
            quote(JSON.stringify({ sub: users[0], role: "authenticated" }))
          },true);insert into public.week_three_progress(user_id,activity_id,content_version,revision) values(${
            quote(users[1])
          },${quote(target)},'synthetic/v1',1);rollback;`,
        )
      );
      assert.throws(() =>
        sql(
          "begin;set local role week_three_writer;delete from public.week_three_modules;rollback;",
        )
      );
    });
    await t.test("legacy Week 1/2 snapshots unchanged", async () => {
      assert.deepEqual(
        plain(
          (await a.from("progress").select("*").in("activity_id", required)
            .order("activity_id")).data,
        ),
        oldSnapshot,
      );
    });
    await t.test("rollback leaves neither draft change nor receipt; same operation retries safely", async () => {
      const input = write(6, { currentBeat: "notice" });
      const envelope = { ...input, contractVersion: "sprint3-storage/v1" };
      sql(
        `begin;set local role authenticated;select set_config('request.jwt.claims',${
          quote(JSON.stringify({ sub: users[0], role: "authenticated" }))
        },true);
        select public.save_week_three_draft(${
          quote(JSON.stringify(envelope))
        }::jsonb);rollback;`,
      );
      assert.equal((await services[0].loadWeekThreeProgress(slug)).revision, 6);
      const r = await services[0].saveWeekThreeDraft(input);
      assert.equal(r.revision, 7);
      assert.equal(r.replayed, false);
      assert.equal(
        (await services[0].saveWeekThreeDraft(input)).replayed,
        true,
      );
    });
    await t.test("cached largest-remainder arithmetic agrees with existing shared schema", async () => {
      const ev = [0, 1, 2].map((i) => ({
        id: "multi-" + i,
        at: "2026-10-29T15:00:00Z",
        label: "Synthetic",
      }));
      const data = {
        totalEvents: 3,
        categories: [{ category: "social_media", count: 1, percent: 34 }, {
          category: "thoughts",
          count: 1,
          percent: 33,
        }],
        uncategorized: { count: 1, percent: 33 },
        assignments: [{ eventId: "multi-0", category: "thoughts" }, {
          eventId: "multi-1",
          category: "social_media",
        }, { eventId: "multi-2", category: null }],
      };
      assert.equal(distractionAuditMatchesRequest(ev, data), true);
      const cache = {
        ...report,
        inputEventsRevision: 3,
        inputEvents: ev,
        data,
      };
      await services[0].saveWeekThreeDraft(
        write(7, { events: ev, auditResult: cache }),
      );
      assert.deepEqual(
        plain((await services[0].loadWeekThreeProgress(slug)).auditResult),
        plain(cache),
      );
      await failure(
        write(8, {
          auditResult: {
            ...cache,
            data: { ...data, categories: [...data.categories].reverse() },
          },
        }),
        "INVALID_INPUT",
      );
    });
    await t.test("trusted synthetic completed state cannot be downgraded or edited", async () => {
      // Seed a policy-stamped terminal fixture only; this does not invent a production completion rule.
      sql(
        `insert into public.week_three_progress(user_id,activity_id,content_version,revision,status,completion_policy_version,completed_at)
        values(${quote(users[1])},${
          quote(target)
        },'synthetic/v1',1,'completed','synthetic-policy/v1',now());`,
      );
      const original = plain(await services[1].loadWeekThreeProgress(slug));
      await failure(write(1, { events }), "WEEK_THREE_IMMUTABLE", 409, b);
      assert.throws(() =>
        sql(
          `update public.week_three_progress set status='in_progress',completed_at=null,completion_policy_version=null,revision=2 where user_id=${
            quote(users[1])
          };`,
        )
      );
      assert.deepEqual(
        plain(await services[1].loadWeekThreeProgress(slug)),
        original,
      );
    });
  } finally {
    for (const id of users) {
      sql(`delete from auth.users where id=${quote(id)};`);
    }
    sql(
      `delete from public.week_three_modules where activity_id=${
        quote(target)
      };delete from public.activity_aliases where slug in (${quote(slug)},${
        quote(other)
      },${quote(wrong)});`,
    );
    sql(
      `delete from public.activities where id in (${
        [target, alternate, prior1, prior2].map(quote).join(",")
      });`,
    );
    if (weekId) sql(`delete from public.weeks where id=${weekId};`);
  }
});
