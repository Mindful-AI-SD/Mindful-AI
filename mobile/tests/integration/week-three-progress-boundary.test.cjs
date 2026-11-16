const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createClient } = require("@supabase/supabase-js");
const { cli, sql, quote } = require("../helpers/local-supabase.cjs");
const root = path.resolve(__dirname, "../../..");
const migrationVersion = "20261112010000";

// Reuse local test infrastructure; do not weaken its strict default drift check.
// The developer DB has these three previously applied versions, absent on main.
// Stage their RECORDED SQL only to recognize history; the CLI never reruns it.
function applyCandidate() {
  const versions = fs.readdirSync(path.join(root, "supabase/migrations")).map(
    (n) => n.split("_")[0],
  );
  const recorded = JSON.parse(
    sql(
      "select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;",
    ),
  );
  const extras = recorded.filter((v) => !versions.includes(v));
  for (const v of extras) {
    assert.ok(
      ["20261015000000", "20261029010000", "20261029020000"].includes(v),
      "Unexpected migration drift",
    );
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "min226-candidate-"));
  try {
    fs.mkdirSync(path.join(temp, "supabase"));
    fs.copyFileSync(
      path.join(root, "supabase/config.toml"),
      path.join(temp, "supabase/config.toml"),
    );
    fs.cpSync(
      path.join(root, "supabase/migrations"),
      path.join(temp, "supabase/migrations"),
      { recursive: true },
    );
    for (const v of extras) {
      const statements = JSON.parse(
        sql(
          `select to_json(statements) from supabase_migrations.schema_migrations where version=${
            quote(v)
          };`,
        ),
      );
      assert.ok(statements?.length);
      fs.writeFileSync(
        path.join(temp, "supabase/migrations", `${v}_recorded_history.sql`),
        statements.join(";\n") + ";\n",
      );
    }
    cli(["--workdir", temp, "migration", "up", "--local"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

// Only synthetic users/activities; no provider, real student text or remote URL.
test("MIN-226 Week 3 progress write boundary through real Auth/REST/RLS", async (t) => {
  const config = JSON.parse(cli(["status", "-o", "json"]));
  assert.equal(new URL(config.API_URL).hostname, "127.0.0.1");
  const client = () =>
    createClient(config.API_URL, config.PUBLISHABLE_KEY || config.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const a = client(), b = client(), unsigned = client();
  const users = [], activity = randomUUID(), alternate = randomUUID();
  let week, createdWeek = false, legacySnapshot;
  const plain = (value) => JSON.parse(JSON.stringify(value));
  try {
    for (const c of [a, b]) {
      const { data, error } = await c.auth.signUp({
        email: `min226-${randomUUID()}@example.test`,
        password: `${randomUUID()}Aa9!`,
      });
      assert.equal(error, null);
      assert.ok(data.session);
      users.push(data.user.id);
    }
    week = sql("select id from public.weeks where week_number=3;");
    if (!week) {
      week = sql(
        "insert into public.weeks(week_number,title,theme,is_published) values(3,'Synthetic boundary test','Synthetic',true) returning id;",
      );
      createdWeek = true;
    }
    // Do not modify a real existing week or activity, only append owned test fixtures.
    sql(
      `insert into public.activities(id,week_id,activity_type,title,sequence_number,is_published) values
      (${quote(activity)},${
        Number(week)
      },'ai_lab','Synthetic boundary test',31998,true),
      (${quote(alternate)},${
        Number(week)
      },'ai_lab','Synthetic alternate',31997,true);`,
    );
    const priors = (await a.from("activities").select(
      "id,weeks!inner(week_number,is_published)",
    ).eq("is_published", true)).data.filter((row) =>
      [1, 2].includes(row.weeks.week_number) && row.weeks.is_published
    );
    assert.ok(
      [1, 2].every((n) => priors.some((p) => p.weeks.week_number === n)),
      "Published Week 1/2 fixtures required",
    );
    // Existing synthetic snapshots are created BEFORE first application of this migration.
    sql(
      `insert into public.progress(user_id,activity_id,status,current_step,reflection_answers,completed_at) values
      (${quote(users[0])},${
        quote(activity)
      },'in_progress','week_three_arrive','{"unrelated":"Synthetic retained","week_three_module_v1":"Synthetic prior draft"}',null),
      (${quote(users[1])},${
        quote(activity)
      },'completed','completed','{"unrelated":"Synthetic completed"}','2026-11-01T12:00:00Z');`,
    );
    const before = plain(
      (await a.from("progress").select("*").eq("activity_id", activity)).data,
    );
    applyCandidate();
    assert.equal(
      sql(
        `select count(*) from supabase_migrations.schema_migrations where version=${
          quote(migrationVersion)
        };`,
      ),
      "1",
    );

    await t.test("migration leaves existing draft and completed rows readable and unchanged", async () => {
      assert.deepEqual(
        plain(
          (await a.from("progress").select("*").eq("activity_id", activity))
            .data,
        ),
        before,
      );
      const completed = await b.from("progress").select("*").eq(
        "activity_id",
        activity,
      ).single();
      assert.equal(completed.data.status, "completed");
      assert.equal(
        completed.data.reflection_answers.unrelated,
        "Synthetic completed",
      );
    });
    await t.test("fresh direct inserts and updates fail without prior-week completion", async () => {
      assert.ok(
        (await a.from("progress").insert({
          user_id: users[0],
          activity_id: alternate,
          status: "in_progress",
        })).error,
      );
      assert.ok(
        (await a.from("progress").update({ reflection_answers: {} }).eq(
          "activity_id",
          activity,
        )).error,
      );
      assert.deepEqual(
        plain(
          (await a.from("progress").select("*").eq("activity_id", activity))
            .data,
        ),
        before,
      );
      assert.equal(
        (await a.rpc("can_write_week_three_progress", {
          p_activity_id: activity,
        })).data,
        false,
      );
    });
    await t.test("arbitrary owner and activity identity changes cannot bypass", async () => {
      assert.equal(
        (await a.rpc("can_write_week_three_progress", {
          p_activity_id: randomUUID(),
        })).data,
        false,
      );
      assert.equal(
        (await a.rpc("can_write_week_three_progress", { p_activity_id: null }))
          .data,
        false,
      );
      assert.ok(
        (await a.from("progress").insert({
          user_id: users[1],
          activity_id: alternate,
        })).error,
      );
      assert.ok(
        (await a.from("progress").update({ activity_id: priors[0].id }).eq(
          "activity_id",
          activity,
        )).error,
      );
      assert.ok(
        (await a.from("progress").update({ user_id: users[1] }).eq(
          "activity_id",
          activity,
        )).error,
      );
    });
    // Mirror the accepted saved-state prerequisite, not an invented Week 3 rule.
    for (const prior of priors) {
      assert.equal(
        (await a.from("progress").insert({
          user_id: users[0],
          activity_id: prior.id,
          status: "completed",
          current_step: "completed",
          reflection_answers: { legacy: "Synthetic retained" },
          completed_at: "2026-11-01T12:00:00Z",
        })).error,
        null,
      );
    }
    legacySnapshot = plain(
      (await a.from("progress").select("*").in(
        "activity_id",
        priors.map((p) => p.id),
      ).order("activity_id")).data,
    );
    await t.test("eligible owner can save and reload while unrelated draft data survives", async () => {
      assert.equal(
        (await a.rpc("can_write_week_three_progress", {
          p_activity_id: activity,
        })).data,
        true,
      );
      assert.equal(
        (await a.from("progress").update({ current_step: "week_three_explore" })
          .eq("activity_id", activity)).error,
        null,
      );
      const row = await a.from("progress").select(
        "reflection_answers,current_step",
      ).eq("activity_id", activity).single();
      assert.equal(row.data.current_step, "week_three_explore");
      assert.equal(row.data.reflection_answers.unrelated, "Synthetic retained");
      assert.equal(
        (await a.from("progress").upsert({
          user_id: users[0],
          activity_id: alternate,
          status: "in_progress",
        })).error,
        null,
      );
      assert.equal(
        (await a.from("progress").upsert({
          user_id: users[0],
          activity_id: alternate,
          status: "in_progress",
        })).error,
        null,
      );
      assert.equal(
        (await a.from("progress").select("*", { count: "exact" }).eq(
          "activity_id",
          alternate,
        )).count,
        1,
      );
    });
    await t.test("one missing published prerequisite blocks and publication is rechecked", async () => {
      sql(
        `update public.progress set status='in_progress',completed_at=null where user_id=${
          quote(users[0])
        } and activity_id=${quote(priors[0].id)};`,
      );
      assert.ok(
        (await a.from("progress").update({ current_step: "week_three_notice" })
          .eq("activity_id", activity)).error,
      );
      // Restore the required completion fields on this synthetic test row.
      const old = legacySnapshot.find((row) =>
        row.activity_id === priors[0].id
      );
      sql(
        `update public.progress set status='completed',completed_at=${
          quote(old.completed_at)
        } where user_id=${quote(users[0])} and activity_id=${
          quote(priors[0].id)
        };`,
      );
      sql(
        `update public.activities set is_published=false where id=${
          quote(activity)
        };`,
      );
      assert.ok(
        (await a.from("progress").update({ current_step: "week_three_notice" })
          .eq("activity_id", activity)).error,
      );
      assert.equal(
        (await a.from("progress").select("*").eq("activity_id", activity)).data
          .length,
        1,
      );
      sql(
        `update public.activities set is_published=true where id=${
          quote(activity)
        };`,
      );
    });
    await t.test("completed rows cannot be downgraded or deleted, including after withdrawal", async () => {
      const old = plain(
        (await b.from("progress").select("*").eq("activity_id", activity)
          .single()).data,
      );
      const update = await b.from("progress").update({
        status: "in_progress",
        completed_at: null,
      }).eq("activity_id", activity).select("*");
      assert.ok(update.error || update.data.length === 0);
      const remove = await b.from("progress").delete().eq(
        "activity_id",
        activity,
      ).select("*");
      assert.ok(remove.error || remove.data.length === 0);
      sql(
        `update public.activities set is_published=false where id=${
          quote(activity)
        };`,
      );
      const hiddenRemove = await b.from("progress").delete().eq(
        "activity_id",
        activity,
      ).select("*");
      assert.ok(hiddenRemove.error || hiddenRemove.data.length === 0);
      assert.ok(
        (await b.from("progress").update({ activity_id: priors[0].id }).eq(
          "activity_id",
          activity,
        )).error,
      );
      assert.deepEqual(
        plain(
          (await b.from("progress").select("*").eq("activity_id", activity)
            .single()).data,
        ),
        old,
      );
      sql(
        `update public.activities set is_published=true where id=${
          quote(activity)
        };`,
      );
    });
    await t.test("cross-account and signed-out direct access stay denied", async () => {
      assert.deepEqual(
        (await b.from("progress").select("*").eq("user_id", users[0])).data,
        [],
      );
      const update = await b.from("progress").update({
        current_step: "week_three_notice",
      }).eq("user_id", users[0]).select("*");
      assert.ok(update.error || update.data.length === 0);
      assert.ok(
        (await unsigned.from("progress").insert({
          user_id: users[0],
          activity_id: alternate,
        })).error,
      );
      assert.ok(
        (await unsigned.rpc("can_write_week_three_progress", {
          p_activity_id: activity,
        })).error,
      );
    });
    await t.test("legacy Week 1/2 writes retain current behavior", async () => {
      const prior = priors[0];
      assert.equal(
        (await a.from("progress").update({ writing: "Synthetic legacy edit" })
          .eq("activity_id", prior.id)).error,
        null,
      );
      const rows = await a.from("progress").select(
        "activity_id,status,reflection_answers",
      ).in("activity_id", priors.map((p) => p.id));
      assert.ok(
        rows.data.every((row) =>
          row.status === "completed" &&
          row.reflection_answers.legacy === "Synthetic retained"
        ),
      );
    });
  } finally {
    for (const user of users) {
      sql(`delete from auth.users where id=${quote(user)};`);
    }
    sql(
      `delete from public.activities where id in (${quote(activity)},${
        quote(alternate)
      });`,
    );
    if (createdWeek) sql(`delete from public.weeks where id=${Number(week)};`);
  }
});
