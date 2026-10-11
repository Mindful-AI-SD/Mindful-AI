const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const environment = require("./helpers/load-ai-activity.cjs");

// Practice comes before Explore in every session. These tests attach the state
// a Practice player holds to Week 1 and Week 2 Explore requests and check that
// none of it leaves the app, and that the result is the same whatever Practice
// came first. Only the timed sample is a real shape; see the fixture.
function practicePlayerStates() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../../supabase/tests/fixtures/practicePlayerStates.ts"), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    { exports },
  );
  return JSON.parse(JSON.stringify(exports.practicePlayerStates));
}

const states = practicePlayerStates();
const common = { activityId: "550e8400-e29b-41d4-a716-446655440000", activityContext: "Explore lab" };
const sensations = ["tight shoulders", "a weird feeling in my chest", "fine"];
const kinds = {
  intention_mirror: {
    input: { reflection: "I noticed my breathing slow down." },
    response: {
      kind: "intention_mirror", provider: "mock",
      result: { intentions: [1, 2, 3].map(n => ({ title: `Title ${n}`, explanation: `Explanation ${n}` })) },
    },
  },
  sensation_lexicon: {
    input: { sensations },
    response: {
      kind: "sensation_lexicon", provider: "mock",
      result: { items: sensations.map((original, index) => ({
        original, isVague: index > 0, suggestions: index > 0 ? ["tingling", "steady"] : [],
      })) },
    },
  },
};
const plain = value => JSON.parse(JSON.stringify(value));

function client(kind) {
  const env = environment({ invoke: async () => ({ data: kinds[kind].response, error: null }) });
  return { ...env, service: env.load("ai-activity") };
}

test("the four Practice types each have a sample player state", () => {
  assert.deepEqual(Object.keys(states).sort(), ["audio", "timed", "unguided", "video"]);
});

test("the timed sample matches what the breathing player really persists", () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/breathing-session-storage.ts"), "utf8");
  const declared = source.slice(source.indexOf("export type PersistedBreathingSession"), source.indexOf("};"));
  for (const field of Object.keys(states.timed)) {
    assert.match(declared, new RegExp(`\\b${field}:`), `PersistedBreathingSession has no ${field}`);
  }
});

for (const [practice, playerState] of Object.entries(states)) {
  for (const [kind, sample] of Object.entries(kinds)) {
    const clean = { ...common, input: sample.input };
    const expectedBody = { kind, ...common, input: sample.input };

    test(`${kind} after ${practice} Practice: player state attached to the request never leaves the app`, async () => {
      const polluted = [
        { ...clean, ...playerState },
        { ...clean, playerState },
        { ...clean, practice: { type: practice, playerState } },
        { ...clean, input: { ...sample.input, ...playerState } },
        { ...clean, input: { ...sample.input, playerState } },
      ];
      for (const request of polluted) {
        const env = client(kind);
        const result = await env.service.getAiActivity(kind, request);
        assert.equal(result.error, null);
        assert.equal(env.calls.length, 1);
        assert.deepEqual(plain(env.calls[0].options.body), expectedBody);
        const sent = JSON.stringify(env.calls[0].options.body);
        for (const [field, value] of Object.entries(playerState)) {
          assert.ok(!sent.includes(`"${field}"`), `${field} was sent`);
          if (typeof value === "string" && value.length > 8) assert.ok(!sent.includes(value));
        }
      }
    });

    test(`${kind} after ${practice} Practice: the result is typed and identical to a request with no Practice state`, async () => {
      const baseline = await client(kind).service.getAiActivity(kind, clean);
      const afterPractice = await client(kind).service.getAiActivity(kind, { ...clean, playerState, ...playerState });
      assert.equal(afterPractice.error, null);
      assert.equal(afterPractice.data.outcome, "result");
      assert.equal(afterPractice.data.kind, kind);
      assert.equal(afterPractice.data.provider, "mock");
      assert.deepEqual(plain(afterPractice), plain(baseline));
    });

    test(`${kind} after ${practice} Practice: a failed request still retries cleanly without player state`, async () => {
      const responses = [
        async () => ({ data: null, error: { context: { status: 502 } } }),
        async () => ({ data: sample.response, error: null }),
      ];
      const env = environment({ invoke: () => responses.shift()() });
      const service = env.load("ai-activity");
      const request = { ...clean, playerState };
      assert.equal((await service.getAiActivity(kind, request)).error.code, "REQUEST_FAILED");
      assert.equal((await service.getAiActivity(kind, request)).error, null);
      for (const call of env.calls) assert.deepEqual(plain(call.options.body), expectedBody);
    });
  }
}

test("Week 2 wrapper after every Practice type: only the three sensations are sent", async () => {
  for (const playerState of Object.values(states)) {
    const env = environment({ invoke: async () => ({ data: kinds.sensation_lexicon.response, error: null }) });
    const service = env.load("sensation-lexicon");
    const result = await service.getSensationWords({ ...common, sensations, ...playerState, playerState });
    assert.equal(result.error, null);
    assert.equal(result.data.kind, "words");
    assert.deepEqual(plain(env.calls[0].options.body), { kind: "sensation_lexicon", ...common, input: { sensations } });
  }
});
