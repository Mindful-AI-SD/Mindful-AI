const assert = require("node:assert/strict");
const test = require("node:test");
const environment = require("./helpers/load-ai-activity.cjs");

// Failure recovery for the general AI activity client, for Week 1 and Week 2:
// what the student wrote must survive a failed request untouched, a retry
// must be safe, and a late answer must never replace a newer one.
const { turn } = environment;
const common = { activityId: "550e8400-e29b-41d4-a716-446655440000", activityContext: "Explore lab" };
const sensations = ["tight shoulders", "a weird feeling in my chest", "fine"];
const reflection = "I noticed my breathing slow down.";
const kinds = {
  sensation_lexicon: {
    input: () => ({ sensations: ["  tight shoulders ", sensations[1], sensations[2]] }),
    response: provider => ({
      kind: "sensation_lexicon", provider,
      result: { items: sensations.map((original, index) => ({
        original, isVague: index > 0, suggestions: index > 0 ? ["tingling", "steady"] : [],
      })) },
    }),
  },
  intention_mirror: {
    input: () => ({ reflection: `  ${reflection}\n` }),
    response: provider => ({
      kind: "intention_mirror", provider,
      result: { intentions: [1, 2, 3].map(n => ({ title: `Title ${n}`, explanation: `Explanation ${n}` })) },
    }),
  },
};
const plain = value => JSON.parse(JSON.stringify(value));
const http = status => ({ data: null, error: { name: "FunctionsHttpError", message: "private-diagnostic", context: { status } } });
const offline = { data: null, error: { name: "FunctionsFetchError", message: "private-diagnostic", context: new Error("offline") } };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function deepFreeze(value) {
  if (value && typeof value === "object") Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

// A frozen request stands in for the student's saved input: any attempt by the
// client to change it would throw.
function savedRequest(kind) {
  const request = { ...common, input: kinds[kind].input() };
  return { request: deepFreeze(request), snapshot: plain(request) };
}

function client(responses) {
  const env = environment({ invoke: () => responses.shift()() });
  return { ...env, service: env.load("ai-activity") };
}

for (const kind of Object.keys(kinds)) {
  const good = kinds[kind].response("mock");
  const failures = {
    "provider failure (502)": [async () => http(502), "REQUEST_FAILED"],
    "server timeout (408)": [async () => http(408), "TIMEOUT"],
    "provider not configured (501)": [async () => http(501), "REQUEST_FAILED"],
    "no connection": [async () => offline, "NETWORK_ERROR"],
    "malformed response": [async () => ({ data: { ...good, result: {} }, error: null }), "INVALID_RESPONSE"],
    "thrown error": [() => { throw Error("private-diagnostic"); }, "REQUEST_FAILED"],
  };

  for (const [name, [fail, code]] of Object.entries(failures)) {
    test(`${kind}: ${name} leaves the saved input untouched and the same request retries successfully`, async () => {
      const { request, snapshot } = savedRequest(kind);
      const env = client([fail, async () => ({ data: good, error: null })]);

      const failed = await env.service.getAiActivity(kind, request);
      assert.equal(failed.data, null);
      assert.equal(failed.error.code, code);
      assert.deepEqual(request, snapshot);
      assert.equal(env.calls.length, 1);

      const retried = await env.service.getAiActivity(kind, request);
      assert.equal(retried.error, null);
      assert.deepEqual(plain(retried.data), { outcome: "result", ...good });
      assert.deepEqual(request, snapshot);
      assert.equal(env.calls.length, 2);
      assert.deepEqual(plain(env.calls[1].options.body), plain(env.calls[0].options.body));
      assert.equal(env.timers.size, 0);
    });
  }

  test(`${kind}: a client timeout leaves the saved input untouched and the same request retries successfully`, async () => {
    const { request, snapshot } = savedRequest(kind);
    const env = client([() => new Promise(() => {}), async () => ({ data: good, error: null })]);

    const pending = env.service.getAiActivity(kind, request);
    await turn();
    await env.advance(15_000);
    assert.equal((await pending).error.code, "TIMEOUT");
    assert.deepEqual(request, snapshot);

    const retried = await env.service.getAiActivity(kind, request);
    assert.deepEqual(plain(retried.data), { outcome: "result", ...good });
    assert.deepEqual(request, snapshot);
    assert.equal(env.timers.size, 0);
  });

  test(`${kind}: a failure never triggers an automatic retry`, async () => {
    const { request } = savedRequest(kind);
    const env = client([async () => http(502), async () => ({ data: good, error: null })]);
    await env.service.getAiActivity(kind, request);
    await env.advance(120_000);
    assert.equal(env.calls.length, 1);
    assert.equal(env.timers.size, 0);
  });

  test(`${kind}: a late answer to a timed-out request cannot replace the retry's result`, async () => {
    const { request } = savedRequest(kind);
    const late = deferred(), retry = deferred();
    const env = client([() => late.promise, () => retry.promise]);

    const first = env.service.getAiActivity(kind, request);
    await turn();
    await env.advance(15_000);
    const timedOut = await first;
    assert.equal(timedOut.error.code, "TIMEOUT");

    const second = env.service.getAiActivity(kind, request);
    await turn();
    late.resolve({ data: kinds[kind].response("late-result"), error: null });
    await turn();
    retry.resolve({ data: good, error: null });
    const retried = await second;

    assert.equal(retried.data.provider, "mock");
    assert.deepEqual(plain(retried.data), { outcome: "result", ...good });
    assert.equal(timedOut.data, null);
    assert.equal(timedOut.error.code, "TIMEOUT");
    assert.equal(env.timers.size, 0);
  });

  test(`${kind}: a failed request does not change an earlier valid result`, async () => {
    const { request } = savedRequest(kind);
    const env = client([
      async () => ({ data: good, error: null }),
      async () => http(502),
      () => new Promise(() => {}),
      async () => ({ data: { ...good, result: {} }, error: null }),
    ]);

    const earlier = await env.service.getAiActivity(kind, request);
    const snapshot = plain(earlier);
    assert.equal(earlier.error, null);

    assert.equal((await env.service.getAiActivity(kind, request)).error.code, "REQUEST_FAILED");
    const pending = env.service.getAiActivity(kind, request);
    await turn();
    await env.advance(15_000);
    assert.equal((await pending).error.code, "TIMEOUT");
    assert.equal((await env.service.getAiActivity(kind, request)).error.code, "INVALID_RESPONSE");

    assert.deepEqual(plain(earlier), snapshot);
  });

  test(`${kind}: cancelling a failed attempt does not cancel the retry`, async () => {
    const { request, snapshot } = savedRequest(kind);
    const env = client([() => new Promise(() => {}), async () => ({ data: good, error: null })]);
    const controller = new AbortController();

    const first = env.service.getAiActivity(kind, request, { signal: controller.signal });
    await turn();
    controller.abort();
    assert.equal((await first).error.code, "CANCELLED");

    const retried = await env.service.getAiActivity(kind, request);
    assert.equal(retried.error, null);
    assert.equal(env.calls[0].options.signal.aborted, true);
    assert.notEqual(env.calls[0].options.signal, env.calls[1].options.signal);
    assert.deepEqual(request, snapshot);
  });

  test(`${kind}: after signing in again, the same request succeeds`, async () => {
    const { request, snapshot } = savedRequest(kind);
    let session = null;
    const env = environment({ invoke: async () => ({ data: good, error: null }) });
    const service = env.load("ai-activity");
    const transport = async (body, signal) => {
      if (!session) throw new service.AiActivityTransportError(401);
      return service.requestAiActivity(body, signal);
    };

    assert.equal((await service.getAiActivity(kind, request, { transport })).error.code, "AUTH_REQUIRED");
    assert.equal(env.calls.length, 0);
    session = { access_token: "token" };
    const retried = await service.getAiActivity(kind, request, { transport });
    assert.equal(retried.error, null);
    assert.equal(env.calls.length, 1);
    assert.deepEqual(request, snapshot);
  });

  test(`${kind}: errors never carry what the student wrote`, async () => {
    const { request } = savedRequest(kind);
    for (const [fail] of Object.values(failures)) {
      const result = await client([fail]).service.getAiActivity(kind, request);
      const text = JSON.stringify(result);
      for (const typed of [...sensations, reflection, "private-diagnostic"]) {
        assert.ok(!text.includes(typed));
      }
    }
  });
}

test("Week 2 wrapper: a failed request leaves the three sensations untouched and retries successfully", async () => {
  const good = kinds.sensation_lexicon.response("mock");
  const request = deepFreeze({ ...common, sensations: kinds.sensation_lexicon.input().sensations });
  const snapshot = plain(request);
  const responses = [async () => http(502), async () => ({ data: good, error: null })];
  const env = environment({ invoke: () => responses.shift()() });
  const service = env.load("sensation-lexicon");

  const failed = await service.getSensationWords(request);
  assert.equal(failed.error.code, "REQUEST_FAILED");
  assert.deepEqual(request, snapshot);

  const retried = await service.getSensationWords(request);
  assert.equal(retried.error, null);
  assert.equal(retried.data.kind, "words");
  assert.deepEqual(plain(retried.data.items), good.result.items);
  assert.deepEqual(request, snapshot);
  assert.equal(env.calls.length, 2);
});
