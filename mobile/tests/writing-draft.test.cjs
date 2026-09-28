const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the TypeScript services without loading native modules or credentials.
function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, setTimeout, clearTimeout, ...globals });
  return exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function editor(read = async () => "", save = async () => {}) {
  const timers = new Map();
  let nextTimer = 0;
  const api = load("lib/writing-draft.ts", {
    setTimeout(fn, delay) {
      assert.equal(delay, 600);
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  let state = api.EMPTY_DRAFT;
  const updates = [];
  const controller = api.createWritingDraft(read, save, value => {
    state = value;
    updates.push(value);
  });
  return {
    ...controller,
    get state() { return state; },
    timers,
    updates,
    async tick() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(fn => fn());
      await new Promise(setImmediate);
    },
  };
}

test("restores before editing and does not save during restoration", async () => {
  const read = deferred();
  const writes = [];
  const draft = editor(() => read.promise, async value => writes.push(value));
  const restoring = draft.restore();
  draft.changeWriting("must not replace a draft that is still loading");
  assert.equal(draft.state.writing, "");
  read.resolve("  saved\nwriting  ");
  await restoring;
  assert.equal(draft.state.writing, "  saved\nwriting  ");
  assert.equal(draft.state.status, "saved");
  assert.equal(writes.length, 0);
});

test("debounces rapid edits into one save and persists cleared writing", async () => {
  const writes = [];
  const draft = editor(undefined, async value => writes.push(value));
  await draft.restore();
  for (const text of ["a", "ab", "abc"]) draft.changeWriting(text);
  assert.equal(writes.length, 0);
  assert.equal(draft.timers.size, 1);
  await draft.tick();
  assert.deepEqual(writes, ["abc"]);
  assert.equal(draft.state.status, "saved");
  draft.changeWriting("");
  await draft.tick();
  assert.deepEqual(writes, ["abc", ""]);
});

test("serializes saves and flushes the latest writing before leaving", async () => {
  const first = deferred();
  const writes = [];
  const draft = editor(undefined, async value => {
    writes.push(value);
    if (writes.length === 1) await first.promise;
  });
  await draft.restore();
  draft.changeWriting("older");
  const saving = draft.flush();
  assert.equal(draft.state.status, "saving");
  draft.changeWriting("newer");
  const leaving = draft.flush();
  assert.deepEqual(writes, ["older"]);
  first.resolve();
  assert.equal(await saving, true);
  assert.equal(await leaving, true);
  assert.deepEqual(writes, ["older", "newer"]);
  assert.equal(draft.state.status, "saved");
});

test("failed save retains writing and retries the latest version", async () => {
  let fail = true;
  let stored;
  const draft = editor(undefined, async value => {
    if (fail) throw new Error("offline");
    stored = value;
  });
  await draft.restore();
  draft.changeWriting("my draft");
  assert.equal(await draft.flush(), false);
  assert.equal(draft.state.status, "save-error");
  assert.equal(draft.state.writing, "my draft");
  fail = false;
  await draft.retry();
  assert.equal(stored, "my draft");
  assert.equal(draft.state.status, "saved");
});

test("typing during an autosave still waits for a new debounce interval", async () => {
  const first = deferred();
  const writes = [];
  const draft = editor(undefined, async value => {
    writes.push(value);
    if (writes.length === 1) await first.promise;
  });
  await draft.restore();
  draft.changeWriting("first");
  await draft.tick();
  draft.changeWriting("still typing");
  first.resolve();
  await new Promise(setImmediate);
  assert.deepEqual(writes, ["first"]);
  assert.equal(draft.state.status, "unsaved");
  await draft.tick();
  assert.deepEqual(writes, ["first", "still typing"]);
  assert.equal(draft.state.status, "saved");
});

test("failed restoration is retryable and never overwrites existing writing", async () => {
  let fail = true;
  const writes = [];
  const draft = editor(async () => {
    if (fail) throw new Error("offline");
    return "existing writing";
  }, async value => writes.push(value));
  await draft.restore();
  assert.equal(draft.state.status, "load-error");
  draft.changeWriting("blank replacement");
  assert.equal(await draft.flush(), false);
  assert.deepEqual(writes, []);
  fail = false;
  await draft.retry();
  assert.equal(draft.state.writing, "existing writing");
});

test("reopening restores saved writing while a different account starts empty", async () => {
  const records = new Map();
  function open(user) {
    return editor(async () => records.get(user) ?? "", async value => records.set(user, value));
  }
  const first = open("user-a");
  await first.restore();
  first.changeWriting("private draft");
  await first.flush();
  first.dispose();
  const other = open("user-b");
  await other.restore();
  assert.equal(other.state.writing, "");
  const reopened = open("user-a");
  await reopened.restore();
  assert.equal(reopened.state.writing, "private draft");
});

test("disposed account ignores late restoration and cancels pending timers", async () => {
  const pending = deferred();
  const first = editor(() => pending.promise);
  const restoring = first.restore();
  first.dispose();
  const updateCount = first.updates.length;
  pending.resolve("previous user's private draft");
  await restoring;
  assert.equal(first.updates.length, updateCount);
  assert.equal(first.state.writing, "");

  const writes = [];
  const draft = editor(undefined, async value => writes.push(value));
  await draft.restore();
  draft.changeWriting("pending typing");
  draft.dispose();
  await draft.tick();
  assert.deepEqual(writes, []);
});

function progressService() {
  let userId = "user-a";
  const calls = [];
  const result = { data: { writing: "stored", user_id: "user-a" }, error: null };
  const query = {};
  for (const method of ["select", "eq", "upsert"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = query.single = async () => result;
  const service = load("lib/progress.ts", {
    require(name) {
      assert.equal(name, "./supabase");
      return { supabase: {
        auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }) },
        from(table) { calls.push(["from", table]); return query; },
      } };
    },
  });
  return { ...service, calls, result, setUser(value) { userId = value; }, query };
}

test("progress reads filter by owner and activity; writes preserve other progress", async () => {
  const service = progressService();
  assert.equal(await service.getProgressWriting("user-a", "activity-a"), "stored");
  assert.deepEqual(service.calls, [
    ["from", "progress"], ["select", "writing"],
    ["eq", "user_id", "user-a"], ["eq", "activity_id", "activity-a"],
  ]);
  service.calls.length = 0;
  await service.saveProgressWriting("user-a", "activity-a", "  exact\ntext  ");
  const upsert = service.calls.find(call => call[0] === "upsert");
  assert.deepEqual(JSON.parse(JSON.stringify(upsert)), ["upsert", {
    user_id: "user-a", activity_id: "activity-a", writing: "  exact\ntext  ",
  }, { onConflict: "user_id,activity_id" }]);
});

test("signed-out and switched accounts cannot read or save another owner's draft", async () => {
  const service = progressService();
  for (const user of [null, "user-b"]) {
    service.setUser(user);
    await assert.rejects(service.getProgressWriting("user-a", "activity-a"), /Sign in again/);
    await assert.rejects(service.saveProgressWriting("user-a", "activity-a", "private"), /Sign in again/);
  }
  assert.equal(service.calls.length, 0);
});

test("account switch during a read rejects the old account's response", async () => {
  const service = progressService();
  service.query.maybeSingle = async () => {
    service.setUser("user-b");
    return service.result;
  };
  await assert.rejects(service.getProgressWriting("user-a", "activity-a"), /Sign in again/);
});

test("missing progress restores empty; database failures reach the editor", async () => {
  const service = progressService();
  service.result.data = null;
  assert.equal(await service.getProgressWriting("user-a", "activity-a"), "");
  service.result.error = { message: "database unavailable" };
  await assert.rejects(service.getProgressWriting("user-a", "activity-a"), /Could not load/);
  await assert.rejects(service.saveProgressWriting("user-a", "activity-a", "draft"), /Could not save/);
});
