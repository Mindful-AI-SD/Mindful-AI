const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./helpers/load-activity-lookup.cjs");
function setup() {
  const s = {
    id: "a",
    calls: [],
    error: null,
    row: {
      slug: "synthetic-audit",
      activityId: "00000000-0000-4000-8000-000000000001",
      weekId: 3,
      weekNumber: 3,
    },
  };
  s.api = load({
    auth: {
      getSession: () => ({
        data: {
          session: s.id
            ? { user: { id: "a" }, access_token: "synthetic" }
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
      if (s.throw) throw new Error("private diagnostic stack");
      return {
        setHeader(key, value) {
          s.header = { key, value };
          return { data: s.row, error: s.error };
        },
      };
    },
  });
  return s;
}
const input = { slug: "synthetic-audit", expectedWeek: 3 };
test("canonical lookup passes only slug/week and pins the verified token", async () => {
  const s = setup();
  assert.equal(
    (await s.api.resolveActivity(input)).activityId,
    s.row.activityId,
  );
  assert.equal(s.calls[0].name, "resolve_curriculum_activity");
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0].args)), {
    p_request: input,
  });
  assert.equal(s.header.value, "Bearer synthetic");
});
test("invalid input and arbitrary UUID/owner fields are rejected before lookup", async () => {
  const s = setup();
  for (
    const value of [
      null,
      {},
      { ...input, slug: "" },
      { ...input, slug: "Bad Slug" },
      { ...input, expectedWeek: 9 },
      { ...input, user_id: "b" },
      { ...input, activityId: "b" },
    ]
  ) {
    await assert.rejects(s.api.resolveActivity(value), {
      code: "INVALID_INPUT",
    });
  }
  assert.equal(s.calls.length, 0);
});
test("signed out lookup fails", async () => {
  const s = setup();
  s.id = null;
  await assert.rejects(s.api.resolveActivity(input), { code: "AUTH_REQUIRED" });
  assert.equal(s.calls.length, 0);
});
test("account change suppresses returned result", async () => {
  const s = setup();
  s.change = true;
  await assert.rejects(s.api.resolveActivity(input), {
    code: "ACCOUNT_CHANGED",
  });
});
test("private query diagnostics never escape", async () => {
  const s = setup();
  s.error = { message: "private configuration stack" };
  await assert.rejects(s.api.resolveActivity(input), {
    code: "ACTIVITY_LOOKUP_UNAVAILABLE",
    message: "Could not load this activity. Please retry.",
  });
  s.throw = true;
  await assert.rejects(s.api.resolveActivity(input), {
    code: "ACTIVITY_LOOKUP_UNAVAILABLE",
  });
});
test("wrong canonical week/id/slug fail closed", async () => {
  for (
    const patch of [
      { weekNumber: 2 },
      { activityId: "bad" },
      { slug: "other" },
      { weekId: -1 },
    ]
  ) {
    const s = setup();
    Object.assign(s.row, patch);
    await assert.rejects(s.api.resolveActivity(input), {
      code: "ACTIVITY_LOOKUP_UNAVAILABLE",
    });
  }
});
