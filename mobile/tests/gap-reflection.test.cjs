const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const intentions = require("../lib/fixtures/mock-intentions.json").intentions;
const answers = { ai_gap_got_right: "My attention", ai_gap_missed: "My context", ai_gap_reveals: "AI has limits" };
const turn = () => new Promise(setImmediate);

function load(file, imports) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

function database() {
  let user = "a", failRead = false, failWrite = false;
  const records = new Map(), calls = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: user } } }, error: null }) },
    from(table) {
      assert.equal(table, "progress");
      const filters = {};
      let update;
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        upsert(value) { update = value; calls.push(value); return query; },
        async maybeSingle() {
          if (failRead) return { data: null, error: new Error("offline") };
          assert.equal(filters.user_id, user);
          return { data: records.get(`${filters.user_id}/${filters.activity_id}`) ?? null, error: null };
        },
        async single() {
          if (failWrite) return { data: null, error: new Error("offline") };
          assert.equal(update.user_id, user);
          const key = `${update.user_id}/${update.activity_id}`;
          records.set(key, { ...records.get(key), ...update });
          return { data: { user_id: user }, error: null };
        },
      };
      return query;
    },
  };
  return {
    service: load("lib/progress.ts", { "./supabase": { supabase } }), records, calls,
    setUser(value) { user = value; },
    failRead(value) { failRead = value; },
    failWrite(value) { failWrite = value; },
  };
}

test("saves intentions and all reflection fields without changing other progress", async () => {
  const db = database();
  db.records.set("a/activity", { writing: "Keep my draft", status: "completed", reflection_answers: { other_question: "Keep this too" } });
  await db.service.saveProgressIntentions("a", "activity", intentions);
  await db.service.saveGapReflection("a", "activity", answers);
  const restored = await db.service.getGapReflection("a", "activity");
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), { intentions, answers });
  assert.equal(db.records.get("a/activity").writing, "Keep my draft");
  assert.equal(db.records.get("a/activity").status, "completed");
  assert.equal(db.records.get("a/activity").reflection_answers.other_question, "Keep this too");
  await db.service.saveGapReflection("a", "activity", { ...answers, ai_gap_missed: "" });
  assert.equal((await db.service.getGapReflection("a", "activity")).answers.ai_gap_missed, "");
});

test("missing and malformed intentions have no usable reference data", async () => {
  const db = database();
  assert.equal((await db.service.getGapReflection("a", "activity")).intentions, null);
  for (const value of [[], intentions.slice(0, 2), [null, null, null], [{ title: "", explanation: "x" }, ...intentions.slice(1)]]) {
    db.records.set("a/activity", { generated_intentions: value, reflection_answers: answers });
    const restored = await db.service.getGapReflection("a", "activity");
    assert.equal(restored.intentions, null);
    assert.equal(restored.answers.ai_gap_missed, answers.ai_gap_missed);
  }
});

test("read and save failures propagate and never erase existing answers", async () => {
  const db = database();
  db.records.set("a/activity", { reflection_answers: answers });
  db.failRead(true);
  await assert.rejects(db.service.getGapReflection("a", "activity"), /Could not load/);
  await assert.rejects(db.service.saveGapReflection("a", "activity", answers), /Could not save/);
  assert.equal(db.calls.length, 0);
  db.failRead(false);
  db.failWrite(true);
  await assert.rejects(db.service.saveGapReflection("a", "activity", { ...answers, ai_gap_missed: "new" }), /Could not save/);
  assert.equal(db.records.get("a/activity").reflection_answers.ai_gap_missed, answers.ai_gap_missed);
  await assert.rejects(db.service.saveProgressIntentions("a", "activity", intentions), /Could not save/);
});

test("reflection records are scoped by user and activity", async () => {
  const db = database();
  await db.service.saveGapReflection("a", "activity", answers);
  assert.equal((await db.service.getGapReflection("a", "different-activity")).answers.ai_gap_got_right, "");
  db.setUser("b");
  assert.equal((await db.service.getGapReflection("b", "activity")).answers.ai_gap_got_right, "");
  await assert.rejects(db.service.getGapReflection("a", "activity"), /Sign in again/);
  await assert.rejects(db.service.saveGapReflection("a", "activity", answers), /Sign in again/);
  await assert.rejects(db.service.saveProgressIntentions("a", "activity", intentions), /Sign in again/);
});

function screen(service) {
  let cursor = 0, back = 0, opened = 0;
  const slots = [], pendingEffects = [], cleanups = [];
  const react = {
    useState(initial) {
      const id = cursor++;
      if (!(id in slots)) slots[id] = initial;
      return [slots[id], value => { slots[id] = typeof value === "function" ? value(slots[id]) : value; }];
    },
    useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
    useEffect(effect, deps) {
      const id = cursor++, previous = slots[id];
      if (!previous || deps.some((value, i) => value !== previous[i])) {
        slots[id] = deps;
        pendingEffects.push(() => { cleanups[id]?.(); cleanups[id] = effect(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const component = load("src/components/ai-gap-reflection-screen.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Pressable", "ScrollView", "TextInput", "View"].map(value => [value, value])),
      Platform: { OS: "web" }, StyleSheet: { create: value => value },
    },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/components/themed-text": { ThemedText: "Text" },
    "@/components/themed-view": { ThemedView: "ThemedView" },
    "@/components/accessibility": { AccessibleHeading: "Heading", AccessibleStatus: "Status" },
    "@/hooks/use-theme": { useTheme: () => ({}) },
    "@/components/auth-gate": { useSignedInUserId: () => "a" },
    "../../lib/progress": service,
  });
  function render() {
    cursor = 0;
    const tree = component.AiGapReflectionScreen({ activityId: "activity", onBack: () => back++, onOpenIntention: () => opened++ });
    while (pendingEffects.length) pendingEffects.shift()();
    return tree;
  }
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  }
  function text(tree) {
    if (tree == null || typeof tree === "boolean") return "";
    if (typeof tree !== "object") return String(tree);
    return [tree.props?.children].flat(Infinity).map(text).join("");
  }
  render();
  return {
    text: () => text(render()),
    nodes: () => nodes(render()),
    inputs: () => nodes(render()).filter(node => node.type === "TextInput"),
    button: label => nodes(render()).find(node => node.type === "Pressable" && text(node) === label),
    get opened() { return opened; }, get back() { return back; },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test("screen loads references above restored fields and saves all edited answers", async () => {
  const db = database();
  await db.service.saveProgressIntentions("a", "activity", intentions);
  await db.service.saveGapReflection("a", "activity", answers);
  const ui = screen(db.service);
  assert.match(ui.text(), /Loading your saved intentions/);
  await turn();
  assert.equal(ui.inputs().length, 3);
  assert.ok(ui.text().indexOf(intentions[2].explanation) < ui.text().indexOf("What did the mock intentions get right?"));
  assert.deepEqual(ui.inputs().map(input => input.props.value), Object.values(answers));
  ui.inputs().forEach((input, index) => input.props.onChangeText(`Answer ${index}`));
  const save = ui.button("Save reflection");
  save.props.onPress();
  save.props.onPress();
  assert.match(ui.text(), /Saving/);
  await turn();
  assert.equal(db.calls.length, 3); // Intentions, initial answers, one edited save.
  assert.equal(ui.button("Save reflection").props.disabled, true);
  ui.unmount();
  const reopened = screen(db.service);
  await turn();
  assert.deepEqual(reopened.inputs().map(input => input.props.value), ["Answer 0", "Answer 1", "Answer 2"]);
});

test("missing intentions opens Intention Mirror; failed load can be retried", async () => {
  const db = database();
  const missing = screen(db.service);
  await turn();
  assert.equal(missing.inputs().length, 0);
  missing.button("Open Intention Mirror").props.onPress();
  assert.equal(missing.opened, 1);
  db.failRead(true);
  const ui = screen(db.service);
  await turn();
  assert.match(ui.text(), /Could not load/);
  db.failRead(false);
  await db.service.saveProgressIntentions("a", "activity", intentions);
  ui.button("Retry loading").props.onPress();
  ui.text();
  await turn();
  assert.equal(ui.inputs().length, 3);
});

test("save failure keeps answers and blocks leaving until retry succeeds", async () => {
  const db = database();
  await db.service.saveProgressIntentions("a", "activity", intentions);
  const ui = screen(db.service);
  await turn();
  ui.inputs()[0].props.onChangeText("Keep this answer");
  db.failWrite(true);
  ui.button("Back to Week 1").props.onPress();
  await turn();
  assert.equal(ui.back, 0);
  assert.equal(ui.inputs()[0].props.value, "Keep this answer");
  assert.match(ui.text(), /Could not save/);
  db.failWrite(false);
  ui.button("Retry save").props.onPress();
  await turn();
  ui.button("Back to Week 1").props.onPress();
  assert.equal(ui.back, 1);
});

test("reflection reading order is intentions, named fields, then save", async () => {
  const db = database();
  await db.service.saveProgressIntentions("a", "activity", intentions);
  const ui = screen(db.service);
  await turn();
  const nodes = ui.nodes();
  const cards = nodes.filter(node => node.props.accessibilityLabel?.startsWith("Intention "));
  assert.equal(cards.length, 3);
  const fields = nodes.filter(node => node.type === "TextInput");
  assert.ok(nodes.indexOf(cards[2]) < nodes.indexOf(fields[0]));
  fields.forEach(node => {
    assert.ok(node.props.accessibilityLabel);
    assert.match(node.props.accessibilityHint, /Save reflection/);
    assert.equal(node.props.accessibilityState.disabled, false);
  });
  const save = nodes.find(node => node.type === "Pressable" && node.props.accessibilityState?.busy === false);
  assert.ok(nodes.indexOf(save) > nodes.indexOf(fields[2]));
  assert.equal(save.props.accessibilityState.disabled, true);
  assert.match(save.props.accessibilityHint, /Enabled when answers have changed/);
});
