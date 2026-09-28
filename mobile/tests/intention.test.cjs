const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const fixture = require("../lib/fixtures/mock-intentions.json");
const request = { activityId: "activity-id", activityContext: "Week 1", userReflection: "My writing" };
const turn = () => new Promise(setImmediate);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function environment(overrides = {}) {
  let now = 0, next = 0;
  const timers = new Map(), cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const exports = {};
    cache.set(file, exports);
    vm.runInNewContext(source, {
      exports, AbortController,
      setTimeout(fn, delay) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
      clearTimeout(id) { timers.delete(id); },
      require(name) {
        if (name in overrides) return overrides[name];
        assert.ok(name.startsWith("."), `Unexpected import: ${name}`);
        const target = path.resolve(path.dirname(file), name);
        return load(path.extname(target) ? target : target + ".ts");
      },
    });
    return exports;
  }
  return {
    load: file => load(path.join(root, file)),
    timers,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
      await turn();
    },
  };
}

test("default mock returns exactly three structured intentions after a delay", async () => {
  const env = environment();
  const service = env.load("lib/intention.ts");
  let completed = false;
  const pending = service.getIntentions(request).then(result => { completed = true; return result; });
  await turn();
  await env.advance(799);
  assert.equal(completed, false);
  await env.advance(1);
  const result = await pending;
  assert.equal(result.error, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), fixture);
  assert.equal(env.timers.size, 0);
});

test("timeout aborts provider and ignores a late successful response", async () => {
  const env = environment();
  const service = env.load("lib/intention.ts");
  const late = deferred();
  let signal;
  const pending = service.getIntentions(request, { provider: (_, value) => { signal = value; return late.promise; } });
  await turn();
  await env.advance(15_000);
  const result = await pending;
  assert.equal(result.error.code, "TIMEOUT");
  assert.equal(signal.aborted, true);
  late.resolve(fixture);
  await turn();
  assert.equal(result.error.code, "TIMEOUT");
  assert.equal(env.timers.size, 0);
});

test("provider rejection, thrown errors, and malformed responses are recoverable", async () => {
  const service = environment().load("lib/intention.ts");
  for (const provider of [async () => { throw Error("provider down"); }, () => { throw Error("failed"); }]) {
    assert.equal((await service.getIntentions(request, { provider })).error.code, "REQUEST_FAILED");
  }
  for (const data of [null, { intentions: ["a", "b", "c"] }, { ...fixture, intentions: fixture.intentions.slice(0, 2) }, { ...fixture, intentions: [...fixture.intentions, fixture.intentions[0]] }, { ...fixture, intentions: [{ title: "", explanation: "x" }, ...fixture.intentions.slice(1)] }]) {
    assert.equal((await service.getIntentions(request, { provider: async () => data })).error.code, "INVALID_RESPONSE");
  }
});

test("cancellation stops the delayed mock and clears its timers", async () => {
  const env = environment();
  const service = env.load("lib/intention.ts");
  const controller = new AbortController();
  const pending = service.getIntentions(request, { signal: controller.signal });
  await turn();
  controller.abort();
  assert.equal((await pending).error.code, "CANCELLED");
  assert.equal(env.timers.size, 0);
});

// Render the screen's JSX with native widgets replaced by inspectable elements.
// The real API service runs; only React hooks and persistence are isolated here.
function screen(provider) {
  let cursor = 0, writing = "  My original\nwriting  ", draftStatus = "saved";
  const slots = [], effects = [], calls = [];
  const react = {
    useState(initial) {
      const id = cursor++;
      if (!(id in slots)) slots[id] = initial;
      return [slots[id], value => { slots[id] = typeof value === "function" ? value(slots[id]) : value; }];
    },
    useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
    useEffect(effect) { const id = cursor++; if (!(id in slots)) { slots[id] = true; effects.push(effect); } },
  };
  const jsx = (type, props) => ({ type, props });
  const overrides = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Pressable", "ScrollView", "TextInput", "View"].map(value => [value, value])),
      Platform: { OS: "web" }, StyleSheet: { create: value => value },
    },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@/components/themed-text": { ThemedText: "Text" },
    "@/components/themed-view": { ThemedView: "ThemedView" },
    "@/hooks/use-theme": { useTheme: () => ({}) },
    "@/components/auth-gate": { useSignedInUserId: () => "user-a" },
    "@/hooks/use-writing-draft": { useWritingDraft: () => ({
      writing, status: draftStatus, setWriting: value => { writing = value; }, retry() {}, flush: async () => true,
    }) },
  };
  const env = environment(overrides);
  const service = env.load("lib/intention.ts");
  overrides["../../lib/intention"] = { getIntentions: (payload, options) => {
    calls.push(payload);
    return service.getIntentions(payload, { ...options, provider });
  } };
  const component = env.load("src/components/intention-mirror-screen.tsx");
  const cleanups = [];
  function render() {
    cursor = 0;
    const tree = component.IntentionMirrorScreen({ activityId: "real-activity-id", onBack() {} });
    while (effects.length) cleanups.push(effects.shift()());
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
  return {
    ...env, calls,
    text: () => text(render()),
    input: () => nodes(render()).find(node => node.type === "TextInput"),
    button: label => nodes(render()).find(node => node.type === "Pressable" && text(node) === label),
    acknowledge() { nodes(render()).find(node => node.props.accessibilityRole === "checkbox").props.onPress(); },
    setDraftStatus(value) { draftStatus = value; },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test("delayed success renders returned titles and explanations with no duplicate submits", async () => {
  const delayed = deferred();
  const ui = screen(() => delayed.promise);
  assert.equal(ui.button("Submit").props.disabled, true);
  ui.acknowledge();
  const submit = ui.button("Submit");
  submit.props.onPress();
  submit.props.onPress();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].activityId, "real-activity-id");
  assert.equal(ui.calls[0].userReflection, "My original\nwriting");
  assert.match(ui.text(), /Preparing your intentions/);
  await turn();
  await ui.advance(5_000);
  assert.match(ui.text(), /Preparing your intentions/);
  const response = { provider: "mock", intentions: [1, 2, 3].map(n => ({ title: `Returned title ${n}`, explanation: `Returned explanation ${n}` })) };
  delayed.resolve(response);
  await turn();
  for (const item of response.intentions) {
    assert.ok(ui.text().includes(item.title));
    assert.ok(ui.text().includes(item.explanation));
  }
  assert.doesNotMatch(ui.text(), /Preparing your intentions/);
  ui.button("Back to writing").props.onPress();
  assert.equal(ui.input().props.value, "  My original\nwriting  ");
});

test("timeout exposes recovery; retry is single-submit and late results cannot replace it", async () => {
  const late = deferred(), retried = deferred();
  let count = 0;
  const ui = screen(() => ++count === 1 ? late.promise : retried.promise);
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  await ui.advance(15_000);
  assert.match(ui.text(), /Request timed out/);
  assert.ok(ui.button("Back to writing"));
  const retry = ui.button("Retry");
  retry.props.onPress();
  retry.props.onPress();
  assert.equal(ui.calls.length, 2);
  late.resolve(fixture);
  await turn();
  assert.match(ui.text(), /Preparing your intentions/);
  retried.resolve(fixture);
  await turn();
  assert.match(ui.text(), /Mock intentions/);
  ui.button("Back to writing").props.onPress();
  assert.equal(ui.input().props.value, "  My original\nwriting  ");
});

test("provider failure returns to writing intact and autosave errors remain visible", async () => {
  const ui = screen(async () => { throw Error("provider failed"); });
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  assert.match(ui.text(), /Unable to load intentions/);
  assert.ok(ui.button("Retry"));
  ui.setDraftStatus("save-error");
  assert.ok(ui.button("Retry save"));
  ui.button("Back to writing").props.onPress();
  assert.equal(ui.input().props.value, "  My original\nwriting  ");
  ui.input().props.onChangeText("Edited after failure");
  assert.equal(ui.input().props.value, "Edited after failure");
});

test("unmount cancels an active request and ignores its late response", async () => {
  const late = deferred();
  let signal;
  const ui = screen((_, value) => { signal = value; return late.promise; });
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  ui.unmount();
  assert.equal(signal.aborted, true);
  late.resolve(fixture);
  await turn();
  assert.doesNotMatch(ui.text(), /Mock intentions/);
  assert.equal(ui.timers.size, 0);
});
