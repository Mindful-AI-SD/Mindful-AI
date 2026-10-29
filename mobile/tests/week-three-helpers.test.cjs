const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const load = require("./helpers/load-week-three.cjs");
function setup() {
  const s = {
    id: "a",
    calls: [],
    data: {
      contractVersion: "sprint3-storage/v1",
      revision: 1,
      replayed: false,
    },
  };
  s.api = load({
    auth: {
      getSession: () => ({
        data: {
          session: s.id
            ? { user: { id: "a" }, access_token: "synthetic-a" }
            : null,
        },
        error: null,
      }),
      getUser: () => ({
        data: { user: s.id ? { id: s.id } : null },
        error: null,
      }),
    },
    rpc(name, args) {
      s.calls.push({ name, args });
      if (s.change) s.id = "b";
      if (s.throw) throw new Error("private diagnostic");
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
const input = () => ({
  slug: "synthetic-audit",
  operationId: randomUUID(),
  expectedRevision: 0,
  contentVersion: "synthetic/v1",
  patch: { events: [] },
});
test("draft write snapshots patch, includes contract version and pins session", async () => {
  const s = setup(), i = input();
  const promise = s.api.saveWeekThreeDraft(i);
  i.patch.events.push({ id: "late", at: "later", label: "Late" });
  await promise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(s.calls[0].args.p_request.patch)),
    { events: [] },
  );
  assert.equal(s.calls[0].name, "save_week_three_draft");
  assert.equal(s.header.value, "Bearer synthetic-a");
});
test("unknown owner/UUID/status properties and invalid revisions fail before network", async () => {
  const s = setup();
  for (
    const i of [
      { ...input(), user_id: "b" },
      { ...input(), activityId: "other" },
      { ...input(), patch: { status: "completed" } },
      { ...input(), expectedRevision: -1 },
      { ...input(), patch: {} },
      { ...input(), operationId: "bad" },
    ]
  ) {
    await assert.rejects(s.api.saveWeekThreeDraft(i), {
      code: "INVALID_INPUT",
    });
  }
  assert.equal(s.calls.length, 0);
});
test("signed out load and save fail without RPC", async () => {
  const s = setup();
  s.id = null;
  await assert.rejects(s.api.loadWeekThreeProgress("synthetic-audit"), {
    code: "AUTH_REQUIRED",
  });
  await assert.rejects(s.api.saveWeekThreeDraft(input()), {
    code: "AUTH_REQUIRED",
  });
  assert.equal(s.calls.length, 0);
});
test("missing row restores null and only slug is passed", async () => {
  const s = setup();
  s.data = null;
  assert.equal(await s.api.restoreWeekThreeResume("synthetic-audit"), null);
  assert.deepEqual(Object.keys(s.calls[0].args.p_request), ["slug"]);
});
test("paused state restored without adding elapsed background time", async () => {
  const s = setup();
  s.data = {
    contractVersion: "sprint3-storage/v1",
    revision: 2,
    events: [],
    resumeState: { elapsedActiveMs: 123, positionMs: 45, state: "paused" },
  };
  const r = await s.api.restoreWeekThreeResume("synthetic-audit");
  assert.equal(r.elapsedActiveMs, 123);
  assert.equal(r.state, "paused");
});
test("private diagnostics are mapped to controlled errors", async () => {
  const s = setup();
  s.error = { message: "private configuration secret" };
  await assert.rejects(s.api.saveWeekThreeDraft(input()), {
    code: "WEEK_THREE_UNAVAILABLE",
    message: "Could not access Week 3 progress. Please retry.",
  });
  s.throw = true;
  await assert.rejects(s.api.loadWeekThreeProgress("synthetic-audit"), {
    code: "WEEK_THREE_UNAVAILABLE",
  });
});
test("known prerequisite and revision errors retain controlled identity", async () => {
  const s = setup();
  for (
    const code of [
      "PREREQUISITE_NOT_MET",
      "STALE_REVISION",
      "WEEK_THREE_IMMUTABLE",
      "PREREQUISITE_CONFIGURATION_UNAVAILABLE",
    ]
  ) {
    s.error = { message: code };
    await assert.rejects(s.api.saveWeekThreeDraft(input()), { code });
  }
});
test("changed account and malformed server state are rejected", async () => {
  const s = setup();
  s.change = true;
  await assert.rejects(s.api.saveWeekThreeDraft(input()), {
    code: "ACCOUNT_CHANGED",
  });
  const b = setup();
  b.data = {
    contractVersion: "sprint3-storage/v1",
    revision: 1,
    events: [],
    resumeState: { state: "running" },
  };
  await assert.rejects(b.api.loadWeekThreeProgress("synthetic-audit"), {
    code: "WEEK_THREE_UNAVAILABLE",
  });
});
