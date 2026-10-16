const assert = require("node:assert/strict");
const test = require("node:test");
const load = require("./helpers/load-beat-progress.cjs");

function setup({ owners = ["a"], error = null } = {}) {
  let calls = 0, queries = 0;
  const row = {
    user_id: "a",
    week_id: 1,
    beat_id: "arrive",
    status: "in_progress",
    answers: { private: "draft" },
    saved_data: {},
    resume_state: { screen: 2 },
  };
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    upsert() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error });
    },
    single() {
      return Promise.resolve({ data: row, error });
    },
    then(resolve) {
      return Promise.resolve({ data: [row], error }).then(resolve);
    },
  };
  const supabase = {
    auth: {
      getUser() {
        const id = owners[Math.min(calls++, owners.length - 1)];
        return Promise.resolve({
          data: { user: id ? { id } : null },
          error: null,
        });
      },
    },
    from() {
      queries++;
      return query;
    },
  };
  return {
    api: load(supabase).beats,
    get queries() {
      return queries;
    },
  };
}

test("account changes during reads never return the previous owner's private state", async () => {
  for (
    const name of [
      "loadBeatProgress",
      "listWeekBeatProgress",
      "restoreBeatResumeState",
    ]
  ) {
    const db = setup({ owners: ["a", "b"] });
    await assert.rejects(db.api[name](1, "arrive"), /account changed/);
  }
});

test("account change before saving prevents a write; after saving never returns old-account data", async () => {
  const before = setup({ owners: ["a", "b"] });
  await assert.rejects(
    before.api.upsertBeatProgress(1, "arrive", {}),
    /account changed/,
  );
  assert.equal(before.queries, 0);
  const after = setup({ owners: ["a", "a", "b"] });
  await assert.rejects(
    after.api.upsertBeatProgress(1, "arrive", {}),
    /account changed/,
  );
  assert.equal(after.queries, 1);
});

test("invalid identities and non-JSON/cyclic payloads cannot reach the database", async () => {
  const db = setup();
  for (const week of [0, -1, 1.2, "1", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(db.api.loadBeatProgress(week, "arrive"), /week ID/);
  }
  for (const beat of [undefined, null, "reflection", "week_two_arrive"]) {
    await assert.rejects(db.api.upsertBeatProgress(1, beat, {}), /beat ID/);
    await assert.rejects(db.api.loadBeatProgress(1, beat), /beat ID/);
  }
  const cycle = {};
  cycle.self = cycle;
  for (
    const value of [
      cycle,
      new Date(),
      { missing: undefined },
      { number: NaN },
      { number: Infinity },
      { bigint: 1n },
      { fn() {} },
    ]
  ) {
    await assert.rejects(
      db.api.upsertBeatProgress(1, "arrive", { saved_data: value }),
      /JSON objects/,
    );
  }
  assert.equal(db.queries, 0);
});

test("backend diagnostics never appear in helper errors", async () => {
  const db = setup({
    error: { message: "PRIVATE_DB_CONFIG SECRET_STACK_TRACE" },
  });
  for (
    const name of [
      "loadBeatProgress",
      "listWeekBeatProgress",
      "restoreBeatResumeState",
      "upsertBeatProgress",
    ]
  ) {
    await assert.rejects(db.api[name](1, "arrive", {}), (error) => {
      assert.match(error.message, /Could not (load|save)/);
      assert.doesNotMatch(error.message, /PRIVATE|SECRET|STACK/);
      return true;
    });
  }
});
