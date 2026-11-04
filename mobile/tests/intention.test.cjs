const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const fixture = require("../lib/fixtures/mock-intentions.json");
const originalDraft = "  My original\nwriting " + "notice ".repeat(147) + " ";
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
  // Stands in for the ai-activity client: answers after 800ms, stops if cancelled.
  const server = {
    getAiActivity: (kind, sent, options) => new Promise(resolve => {
      const id = ++next;
      timers.set(id, { at: now + 800, fn: () => resolve({
        data: { outcome: "result", kind, provider: fixture.provider, result: { intentions: fixture.intentions } },
        error: null,
      }) });
      options.signal.addEventListener("abort", () => timers.delete(id));
      server.calls.push({ kind, sent });
    }),
    calls: [],
  };
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
        if (name === "./ai-activity") return server;
        assert.ok(name.startsWith("."), `Unexpected import: ${name}`);
        const target = path.resolve(path.dirname(file), name);
        return load(path.extname(target) ? target : target + ".ts");
      },
    });
    return exports;
  }
  return {
    load: file => load(path.join(root, file)),
    timers, server,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
      await turn();
    },
  };
}

test("the default route is the ai-activity endpoint and returns three structured intentions", async () => {
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
  assert.equal(env.server.calls[0].kind, "intention_mirror");
  assert.deepEqual(JSON.parse(JSON.stringify(env.server.calls[0].sent)), {
    activityId: request.activityId, activityContext: request.activityContext, input: { reflection: request.userReflection },
  });
});

function serverReturning(answer) {
  return { "./ai-activity": { getAiActivity: async () => answer } };
}

test("a provider other than the mock is accepted and reported", async () => {
  const service = environment(serverReturning({
    data: { outcome: "result", kind: "intention_mirror", provider: "claude", result: { intentions: fixture.intentions } }, error: null,
  })).load("lib/intention.ts");
  assert.equal((await service.getIntentions(request)).data.provider, "claude");
});

test("the fixed crisis response comes back as support, never as intentions", async () => {
  const resources = [{ name: "988", contact: "Call or text 988" }];
  const service = environment(serverReturning({
    data: { outcome: "support", message: "Support message", resources }, error: null,
  })).load("lib/intention.ts");
  const { data } = await service.getIntentions(request);
  assert.equal(data.kind, "support");
  assert.equal(data.message, "Support message");
  assert.equal("intentions" in data, false);
});

test("fixed content comes back as prewritten, with its source and version", async () => {
  const result = { instruction: "Choose one.", examples: ["Pause."], reflectionPrompts: ["Why?"] };
  const service = environment(serverReturning({
    data: { outcome: "prewritten", kind: "intention_mirror", provider: "prewritten", contentVersion: "1.0.0", labels: {}, result }, error: null,
  })).load("lib/intention.ts");
  const { data } = await service.getIntentions(request);
  assert.equal(data.kind, "prewritten");
  assert.equal(data.contentVersion, "1.0.0");
  assert.equal("intentions" in data, false);
});

test("a server error reaches the screen unchanged, including the unavailable state", async () => {
  const failure = { code: "UNAVAILABLE", message: "The selected mode is unavailable. Choose another mode or try again.", status: 501 };
  const service = environment(serverReturning({ data: null, error: failure })).load("lib/intention.ts");
  assert.deepEqual(JSON.parse(JSON.stringify((await service.getIntentions(request)).error)), failure);
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

test("cancellation stops the server request and clears its timers", async () => {
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
const READY_MODE = { status: "ready", refresh() {}, mode: { mode: "mock", available: true, contentVersion: null, labels: null } };

function screen(provider, saveIntentions = async () => {}, activityMode = READY_MODE, forcedError = null) {
  let cursor = 0, writing = originalDraft, draftStatus = "saved";
  const slots = [], effects = [], calls = [], writingChanges = [];
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
    "@/components/accessibility": { AccessibleHeading: "Heading", AccessibleStatus: "Status" },
    "@/hooks/use-theme": { useTheme: () => ({}) },
    "@/hooks/use-activity-mode": { useActivityMode: () => activityMode },
    "./activity-mode-notice": { ActivityModeNotice: "ModeNotice" },
    "./week-one-prewritten": { WeekOnePrewrittenChoice: "PrewrittenChoice" },
    "@/components/auth-gate": { useSignedInUserId: () => "user-a" },
    "../../lib/progress": { saveProgressIntentions: saveIntentions },
    "@/hooks/use-writing-draft": { useWritingDraft: () => ({
      writing, status: draftStatus, setWriting: value => {
        writingChanges.push(value);
        writing = value;
      }, retry() {}, flush: async () => true,
    }) },
  };
  const env = environment(overrides);
  const service = env.load("lib/intention.ts");
  overrides["../../lib/intention"] = { getIntentions: (payload, options) => {
    calls.push(payload);
    if (forcedError) return Promise.resolve({ data: null, error: forcedError });
    return service.getIntentions(payload, { ...options, provider });
  } };
  const component = env.load("src/components/intention-mirror-screen.tsx");
  const cleanups = [];
  function render() {
    cursor = 0;
    const tree = component.IntentionMirrorScreen({ activityId: "real-activity-id", onBack() {}, onIntentionsReady() {}, onOpenGap() {} });
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
    ...env, calls, writingChanges,
    get draft() { return writing; },
    text: () => text(render()),
    nodes: () => nodes(render()),
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
  await turn();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].activityId, "real-activity-id");
  assert.equal(ui.calls[0].userReflection, originalDraft.trim());
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
  assert.equal(ui.input().props.value, originalDraft);
});

function assertThreeReturnedIntentions(ui, expected) {
  const cards = ui.nodes().filter(node => node.props.accessibilityLabel?.startsWith("Intention "));
  assert.equal(cards.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(cards.map(card =>
    card.props.children.map(child => child.props.children)
  ))), expected.intentions.map(item => [item.title, item.explanation]));
}

test("frontend uses the server route by default, keeps loading until completion, and preserves the draft", async () => {
  const ui = screen();
  const draft = originalDraft;
  ui.acknowledge();
  const submit = ui.button("Submit");
  for (let tap = 0; tap < 5; tap++) submit.props.onPress();
  await turn();
  assert.equal(ui.calls.length, 1);
  assert.match(ui.text(), /Preparing your intentions/);
  assert.equal(ui.button("Submit"), undefined);
  assert.equal(ui.draft, draft);
  await ui.advance(799);
  assert.match(ui.text(), /Preparing your intentions/);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.draft, draft);
  await ui.advance(1);
  assertThreeReturnedIntentions(ui, fixture);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.draft, draft);
  assert.deepEqual(ui.writingChanges, []);
  ui.button("Back to writing").props.onPress();
  assert.equal(ui.input().props.value, draft);
});

for (const scenario of ["timeout", "provider failure", "invalid response", "save failure"]) {
  test(`${scenario}: preserves exact writing, retries once, and allows a later intentional submission`, async () => {
    const first = deferred(), retried = deferred();
    let providerCalls = 0, saveCalls = 0;
    const ui = screen(() => {
      providerCalls++;
      if (providerCalls === 1) return first.promise;
      if (providerCalls === 2) return retried.promise;
      return Promise.resolve(fixture);
    }, async () => {
      saveCalls++;
      if (scenario === "save failure" && saveCalls === 1) throw Error("Save failed");
    });
    const draft = "  I noticed my breathing.\n\nI want to pause — and listen. " + "notice ".repeat(150) + "  ";
    ui.input().props.onChangeText(draft);
    ui.acknowledge();
    const submit = ui.button("Submit");
    submit.props.onPress();
    submit.props.onPress();
    await turn();
    assert.equal(providerCalls, 1);
    assert.equal(ui.draft, draft);
    assert.match(ui.text(), /Preparing your intentions/);

    if (scenario === "timeout") {
      await ui.advance(14_999);
      assert.match(ui.text(), /Preparing your intentions/);
      assert.equal(ui.draft, draft);
      await ui.advance(1);
      assert.match(ui.text(), /Request timed out/);
    } else {
      if (scenario === "provider failure") first.reject(Error("Provider unavailable"));
      else first.resolve(scenario === "invalid response" ? { intentions: [] } : fixture);
      await turn();
      assert.match(ui.text(), /Unable to load intentions/);
    }
    assert.equal(ui.draft, draft);
    assert.ok(ui.button("Back to writing"));
    assert.equal(ui.calls.length, 1);
    assert.equal(providerCalls, 1);
    await ui.advance(30_000);
    assert.equal(ui.calls.length, 1, "Failure must not launch an automatic retry");

    const retry = ui.button("Retry");
    for (let tap = 0; tap < 5; tap++) retry.props.onPress();
    await turn();
    assert.equal(ui.calls.length, 2);
    assert.equal(providerCalls, 2);
    assert.equal(ui.draft, draft);
    assert.equal(ui.calls[1].userReflection, draft.trim());
    assert.match(ui.text(), /Preparing your intentions/);
    retried.resolve(fixture);
    await turn();
    assertThreeReturnedIntentions(ui, fixture);
    assert.equal(ui.draft, draft);
    assert.deepEqual(ui.writingChanges, [draft], "Submission and recovery must never change the draft");

    ui.button("Back to writing").props.onPress();
    assert.equal(ui.input().props.value, draft);
    const updated = draft + "\nA new thought.";
    ui.input().props.onChangeText(updated);
    ui.button("Submit").props.onPress();
    await turn();
    assert.equal(ui.calls.length, 3);
    assert.equal(providerCalls, 3);
    assert.equal(ui.calls[2].userReflection, updated.trim());
    assert.equal(ui.draft, updated);
    assertThreeReturnedIntentions(ui, fixture);
  });
}

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
  await turn();
  assert.equal(ui.calls.length, 2);
  late.resolve(fixture);
  await turn();
  assert.match(ui.text(), /Preparing your intentions/);
  retried.resolve(fixture);
  await turn();
  assert.match(ui.text(), /Mock intentions/);
  ui.button("Back to writing").props.onPress();
  assert.equal(ui.input().props.value, originalDraft);
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
  assert.equal(ui.input().props.value, originalDraft);
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

test("intentions must be saved before opening gap reflection; failed saves can retry", async () => {
  const saving = deferred();
  const saved = [];
  const ui = screen(async () => fixture, async (user, activity, data) => {
    saved.push({ user, activity, data });
    if (saved.length === 1) await saving.promise;
  });
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  assert.match(ui.text(), /Preparing your intentions/);
  assert.equal(ui.button("Reflect on the AI gap"), undefined);
  saving.reject(new Error("Could not save intentions"));
  await turn();
  assert.ok(ui.button("Retry"));
  assert.equal(ui.button("Reflect on the AI gap"), undefined);
  ui.button("Retry").props.onPress();
  await turn();
  assert.ok(ui.button("Reflect on the AI gap"));
  assert.equal(saved[1].user, "user-a");
  assert.equal(saved[1].activity, "real-activity-id");
  assert.deepEqual(saved[1].data, fixture.intentions);
});

for (const scenario of ["timeout", "provider failure", "invalid response"]) {
  test(`${scenario} on a later submission never overwrites the intentions already saved`, async () => {
    const second = deferred();
    const later = { provider: "mock", intentions: [1, 2, 3].map(n => ({ title: `Later title ${n}`, explanation: `Later explanation ${n}` })) };
    const saved = [];
    let providerCalls = 0;
    const ui = screen(() => {
      providerCalls++;
      if (providerCalls === 1) return Promise.resolve(fixture);
      if (providerCalls === 2) return second.promise;
      return Promise.resolve(later);
    }, async (user, activity, data) => { saved.push(JSON.parse(JSON.stringify(data))); });

    ui.acknowledge();
    ui.button("Submit").props.onPress();
    await turn();
    assertThreeReturnedIntentions(ui, fixture);
    assert.deepEqual(saved, [fixture.intentions]);

    ui.button("Back to writing").props.onPress();
    const updated = originalDraft + "\nA new thought.";
    ui.input().props.onChangeText(updated);
    ui.button("Submit").props.onPress();
    await turn();
    assert.equal(providerCalls, 2);

    if (scenario === "timeout") {
      await ui.advance(15_000);
      assert.match(ui.text(), /Request timed out/);
    } else {
      if (scenario === "provider failure") second.reject(Error("Provider unavailable"));
      else second.resolve({ intentions: [] });
      await turn();
      assert.match(ui.text(), /Unable to load intentions/);
    }
    assert.deepEqual(saved, [fixture.intentions], "A failed request must not save anything");
    assert.equal(ui.draft, updated);

    // A late answer to the failed request must not be saved either.
    if (scenario === "timeout") {
      second.resolve(later);
      await turn();
      assert.deepEqual(saved, [fixture.intentions]);
    }
    await ui.advance(30_000);
    assert.equal(providerCalls, 2, "Failure must not launch an automatic retry");

    ui.button("Retry").props.onPress();
    await turn();
    assert.equal(providerCalls, 3);
    assertThreeReturnedIntentions(ui, later);
    assert.deepEqual(saved, [fixture.intentions, later.intentions]);
    assert.equal(ui.draft, updated);
    assert.deepEqual(ui.writingChanges, [updated], "Recovery must never change the draft");
  });
}

test("the Explore request carries only the activity, its context, and the writing: no breathing player state", async () => {
  const ui = screen(async () => fixture);
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(ui.calls.length, 1);
  assert.deepEqual(Object.keys(ui.calls[0]).sort(), ["activityContext", "activityId", "expectedMode", "userReflection"]);
  // Fields of PersistedBreathingSession, the state the timed Practice player keeps.
  const sent = JSON.stringify(ui.calls[0]);
  for (const field of ["startedAt", "accumulatedActiveMs", "savedAt", "completed", "elapsed", "paused", "running"]) {
    assert.ok(!sent.includes(field), `${field} must not be sent`);
  }
});

test("writing controls explain requirements and results have ordered accessible names", async () => {
  const ui = screen(async () => fixture);
  const input = ui.input();
  assert.equal(input.props.accessibilityLabel, "Your writing");
  assert.match(input.props.accessibilityHint, /150 words/);
  assert.match(ui.text(), /check the privacy acknowledgement/);
  const checkbox = ui.nodes().find(node => node.props.accessibilityRole === "checkbox");
  assert.match(checkbox.props.accessibilityHint, /Required/);
  assert.equal(checkbox.props["aria-checked"], false);
  assert.equal(checkbox.props.style.minHeight, 48);
  ui.acknowledge();
  assert.equal(ui.nodes().find(node => node.props.accessibilityRole === "checkbox").props["aria-checked"], true);
  assert.equal(ui.button("Submit").props.accessibilityLabel, "Submit writing");
  ui.button("Submit").props.onPress();
  await turn();
  const cards = ui.nodes().filter(node => node.props.accessibilityLabel?.startsWith("Intention "));
  assert.equal(cards.length, 3);
  cards.forEach((node, index) => {
    assert.equal(node.props.accessible, true);
    assert.ok(node.props.accessibilityLabel.includes(`${index + 1} of 3`));
    assert.ok(node.props.accessibilityLabel.includes(fixture.intentions[index].explanation));
  });
  assert.ok(ui.nodes().find(node => node.type === "Heading" && node.props.children === "Mock intentions"));
});


test("Explore submission requires 150 words and acknowledgement within the API character limit", async () => {
  const ui = screen(async () => fixture);
  ui.acknowledge();
  ui.input().props.onChangeText("notice ".repeat(149).trim());
  assert.equal(ui.button("Submit").props.disabled, true);
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(ui.calls.length, 0);
  assert.match(ui.text(), /at least 150 words/);
  ui.input().props.onChangeText("notice ".repeat(150).trim());
  assert.equal(ui.button("Submit").props.disabled, false);
  ui.input().props.onChangeText("reflection ".repeat(200).trim());
  assert.equal(ui.button("Submit").props.disabled, true);
  ui.input().props.onChangeText("notice ".repeat(150).trim());
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(ui.calls.length, 1);
  assertThreeReturnedIntentions(ui, fixture);
});

const PREWRITTEN_MODE = { status: "ready", refresh() {}, mode: { mode: "prewritten", available: true, contentVersion: "1.0.0", labels: { modeTitle: "Prewritten activity" } } };

test("prewritten mode drops the untrue AI acknowledgement and identifies itself before submission", () => {
  const ui = screen(undefined, undefined, PREWRITTEN_MODE);
  assert.equal(ui.nodes().some(node => node.props.accessibilityRole === "checkbox"), false);
  assert.doesNotMatch(ui.text(), /AI processing/);
  assert.equal(ui.nodes().filter(node => node.type === "ModeNotice").length, 1);
  assert.equal(ui.button("Submit").props.disabled, false);
});

for (const [name, mode] of [
  ["still loading", { status: "loading" }],
  ["unavailable", { status: "unavailable", message: "unavailable", retry() {} }],
  ["failed to load", { status: "error", message: "failed", retry() {} }],
]) {
  test(`writing stays editable but cannot be submitted while the mode is ${name}`, () => {
    const ui = screen(undefined, undefined, mode);
    ui.acknowledge();
    assert.equal(ui.button("Submit").props.disabled, true);
    assert.equal(ui.input().props.editable, true);
    assert.equal(ui.input().props.value, originalDraft);
  });
}

test("a crisis response shows support and saves nothing", async () => {
  let saved = 0;
  const ui = screen(async () => ({ kind: "support", message: "Support message", resources: [{ name: "988", contact: "Call or text 988" }] }), async () => { saved++; });
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  assert.match(ui.text(), /Support message/);
  assert.match(ui.text(), /988: Call or text 988/);
  assert.equal(saved, 0);
  assert.equal(ui.button("Continue"), undefined);
});

test("fixed content opens the choice screen and generates or saves no intentions", async () => {
  let saved = 0;
  const record = { kind: "prewritten", provider: "prewritten", contentVersion: "1.0.0", labels: {}, result: {} };
  const ui = screen(async () => record, async () => { saved++; }, PREWRITTEN_MODE);
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(ui.nodes().filter(node => node.type === "PrewrittenChoice").length, 1);
  assert.equal(saved, 0);
});

test("generated intentions from Claude say so, and test data says it is not AI", async () => {
  for (const [provider, pattern] of [["claude", /AI-generated with Claude/], ["mock", /Test data, not AI output/]]) {
    const ui = screen(async () => ({ provider, intentions: fixture.intentions }));
    ui.acknowledge();
    ui.button("Submit").props.onPress();
    await turn();
    assert.match(ui.text(), pattern);
  }
});

test("the request names the mode the student was told about", async () => {
  const ui = screen(async () => ({ provider: "mock", intentions: fixture.intentions }));
  ui.acknowledge();
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(ui.calls[0].expectedMode, "mock");
});

test("a changed mode refreshes the notice, requires a new acknowledgement, and keeps the writing", async () => {
  let refreshed = 0;
  const mode = { ...READY_MODE, refresh() { refreshed++; } };
  const failure = { code: "MODE_CHANGED", message: "This activity changed. Please review it and try again.", status: 409 };
  const ui = screen(undefined, undefined, mode, failure);
  ui.acknowledge();
  assert.equal(ui.button("Submit").props.disabled, false);
  ui.button("Submit").props.onPress();
  await turn();
  assert.equal(refreshed, 1);
  assert.match(ui.text(), /This activity changed/);
  assert.equal(ui.input().props.value, originalDraft);
  assert.equal(ui.nodes().filter(node => node.type === "ModeNotice").length, 1, "the current notice is shown");
  assert.equal(ui.button("Submit").props.disabled, true, "the old acknowledgement no longer counts");
  ui.acknowledge();
  assert.equal(ui.button("Submit").props.disabled, false);
});

test("an acknowledgement given under one mode does not carry over to another", () => {
  let mode = READY_MODE;
  const ui = screen(undefined, undefined, { get status() { return mode.status; }, get mode() { return mode.mode; }, refresh() {} });
  ui.acknowledge();
  assert.equal(ui.button("Submit").props.disabled, false);
  mode = { ...READY_MODE, mode: { ...READY_MODE.mode, mode: "claude" } };
  assert.equal(ui.button("Submit").props.disabled, true);
});
