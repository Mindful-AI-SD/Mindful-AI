const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const load = require("../helpers/load-activity-lookup.cjs");
const { cli, quote, sql, migrate } = require("../helpers/local-supabase.cjs");
test("MIN-226 read-only activity lookup over local Auth/RPC/RLS", async (t) => {
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
  const a = client(), b = client(), unsigned = client();
  const users = [];
  const slug = "synthetic-" + randomUUID();
  const activityId = randomUUID();
  let weekId;
  let weekNumber;
  try {
    migrate();
    // Choose an unused week, never modify an existing curriculum week.
    weekNumber = Number(
      sql(
        "select n from generate_series(3,8) n where not exists (select 1 from public.weeks w where w.week_number=n) order by n limit 1;",
      ),
    );
    assert.ok(
      weekNumber >= 3 && weekNumber <= 8,
      "No unused synthetic week is available",
    );
    weekId = Number(
      sql(
        `insert into public.weeks(week_number,title,theme,is_published) values (${weekNumber},'Synthetic lookup test','Synthetic',true) returning id;`,
      ),
    );
    sql(
      `insert into public.activities(id,week_id,activity_type,title,sequence_number,is_published) values (${
        quote(activityId)
      },${weekId},'ai_lab','Synthetic lookup',1,true);
      insert into public.activity_aliases(slug,activity_id) values (${
        quote(slug)
      },${quote(activityId)});`,
    );
    for (const c of [a, b]) {
      const { data, error } = await c.auth.signUp({
        email: "min226-" + randomUUID() + "@example.test",
        password: randomUUID() + "Aa9!",
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    const input = { slug, expectedWeek: weekNumber };
    const raw = (c, value = input) =>
      c.rpc("resolve_curriculum_activity", { p_request: value });
    await t.test("authenticated users resolve the same published canonical identity", async () => {
      for (const c of [a, b]) {
        assert.deepEqual(
          JSON.parse(JSON.stringify(await load(c).resolveActivity(input))),
          { slug, activityId, weekId, weekNumber },
        );
      }
    });
    await t.test("missing slug and wrong week return controlled 404", async () => {
      for (
        const value of [{ ...input, slug: "missing-" + randomUUID() }, {
          ...input,
          expectedWeek: weekNumber === 3 ? 4 : 3,
        }]
      ) {
        const result = await raw(a, value);
        assert.equal(result.status, 404);
        assert.equal(result.error.message, "ACTIVITY_NOT_AVAILABLE");
      }
    });
    await t.test("raw malformed and arbitrary identity input returns controlled 400", async () => {
      for (
        const value of [
          null,
          {},
          { ...input, user_id: users[1] },
          { ...input, activityId },
          { ...input, expectedWeek: 0 },
          { ...input, slug: "" },
        ]
      ) {
        const result = await raw(a, value);
        assert.equal(result.status, 400);
        assert.equal(result.error.message, "INVALID_INPUT");
        assert.doesNotMatch(
          JSON.stringify(result.error),
          /stack|password|secret|postgres|SELECT/i,
        );
      }
    });
    await t.test("unpublished activity is unavailable", async () => {
      sql(
        `update public.activities set is_published=false where id=${
          quote(activityId)
        };`,
      );
      assert.equal((await raw(a)).status, 404);
      sql(
        `update public.activities set is_published=true where id=${
          quote(activityId)
        };`,
      );
    });
    await t.test("unpublished week is unavailable", async () => {
      sql(`update public.weeks set is_published=false where id=${weekId};`);
      assert.equal((await raw(a)).status, 404);
      assert.deepEqual(
        (await a.from("activity_aliases").select("*").eq("slug", slug)).data,
        [],
      );
      sql(`update public.weeks set is_published=true where id=${weekId};`);
    });
    await t.test("students cannot create, retarget or delete aliases", async () => {
      for (const c of [a, b]) {
        assert.ok(
          (await c.from("activity_aliases").insert({
            slug: slug + "-forged",
            activity_id: activityId,
          })).error,
        );
        assert.ok(
          (await c.from("activity_aliases").update({ slug: slug + "-moved" })
            .eq("slug", slug)).error,
        );
        assert.ok(
          (await c.from("activity_aliases").delete().eq("slug", slug)).error,
        );
      }
      assert.equal((await raw(a)).status, 200);
    });
    await t.test("duplicate alias fails and trusted retarget fails", () => {
      assert.throws(() =>
        sql(
          `insert into public.activity_aliases values (${quote(slug)},${
            quote(activityId)
          });`,
        )
      );
      assert.throws(() =>
        sql(
          `update public.activity_aliases set slug=${
            quote(slug + "-changed")
          } where slug=${quote(slug)};`,
        )
      );
      assert.equal(
        sql(
          `select count(*) from public.activity_aliases where slug=${
            quote(slug)
          };`,
        ),
        "1",
      );
    });
    await t.test("signed out RPC and direct table access are denied", async () => {
      assert.equal((await raw(unsigned)).status, 401);
      assert.ok((await unsigned.from("activity_aliases").select("*")).error);
      await assert.rejects(load(unsigned).resolveActivity(input), {
        code: "AUTH_REQUIRED",
      });
    });
  } finally {
    sql(`delete from public.activity_aliases where slug=${quote(slug)};
      delete from public.activities where id=${quote(activityId)};`);
    if (weekId) sql(`delete from public.weeks where id=${weekId};`);
    for (const id of users) {
      sql(`delete from auth.users where id=${quote(id)};`);
    }
  }
});
