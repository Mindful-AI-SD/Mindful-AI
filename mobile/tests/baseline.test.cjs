const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const load = require("./helpers/load-baseline.cjs");
const input = () => ({
  operationId: randomUUID(),
  expectedRevision: 0,
  definitionId: "synthetic",
  definitionVersion: 1,
  answers: { q1: "example" },
});
function setup() {
  const s = {
    user: "a",
    calls: [],
    data: null,
    error: null,
    thrown: false,
    switchUser: false,
  };
  s.api = load({
    auth: {
      getSession: () => ({
        data: {
          session: s.user
            ? {
              user: { id: s.user },
              access_token: "synthetic-token-" + s.user,
            }
            : null,
        },
        error: null,
      }),
      getUser: (token) => ({
        data: {
          user: (token || s.user)
            ? { id: token ? token.replace("synthetic-token-", "") : s.user }
            : null,
        },
        error: null,
      }),
    },
    rpc: (name, args) => {
      s.calls.push({ name, args });
      if (s.thrown) throw new Error("private stack / configuration");
      if (s.switchUser) s.user = "b";
      return {
        setHeader(key, value) {
          s.header = { key, value };
          return { data: s.data, error: s.error };
        },
      };
    },
  });
  return s;
}
test("load uses authenticated owner with no client ID parameter", async () => {
  const s = setup();
  assert.equal(await s.api.loadBaseline(), null);
  assert.equal(s.calls[0].name, "load_baseline");
  assert.deepEqual(Object.keys(s.calls[0].args), []);
});
test("signed-out reads and writes fail without RPCs", async () => {
  const s = setup();
  s.user = null;
  for (
    const call of [
      () => s.api.loadBaseline(),
      () => s.api.loadOriginalBaseline(),
      () => s.api.saveBaselineDraft(input()),
      () => s.api.submitBaseline(input()),
    ]
  ) {
    await assert.rejects(call, (error) => error.code === "AUTH_REQUIRED");
  }
  assert.equal(s.calls.length, 0);
});
test("write whitelist rejects forged identity and malformed input", async () => {
  const s = setup();
  for (
    const extra of [
      { user_id: "b" },
      { userId: "b" },
      { status: "submitted" },
      { submittedAt: "now" },
      { expectedRevision: -1 },
      { expectedRevision: 0.5 },
      { definitionVersion: 0 },
      { answers: { q1: 3 } },
      { operationId: "bad" },
    ]
  ) {
    await assert.rejects(
      () => s.api.saveBaselineDraft({ ...input(), ...extra }),
      (error) => error.code === "INVALID_INPUT",
    );
  }
  assert.equal(s.calls.length, 0);
});
test("safe conflicts are typed while database diagnostics are hidden", async () => {
  const s = setup();
  for (
    const code of [
      "STALE_REVISION",
      "OPERATION_CONFLICT",
      "BASELINE_IMMUTABLE",
      "DEFINITION_CONFLICT",
    ]
  ) {
    s.error = { message: code };
    await assert.rejects(
      () => s.api.submitBaseline(input()),
      (error) => error.code === code,
    );
  }
  s.error = { message: "private answer / password / internal stack" };
  await assert.rejects(
    () => s.api.loadBaseline(),
    (error) =>
      error.code === "BASELINE_UNAVAILABLE" &&
      !/private|password|stack/.test(error.message),
  );
  s.thrown = true;
  await assert.rejects(
    () => s.api.loadBaseline(),
    (error) => error.code === "BASELINE_UNAVAILABLE",
  );
});
test("write snapshots caller answers before auth awaits", async () => {
  const s = setup();
  s.data = {
    contractVersion: "sprint3-storage/v1",
    outcome: "draft_saved",
    revision: 1,
    submittedAt: null,
    replayed: false,
  };
  const value = input();
  const pending = s.api.saveBaselineDraft(value);
  value.answers.q1 = "later edit";
  await pending;
  assert.equal(s.calls[0].args.p_request.answers.q1, "example");
  assert.equal(s.calls[0].args.p_request.contractVersion, "sprint3-storage/v1");
});
test("account change prevents delivery of old-account data", async () => {
  const s = setup();
  s.switchUser = true;
  await assert.rejects(
    () => s.api.loadBaseline(),
    (error) => error.code === "ACCOUNT_CHANGED",
  );
});
test("malformed server data is rejected without returning diagnostics", async () => {
  const s = setup();
  s.data = { private: "diagnostic" };
  await assert.rejects(
    () => s.api.loadBaseline(),
    (error) => error.code === "BASELINE_UNAVAILABLE",
  );
  await assert.rejects(
    () => s.api.loadOriginalBaseline(),
    (error) => error.code === "BASELINE_UNAVAILABLE",
  );
  await assert.rejects(
    () => s.api.submitBaseline(input()),
    (error) => error.code === "BASELINE_UNAVAILABLE",
  );
});

test("request token remains bound to verified owner during a dispatch account switch", async () => {
  const s = setup();
  s.switchUser = true;
  s.data = {
    contractVersion: "sprint3-storage/v1",
    outcome: "draft_saved",
    revision: 1,
    submittedAt: null,
    replayed: false,
  };
  await assert.rejects(
    () => s.api.saveBaselineDraft(input()),
    (error) => error.code === "ACCOUNT_CHANGED",
  );
  assert.equal(s.header.key, "Authorization");
  assert.equal(s.header.value, "Bearer synthetic-token-a");
  assert.equal(s.user, "b");
});

test("shared capture adapter keeps void-write contract and controlled form errors", async () => {
  const s = setup();
  s.data = {
    contractVersion: "sprint3-storage/v1",
    outcome: "draft_saved",
    revision: 1,
    submittedAt: null,
    replayed: false,
  };
  assert.equal(
    await s.api.baselineService.saveBaselineDraft(input()),
    undefined,
  );
  s.error = { message: "STALE_REVISION" };
  await assert.rejects(
    () => s.api.baselineService.submitBaseline(input()),
    (error) => error.code === "STALE_REVISION",
  );
  s.user = null;
  await assert.rejects(
    () => s.api.baselineService.loadBaseline(),
    (error) => error.code === "UNAVAILABLE" && /Sign in/.test(error.message),
  );
});
