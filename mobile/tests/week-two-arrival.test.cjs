const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const activityId = "22222222-2222-4222-8222-222222222222";

function database() {
  let user = "a", available = true, fail = false, conflict = false, revision = 0;
  const records = new Map(), calls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    from(table) {
      const filters = {};
      let values, insert = false;
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(value) { values = value; return query; },
        upsert(value) { values = value; insert = true; return query; },
        async maybeSingle() {
          if (table === "activities") {
            assert.equal(filters["weeks.week_number"], 2);
            assert.equal(filters["is_published"], true);
            assert.equal(filters["weeks.is_published"], true);
            return { data: available ? { id: activityId } : null, error: null };
          }
          const owner = insert ? values.user_id : filters.user_id;
          assert.equal(owner, user);
          assert.equal(insert ? values.activity_id : filters.activity_id, activityId);
          const previous = records.get(owner);
          if (values) {
            if (fail) return { data: null, error: {} };
            if (conflict || (insert && previous) || (!insert && previous.updated_at !== filters.updated_at)) return { data: null, error: null };
            calls.push(values);
            records.set(owner, { ...previous, ...values, updated_at: String(++revision) });
          }
          return { data: records.get(owner) ? structuredClone(records.get(owner)) : null, error: null };
        },
      };
      return query;
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/week-two-arrival.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({ supabase }) });
  return { api: exports, records, calls, setUser(value) { user = value; }, available(value) { available = value; }, fail(value) { fail = value; }, conflict(value) { conflict = value; } };
}

test("new check-ins have no selection; saving restores the typed region and Practice step", async () => {
  const db = database();
  assert.equal((await db.api.loadWeekTwoArrival("a", activityId)).region, null);
  const saved = await db.api.saveWeekTwoArrival("a", activityId, "chest");
  assert.equal(saved.region, "chest");
  assert.equal(saved.step, "week_two_practice");
  assert.equal((await db.api.loadWeekTwoArrival("a", activityId)).step, "week_two_practice");
  assert.equal(db.records.get("a").status, "in_progress");
  assert.equal(db.records.get("a").completed_at, null);
});

test("revising preserves other answers and saves the new single location", async () => {
  const db = database();
  await db.api.saveWeekTwoArrival("a", activityId, "head");
  db.records.get("a").reflection_answers.other_answer = "Keep this";
  await db.api.saveWeekTwoArrival("a", activityId, "head", false);
  assert.equal((await db.api.loadWeekTwoArrival("a", activityId)).step, "week_two_arrive");
  await db.api.saveWeekTwoArrival("a", activityId, "left_foot");
  assert.equal((await db.api.loadWeekTwoArrival("a", activityId)).region, "left_foot");
  assert.equal(db.records.get("a").reflection_answers.other_answer, "Keep this");
});

test("invalid locations and unavailable curriculum cannot write progress", async () => {
  const db = database();
  await assert.rejects(db.api.saveWeekTwoArrival("a", activityId, "unknown"), /Choose a body region/);
  await assert.rejects(db.api.loadWeekTwoArrival("a", "slug"), /valid Week 2/);
  db.available(false);
  await assert.rejects(db.api.saveWeekTwoArrival("a", activityId, "chest"), /unavailable/);
  assert.equal(db.calls.length, 0);
});

test("failed and conflicting saves preserve the existing selection and can be retried", async () => {
  const db = database();
  await db.api.saveWeekTwoArrival("a", activityId, "head", false);
  db.fail(true);
  await assert.rejects(db.api.saveWeekTwoArrival("a", activityId, "chest"), /Could not save/);
  db.fail(false); db.conflict(true);
  await assert.rejects(db.api.saveWeekTwoArrival("a", activityId, "chest"), /changed while saving/);
  assert.equal((await db.api.loadWeekTwoArrival("a", activityId)).region, "head");
  db.conflict(false);
  assert.equal((await db.api.saveWeekTwoArrival("a", activityId, "chest")).region, "chest");
});

test("one account cannot read or revise another account's region", async () => {
  const db = database();
  await db.api.saveWeekTwoArrival("a", activityId, "left_hand");
  db.setUser("b");
  assert.equal((await db.api.loadWeekTwoArrival("b", activityId)).region, null);
  await assert.rejects(db.api.loadWeekTwoArrival("a", activityId), /Sign in again/);
  await assert.rejects(db.api.saveWeekTwoArrival("a", activityId, "right_hand"), /Sign in again/);
  assert.equal(db.records.get("a").reflection_answers.arrive_body_region, "left_hand");
  db.setUser(null);
  await assert.rejects(db.api.loadWeekTwoArrival("b", activityId), /Sign in again/);
});
