const assert = require("node:assert/strict");
const test = require("node:test");
const environment = require("./helpers/load-ai-activity.cjs");

// getSensationWords is a thin Week 2 wrapper over the general client; the
// contract, validation, timeout, and cancellation cases live in
// ai-activity.test.cjs.
const request = {
  activityId: "550e8400-e29b-41d4-a716-446655440000",
  activityContext: "Sensation Lexicon",
  sensations: ["  tight shoulders ", "a weird feeling in my chest", "fine"],
};
const trimmed = ["tight shoulders", "a weird feeling in my chest", "fine"];
const items = [
  { original: trimmed[0], isVague: false, suggestions: [] },
  { original: trimmed[1], isVague: true, suggestions: ["tingling", "buzzing"] },
  { original: trimmed[2], isVague: true, suggestions: ["loose", "steady"] },
];
const response = { kind: "sensation_lexicon", provider: "mock", result: { items } };
const support = {
  outcome: "support",
  message: "Help is available now.",
  resources: [{ name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988." }],
};
const plain = value => JSON.parse(JSON.stringify(value));

function service(invoke = async () => ({ data: response, error: null }), options = {}) {
  const env = environment({ invoke, ...options });
  return { ...env, service: env.load("sensation-lexicon") };
}

test("sends the three sensations as a sensation_lexicon activity and returns the words", async () => {
  const env = service();
  const result = await env.service.getSensationWords(request);
  assert.equal(result.error, null);
  assert.deepEqual(plain(result.data), { kind: "words", items, provider: "mock" });
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].name, "ai-activity");
  assert.deepEqual(plain(env.calls[0].options.body), {
    kind: "sensation_lexicon",
    activityId: request.activityId,
    activityContext: request.activityContext,
    input: { sensations: trimmed },
  });
});

test("crisis support response is returned as support, with no words", async () => {
  const result = await service(async () => ({ data: support, error: null })).service.getSensationWords(request);
  assert.equal(result.error, null);
  assert.deepEqual(plain(result.data), { kind: "support", message: support.message, resources: support.resources });
  assert.equal("items" in result.data, false);
});

test("errors from the general client pass through unchanged", async () => {
  const signedOut = await service(undefined, { session: null }).service.getSensationWords(request);
  assert.equal(signedOut.data, null);
  assert.equal(signedOut.error.code, "AUTH_REQUIRED");

  const failed = await service(async () => ({ data: null, error: { context: { status: 502 } } })).service.getSensationWords(request);
  assert.equal(failed.error.code, "REQUEST_FAILED");
  assert.equal(failed.error.status, 502);

  const malformed = await service(async () => ({ data: { items, provider: "mock" }, error: null })).service.getSensationWords(request);
  assert.equal(malformed.error.code, "INVALID_RESPONSE");
});

test("options reach the general client", async () => {
  const env = service();
  const seen = [];
  const result = await env.service.getSensationWords(request, {
    transport: async (body) => { seen.push(body); return response; },
  });
  assert.equal(result.error, null);
  assert.equal(seen.length, 1);
  assert.equal(env.calls.length, 0);

  const controller = new AbortController();
  controller.abort();
  assert.equal((await env.service.getSensationWords(request, { signal: controller.signal })).error.code, "CANCELLED");
});
