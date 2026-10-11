const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const environment = require("./helpers/load-ai-activity.cjs");

const { turn } = environment;
const common = { activityId: "550e8400-e29b-41d4-a716-446655440000", activityContext: "Explore lab" };
const trimmed = ["tight shoulders", "a weird feeling in my chest", "fine"];
const items = [
  { original: trimmed[0], isVague: false, suggestions: [] },
  { original: trimmed[1], isVague: true, suggestions: ["tingling", "buzzing"] },
  { original: trimmed[2], isVague: true, suggestions: ["loose", "steady"] },
];
const intentions = [1, 2, 3].map(n => ({ title: `Title ${n}`, explanation: `Explanation ${n}` }));
const kinds = {
  sensation_lexicon: {
    request: { ...common, input: { sensations: ["  tight shoulders ", trimmed[1], trimmed[2]] } },
    sent: { sensations: trimmed },
    response: { kind: "sensation_lexicon", provider: "mock", result: { items } },
  },
  intention_mirror: {
    request: { ...common, input: { reflection: "  I noticed my breathing slow down.  " } },
    sent: { reflection: "I noticed my breathing slow down." },
    response: { kind: "intention_mirror", provider: "mock", result: { intentions } },
  },
};
const support = {
  outcome: "support",
  message: "Help is available now.",
  resources: [
    { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988." },
    { name: "UCF Counseling and Psychological Services (CAPS)", contact: "Call 407-823-2811." },
  ],
};
const plain = value => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function client(kind, options = {}) {
  const env = environment({
    invoke: async () => ({ data: kinds[kind].response, error: null }),
    ...options,
  });
  return { ...env, service: env.load("ai-activity") };
}

for (const [kind, sample] of Object.entries(kinds)) {
  test(`${kind}: signed-in request uses the one authenticated contract and returns its typed result`, async () => {
    const env = client(kind);
    const result = await env.service.getAiActivity(kind, sample.request);
    assert.equal(result.error, null);
    assert.deepEqual(plain(result.data), { outcome: "result", ...sample.response });
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].name, "ai-activity");
    assert.deepEqual(plain(env.calls[0].options.body), { kind, ...common, input: sample.sent });
    assert.ok(env.calls[0].options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(env.calls[0].options).sort(), ["body", "signal"]);
    assert.equal(env.timers.size, 0);
  });

  test(`${kind}: signed-out or failed session returns AUTH_REQUIRED without calling the endpoint`, async () => {
    for (const options of [{ session: null }, { sessionError: new Error("session lookup failed") }]) {
      const env = client(kind, options);
      const result = await env.service.getAiActivity(kind, sample.request);
      assert.equal(result.data, null);
      assert.equal(result.error.code, "AUTH_REQUIRED");
      assert.equal(env.calls.length, 0);
    }
  });

  test(`${kind}: crisis support response is returned as support, not as a result or an error`, async () => {
    const env = client(kind, { invoke: async () => ({ data: support, error: null }) });
    const result = await env.service.getAiActivity(kind, sample.request);
    assert.equal(result.error, null);
    assert.deepEqual(plain(result.data), support);
    assert.equal("result" in result.data, false);
  });

  test(`${kind}: a response for another kind is INVALID_RESPONSE`, async () => {
    const other = kinds[kind === "intention_mirror" ? "sensation_lexicon" : "intention_mirror"].response;
    for (const data of [other, { ...sample.response, kind: other.kind }, { ...other, kind }]) {
      const env = client(kind, { invoke: async () => ({ data, error: null }) });
      const result = await env.service.getAiActivity(kind, sample.request);
      assert.equal(result.data, null);
      assert.equal(result.error.code, "INVALID_RESPONSE");
    }
  });
}

test("endpoint failures map to stable codes and never expose server text", async () => {
  const cases = [
    [400, "INVALID_INPUT"], [401, "AUTH_REQUIRED"], [404, "REQUEST_FAILED"],
    [408, "TIMEOUT"], [501, "REQUEST_FAILED"], [502, "REQUEST_FAILED"], [503, "REQUEST_FAILED"],
  ];
  for (const [status, code] of cases) {
    const env = client("sensation_lexicon", {
      invoke: async () => ({ data: null, error: { name: "FunctionsHttpError", message: "private-diagnostic", context: { status } } }),
    });
    const result = await env.service.getAiActivity("sensation_lexicon", kinds.sensation_lexicon.request);
    assert.equal(result.data, null);
    assert.equal(result.error.code, code);
    assert.equal(result.error.status, status);
    assert.ok(!JSON.stringify(result).includes("private-diagnostic"));
  }
});

test("a request that never reaches the server is a NETWORK_ERROR", async () => {
  const env = client("intention_mirror", {
    invoke: async () => ({ data: null, error: { name: "FunctionsFetchError", message: "private-diagnostic", context: new Error("offline") } }),
  });
  const result = await env.service.getAiActivity("intention_mirror", kinds.intention_mirror.request);
  assert.equal(result.error.code, "NETWORK_ERROR");
  assert.equal(result.error.status, null);
  assert.ok(!JSON.stringify(result).includes("private-diagnostic"));
});

test("transport rejections and thrown errors are recoverable and keep student text out of errors", async () => {
  const { service } = client("sensation_lexicon");
  const { request } = kinds.sensation_lexicon;
  for (const transport of [async () => { throw Error("provider down: tight shoulders"); }, () => { throw Error("failed"); }]) {
    const result = await service.getAiActivity("sensation_lexicon", request, { transport });
    assert.equal(result.error.code, "REQUEST_FAILED");
    assert.ok(!JSON.stringify(result).includes("tight shoulders"));
  }
  const result = await service.getAiActivity("sensation_lexicon", request, {
    transport: async () => { throw new service.AiActivityTransportError(502); },
  });
  assert.equal(result.error.code, "REQUEST_FAILED");
  assert.equal(result.error.status, 502);
});

test("malformed responses are INVALID_RESPONSE, never shown as a result", async () => {
  const { service } = client("sensation_lexicon");
  const lexicon = kinds.sensation_lexicon.response, mirror = kinds.intention_mirror.response;
  const withItems = value => ({ ...lexicon, result: { items: value } });
  const item = (index, changes) => withItems(items.map((value, i) => i === index ? { ...value, ...changes } : value));
  const withIntentions = value => ({ ...mirror, result: { intentions: value } });
  const malformed = {
    sensation_lexicon: [
      null, "words", [], {},
      { items, provider: "mock" },
      { kind: lexicon.kind, result: lexicon.result },
      { kind: lexicon.kind, provider: "mock" },
      { ...lexicon, provider: " " },
      { ...lexicon, extra: true },
      { ...lexicon, result: { items, intentions } },
      { ...lexicon, result: [] },
      withItems(items.slice(0, 2)),
      withItems([...items, items[0]]),
      withItems(["a", "b", "c"]),
      withItems([items[2], items[1], items[0]]),
      item(0, { original: "tense shoulders" }),
      item(0, { suggestions: ["stiff"] }),
      item(1, { suggestions: [] }),
      item(1, { isVague: "yes" }),
      item(1, { suggestions: "tingling" }),
      item(1, { suggestions: ["a", "b", "c", "d", "e", "f"] }),
      item(1, { suggestions: [" "] }),
      item(1, { suggestions: ["x".repeat(41)] }),
      item(1, { suggestions: ["tingling", "Tingling"] }),
      item(2, { suggestions: ["Fine"] }),
      item(1, { cause: "poor sleep" }),
      { ...support, outcome: "ok" },
      { ...support, message: "" },
      { ...support, resources: [] },
      { ...support, resources: [{ name: "988" }] },
      { ...support, result: lexicon.result },
      { ...lexicon, outcome: "support" },
    ],
    intention_mirror: [
      { intentions, provider: "mock" },
      withIntentions(intentions.slice(0, 2)),
      withIntentions([...intentions, intentions[0]]),
      withIntentions(["a", "b", "c"]),
      withIntentions([{ title: "", explanation: "x" }, ...intentions.slice(1)]),
      withIntentions([{ title: "x".repeat(121), explanation: "x" }, ...intentions.slice(1)]),
      withIntentions([{ title: "x", explanation: "x".repeat(1001) }, ...intentions.slice(1)]),
      withIntentions([{ title: "x" }, ...intentions.slice(1)]),
      withIntentions([{ ...intentions[0], diagnosis: "x" }, ...intentions.slice(1)]),
      { ...mirror, result: { intentions, extra: true } },
    ],
  };
  for (const [kind, values] of Object.entries(malformed)) {
    for (const data of values) {
      const result = await service.getAiActivity(kind, kinds[kind].request, { transport: async () => data });
      assert.equal(result.data, null, JSON.stringify(data));
      assert.equal(result.error.code, "INVALID_RESPONSE", JSON.stringify(data));
    }
  }
});

test("timeout aborts the request and ignores a late successful response", async () => {
  const late = deferred();
  const env = client("intention_mirror", { invoke: () => late.promise });
  const pending = env.service.getAiActivity("intention_mirror", kinds.intention_mirror.request);
  await turn();
  await env.advance(14_999);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].options.signal.aborted, false);
  await env.advance(1);
  const result = await pending;
  assert.equal(result.error.code, "TIMEOUT");
  assert.equal(env.calls[0].options.signal.aborted, true);
  late.resolve({ data: kinds.intention_mirror.response, error: null });
  await turn();
  assert.equal(result.error.code, "TIMEOUT");
  assert.equal(env.timers.size, 0);
});

test("a custom timeout is honored", async () => {
  const env = client("sensation_lexicon", { invoke: () => new Promise(() => {}) });
  const pending = env.service.getAiActivity("sensation_lexicon", kinds.sensation_lexicon.request, { timeoutMs: 2_000 });
  await turn();
  await env.advance(2_000);
  assert.equal((await pending).error.code, "TIMEOUT");
});

test("cancellation stops the request, clears timers, and skips the endpoint when already cancelled", async () => {
  const { request } = kinds.sensation_lexicon;
  const env = client("sensation_lexicon", { invoke: () => new Promise(() => {}) });
  const controller = new AbortController();
  const pending = env.service.getAiActivity("sensation_lexicon", request, { signal: controller.signal });
  await turn();
  controller.abort();
  assert.equal((await pending).error.code, "CANCELLED");
  assert.equal(env.calls[0].options.signal.aborted, true);
  assert.equal(env.timers.size, 0);

  const before = client("sensation_lexicon");
  const aborted = new AbortController();
  aborted.abort();
  assert.equal((await before.service.getAiActivity("sensation_lexicon", request, { signal: aborted.signal })).error.code, "CANCELLED");
  await turn();
  assert.equal(before.calls.length, 0);
});

test("the client holds no provider key, model SDK, or server-only import", () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/ai-activity.ts"), "utf8");
  assert.deepEqual([...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]), ["./intention", "./supabase"]);
  assert.match(source, /import type \{ Intention \} from "\.\/intention"/);
  assert.doesNotMatch(source, /process\.env|api[_-]?key|service[_-]?role|sb_secret_|Authorization/i);
});
