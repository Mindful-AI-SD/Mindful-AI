const assert = require("node:assert/strict");
const test = require("node:test");
const load = require("./helpers/load-progress-helpers.cjs");
const activity = "550e8400-e29b-41d4-a716-446655440000";

function setup() {
  let user = "alice", fail = false, switchOnRead = false;
  const rows = new Map(), writes = [];
  const api = load({
    auth: {
      getUser: () => ({
        data: { user: user ? { id: user } : null },
        error: null,
      }),
    },
    from(table) {
      const filters = {};
      let values;
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters[key] = value;
          return query;
        },
        upsert(input, options) {
          assert.equal(options.onConflict, "user_id,activity_id");
          assert.equal(options.defaultToNull, false);
          values = input;
          writes.push(input);
          return query;
        },
        maybeSingle() {
          if (table === "activities") {
            assert.equal(filters["weeks.week_number"], 1);
            return { data: { id: activity }, error: null };
          }
          assert.equal(filters.user_id, user);
          const data = rows.get(`${filters.user_id}/${filters.activity_id}`) ??
            null;
          if (switchOnRead) user = "bob";
          return {
            data,
            error: fail ? { message: "private diagnostic" } : null,
          };
        },
        single() {
          if (fail) {
            return { data: null, error: { message: "private diagnostic" } };
          }
          assert.equal(values.user_id, user);
          const key = `${values.user_id}/${values.activity_id}`;
          const data = {
            writing: null,
            status: "not_started",
            ...rows.get(key),
            ...values,
          };
          rows.set(key, data);
          return { data, error: null };
        },
      };
      return query;
    },
  });
  return {
    api,
    rows,
    writes,
    user(value) {
      user = value;
    },
    fail() {
      fail = true;
    },
    switchOnRead() {
      switchOnRead = true;
    },
  };
}

test("create, reload and partial update keep one user/activity row", async () => {
  const { api, rows } = setup();
  assert.equal(await api.loadWeekOneProgress(activity), null);
  await api.upsertWeekOneProgress(activity, {
    writing: "saved",
    status: "in_progress",
  });
  assert.equal((await api.loadWeekOneProgress(activity)).writing, "saved");
  await api.upsertWeekOneProgress(activity, { current_step: "writing" });
  await api.upsertWeekOneProgress(activity, { current_step: "writing" });
  const row = await api.loadWeekOneProgress(activity);
  assert.equal(row.writing, "saved");
  assert.equal(row.status, "in_progress");
  assert.equal(rows.size, 1);
});
test("missing auth prevents reads and writes", async () => {
  const s = setup();
  s.user(null);
  await assert.rejects(s.api.loadWeekOneProgress(activity), /Sign in/);
  await assert.rejects(s.api.upsertWeekOneProgress(activity, {}), /Sign in/);
  assert.equal(s.writes.length, 0);
});
test("rejects ownership, activity, timestamp and unknown write fields", async () => {
  const s = setup();
  for (const field of ["user_id", "activity_id", "updated_at", "admin"]) {
    await assert.rejects(
      s.api.upsertWeekOneProgress(activity, { [field]: "bob" }),
      /Unsupported/,
    );
  }
  assert.equal(s.writes.length, 0);
});
test("users cannot load or update the other user's row through the helpers", async () => {
  const s = setup();
  await s.api.upsertWeekOneProgress(activity, { writing: "alice private" });
  s.user("bob");
  assert.equal(await s.api.loadWeekOneProgress(activity), null);
  await s.api.upsertWeekOneProgress(activity, { writing: "bob private" });
  s.user("alice");
  assert.equal(
    (await s.api.loadWeekOneProgress(activity)).writing,
    "alice private",
  );
  assert.equal(s.rows.size, 2);
});
test("account switch discards an in-flight read", async () => {
  const s = setup();
  s.switchOnRead();
  await assert.rejects(s.api.loadWeekOneProgress(activity), /account changed/);
});
test("database failures use safe messages", async () => {
  const s = setup();
  s.fail();
  await assert.rejects(s.api.loadWeekOneProgress(activity), {
    message: "Could not load progress. Please retry.",
  });
  await assert.rejects(s.api.upsertWeekOneProgress(activity, {}), {
    message: "Could not save progress. Please retry.",
  });
});
test("activity slugs and arbitrary user identifiers are not accepted as activity IDs", async () => {
  const s = setup();
  await assert.rejects(s.api.loadWeekOneProgress("alice"), /valid activity ID/);
});
