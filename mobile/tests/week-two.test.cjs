const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");
const sensations = { week_two_sensation_1: "weird", week_two_sensation_2: "warm", week_two_sensation_3: "tight" };
const words = { kind: "words", provider: "mock", items: [
  { original: "weird", isVague: true, suggestions: ["tingling", "fluttering"] },
  { original: "warm", isVague: false, suggestions: [] },
  { original: "tight", isVague: false, suggestions: [] },
] };

function database() {
  let user = "a", fail = false, conflict = false, writes = 0;
  const record = { current_step: "week_two_practice", status: "in_progress", started_at: "started", completed_at: null, updated_at: "0", reflection_answers: { arrive_body_region: "chest", other_answer: "Keep this" } };
  const owner = async expected => { if (user !== expected) throw Error("Sign in again"); };
  const supabase = { from() {
    const filters = {};
    let values;
    const query = { update(value) { values = value; return query; }, eq(key, value) { filters[key] = value; return query; }, select() { return query; }, async maybeSingle() {
      assert.equal(filters.user_id, user);
      assert.equal(filters.activity_id, "activity");
      if (fail) return { data: null, error: {} };
      if (conflict || filters.updated_at !== record.updated_at) return { data: null, error: null };
      Object.assign(record, values, { updated_at: String(++writes) });
      return { data: structuredClone(record), error: null };
    } };
    return query;
  } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/week-two.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === "./supabase" ? { supabase } : {
    isBodyRegion: value => value === "chest",
    readWeekTwoRecord: async expected => { await owner(expected); return structuredClone(record); },
    requireWeekTwoOwner: owner,
  } });
  return { api: exports, record, get writes() { return writes; }, fail(value) { fail = value; }, conflict(value) { conflict = value; }, setUser(value) { user = value; } };
}

async function explore(db) {
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_practice", { week_two_practice_complete: "yes" }, "week_two_explore");
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", sensations);
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", { week_two_lexicon: JSON.stringify(words) });
}

test("all four beats restore descriptions, returned words, ethics answers, and completion", async () => {
  const db = database();
  assert.equal((await db.api.loadWeekTwoProgress("a", "activity")).step, "week_two_practice");
  await explore(db);
  const restored = await db.api.loadWeekTwoProgress("a", "activity");
  assert.equal(restored.step, "week_two_explore");
  assert.deepEqual(JSON.parse(JSON.stringify(restored.lexicon)), words);
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice");
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_notice", { week_two_tracker_reflection: "Numbers miss context", week_two_closing_reflection: "Words captured warmth" });
  assert.equal((await db.api.loadWeekTwoProgress("a", "activity")).status, "in_progress");
  const completed = await db.api.saveWeekTwoAnswers("a", "activity", "week_two_notice", {}, "completed");
  assert.equal(completed.status, "completed");
  assert.ok(completed.completedAt);
  const writes = db.writes;
  assert.equal((await db.api.loadWeekTwoProgress("a", "activity")).step, "completed");
  assert.equal((await db.api.saveWeekTwoAnswers("a", "activity", "week_two_notice", {}, "completed")).completedAt, completed.completedAt);
  assert.equal(db.writes, writes);
  assert.equal(completed.answers.other_answer, "Keep this");
});

test("changing sensations invalidates old words and Notice cannot open until new matching results are saved", async () => {
  const db = database();
  await explore(db);
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", { week_two_sensation_1: "cool" });
  assert.equal((await db.api.loadWeekTwoProgress("a", "activity")).lexicon, null);
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice"), /three sensations/);
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", { week_two_lexicon: JSON.stringify(words) }), /does not match/);
  const changed = { ...words, items: [{ original: "cool", isVague: false, suggestions: [] }, ...words.items.slice(1)] };
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", { week_two_lexicon: JSON.stringify(changed) });
  assert.equal((await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice")).step, "week_two_notice");
});

test("partial Notice answers restore and missing closing reflection blocks completion", async () => {
  const db = database();
  await explore(db);
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice");
  await db.api.saveWeekTwoAnswers("a", "activity", "week_two_notice", { week_two_tracker_reflection: "Keep this" });
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_notice", {}, "completed"), /closing reflection/);
  assert.equal((await db.api.loadWeekTwoProgress("a", "activity")).answers.week_two_tracker_reflection, "Keep this");
  assert.equal(db.record.status, "in_progress");
});

test("save failures, conflicts, and account changes cannot erase answers or complete the week", async () => {
  const db = database();
  await explore(db);
  const original = JSON.stringify(db.record.reflection_answers);
  db.fail(true);
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", { week_two_sensation_1: "cool" }), /Could not save/);
  db.fail(false); db.conflict(true);
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice"), /changed while saving/);
  assert.equal(JSON.stringify(db.record.reflection_answers), original);
  db.setUser("b");
  await assert.rejects(db.api.loadWeekTwoProgress("a", "activity"), /Sign in again/);
  await assert.rejects(db.api.saveWeekTwoAnswers("a", "activity", "week_two_explore", {}, "week_two_notice"), /Sign in again/);
  assert.equal(db.record.status, "in_progress");
});
