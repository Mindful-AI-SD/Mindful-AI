const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  cache.set(name, exports);
  vm.runInNewContext(code, { exports, require: target => load(target.slice(2)) });
  return exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const { readPrewrittenRecord, isWeekOnePrewritten, isWeekTwoPrewritten, generatedSourceLabel } = load("prewritten-content");
const weekOne = load("week-one-prewritten");
const { summarizeStudentSelections } = load("week-three-selection-summary");

const labels = {
  modeTitle: "Prewritten activity", modeDescription: "Written in advance.", disclosure: "Prewritten activity.",
  responseScreen: "Your words are saved as entered.", resultFooter: "Source: Prewritten content, version 1.0",
};
const result = { instruction: "Choose one, adapt it, or write your own.", examples: ["Pause before responding."], reflectionPrompts: ["Why?"] };
const record = { provider: "prewritten", contentVersion: "1.0.0", labels, result };

test("a valid saved record is read back with its content version", () => {
  assert.deepEqual(plain(readPrewrittenRecord(record, isWeekOnePrewritten)), record);
});

test("altered or incomplete saved records are treated as missing", () => {
  for (const bad of [
    null,
    "text",
    { ...record, provider: "claude" },
    { ...record, contentVersion: "one" },
    { ...record, contentVersion: undefined },
    { ...record, labels: { ...labels, modeTitle: "" } },
    { ...record, extra: true },
    { ...record, result: { ...result, examples: [] } },
    { ...record, result: { ...result, note: "x" } },
  ]) {
    assert.equal(readPrewrittenRecord(bad, isWeekOnePrewritten), null);
  }
});

test("Week 2 content needs vocabulary groups with words", () => {
  assert.equal(isWeekTwoPrewritten({ vocabulary: [{ area: "Breath", words: ["steady"] }], reflectionPrompts: ["Why?"] }), true);
  assert.equal(isWeekTwoPrewritten({ vocabulary: [{ area: "Breath", words: [] }], reflectionPrompts: ["Why?"] }), false);
  assert.equal(isWeekTwoPrewritten({ vocabulary: [], reflectionPrompts: ["Why?"] }), false);
});

test("source labels never present test data or an unknown source as live AI", () => {
  assert.match(generatedSourceLabel("claude"), /AI-generated with Claude/);
  assert.equal(generatedSourceLabel("mock"), "Test data, not AI output.");
  for (const other of ["saved", "future", undefined]) assert.equal(generatedSourceLabel(other), null);
});

test("Week 1: an intention counts only alongside readable saved content", () => {
  const saved = JSON.stringify(record);
  const { WEEK_ONE_PREWRITTEN_RESULT_KEY: result_, WEEK_ONE_PREWRITTEN_INTENTION_KEY: intention } = weekOne;
  assert.equal(weekOne.hasWeekOnePrewrittenIntention({ [result_]: saved, [intention]: "Pause." }), true);
  assert.equal(weekOne.hasWeekOnePrewrittenIntention({ [result_]: saved, [intention]: "   " }), false);
  assert.equal(weekOne.hasWeekOnePrewrittenIntention({ [intention]: "Pause." }), false);
  assert.equal(weekOne.hasWeekOnePrewrittenIntention({ [result_]: "not json", [intention]: "Pause." }), false);
  assert.equal(weekOne.hasWeekOnePrewrittenIntention(null), false);
  assert.equal(weekOne.readWeekOnePrewritten({ [result_]: "not json" }), null);
});

test("Week 1: every reflection prompt must be answered", () => {
  const answers = Object.fromEntries(weekOne.WEEK_ONE_PREWRITTEN_PROMPT_KEYS.map(key => [key, "An answer"]));
  assert.equal(weekOne.hasWeekOnePrewrittenReflection(answers), true);
  assert.equal(weekOne.hasWeekOnePrewrittenReflection({ ...answers, week_one_prewritten_prompt_4: " " }), false);
});

const CATEGORIES = ["planning", "memory", "worry", "social_comparison", "entertainment", "other"];

test("Week 3: reproduces the content pack's worked example", () => {
  const summary = plain(summarizeStudentSelections(CATEGORIES, [
    "entertainment", "planning", "entertainment", "memory", "social_comparison", "worry",
  ]));
  assert.deepEqual(summary, [
    { category: "planning", count: 1, percent: 16.7 },
    { category: "memory", count: 1, percent: 16.7 },
    { category: "worry", count: 1, percent: 16.7 },
    { category: "social_comparison", count: 1, percent: 16.7 },
    { category: "entertainment", count: 2, percent: 33.3 },
    { category: "other", count: 0, percent: 0 },
  ]);
});

test("Week 3: an empty log invents nothing, and a selection outside the list is rejected", () => {
  assert.ok(summarizeStudentSelections(CATEGORIES, []).every(entry => entry.count === 0 && entry.percent === 0));
  assert.throws(() => summarizeStudentSelections(CATEGORIES, ["social_media"]));
});

test("the non-AI modules contain no route to a provider or the network", () => {
  const allowed = { "prewritten-content": [], "week-one-prewritten": ["./prewritten-content"], "week-three-selection-summary": [] };
  for (const [name, imports] of Object.entries(allowed)) {
    const source = fs.readFileSync(path.join(__dirname, "../lib", `${name}.ts`), "utf8");
    assert.deepEqual([...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]), imports, name);
    assert.doesNotMatch(source, /\bfetch\(/, name);
  }
});
