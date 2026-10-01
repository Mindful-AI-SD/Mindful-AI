const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const steps = ["breathing", "post_breathing_check_in", "writing", "intention_mirror", "data_self_portrait", "ai_gap_reflection", "yellowdig_draft", "completed"];

function setup() {
  let record = null, user = "a", fail = false, conflict = false, revision = 0;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: user } } }, error: null }) },
    from() {
      const filters = {};
      let update;
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        update(value) { update = value; return query; },
        async upsert(value) {
          if (!record) record = { writing: null, generated_intentions: [], reflection_answers: {}, completed_at: null, updated_at: String(++revision), ...value };
          return { error: null };
        },
        async maybeSingle() {
          assert.equal(filters.user_id, user);
          if (fail) return { data: null, error: {} };
          if (update) {
            if (conflict || record.updated_at !== filters.updated_at) return { data: null, error: null };
            record = { ...record, ...update, updated_at: String(++revision) };
          }
          return { data: record ? structuredClone(record) : null, error: null };
        },
      };
      return query;
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/week-one.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === "./supabase" ? { supabase } : { WEEK_ONE_STEPS: steps } });
  return { api: exports, get record() { return record; }, set record(value) { record = value; },
    setUser(value) { user = value; }, fail(value) { fail = value; }, conflict(value) { conflict = value; } };
}

test("normal path persists each step, answers, and completion together", async () => {
  const db = setup();
  await db.api.startWeekOne("a", "activity");
  const answers = {
    post_breathing_check_in: "Calmer", data_self_portrait_visible: "Habits", data_self_portrait_missing: "Context",
    ai_gap_got_right: "Attention", ai_gap_missed: "Context", ai_gap_reveals: "Limits", yellowdig_draft: "My discussion post",
  };
  for (let i = 0; i < steps.length - 1; i++) {
    if (steps[i] === "writing") { db.record.writing = "My exact writing"; db.record.generated_intentions = [{}, {}, {}]; }
    await db.api.saveWeekOneStep("a", "activity", steps[i], answers);
    assert.equal((await db.api.getWeekOneProgress("a", "activity")).current_step, steps[i + 1]);
  }
  assert.equal(db.record.status, "completed");
  assert.ok(db.record.completed_at);
  assert.equal(db.record.writing, "My exact writing");
  assert.equal(db.record.reflection_answers.yellowdig_draft, answers.yellowdig_draft);
});

test("reopening preserves writing and intention steps without resetting data", async () => {
  const db = setup();
  await db.api.startWeekOne("a", "activity");
  for (const step of ["writing", "intention_mirror", "completed"]) {
    db.record.current_step = step;
    db.record.writing = "  saved writing  ";
    db.record.generated_intentions = [{ title: "one" }, { title: "two" }, { title: "three" }];
    const restored = await db.api.startWeekOne("a", "activity");
    assert.equal(restored.current_step, step);
    assert.equal(restored.writing, "  saved writing  ");
    assert.equal(restored.generated_intentions.length, 3);
  }
});

test("failed, conflicting, and invalid transitions do not advance or lose data", async () => {
  const db = setup();
  await db.api.startWeekOne("a", "activity");
  db.fail(true);
  await assert.rejects(db.api.saveWeekOneStep("a", "activity", "breathing"), /Could not load/);
  db.fail(false); db.conflict(true);
  await assert.rejects(db.api.saveWeekOneStep("a", "activity", "breathing"), /changed/);
  assert.equal(db.record.current_step, "breathing");
  db.conflict(false);
  await db.api.saveWeekOneStep("a", "activity", "breathing");
  await assert.rejects(db.api.saveWeekOneStep("a", "activity", "post_breathing_check_in"), /Answer each/);
  assert.equal(db.record.current_step, "post_breathing_check_in");
  db.setUser("b");
  await assert.rejects(db.api.getWeekOneProgress("a", "activity"), /Sign in again/);
});

test("legacy saved drafts restore to writing or results rather than breathing", async () => {
  const db = setup();
  await db.api.startWeekOne("a", "activity");
  db.record.status = "not_started"; db.record.writing = "existing";
  assert.equal((await db.api.startWeekOne("a", "activity")).current_step, "writing");
  db.record.status = "not_started"; db.record.generated_intentions = [{}, {}, {}];
  assert.equal((await db.api.startWeekOne("a", "activity")).current_step, "intention_mirror");
});
