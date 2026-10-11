const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const lib = path.join(__dirname, "../../lib");
const turn = () => new Promise(setImmediate);

// Loads mobile/lib services with fake timers and an injected Supabase fake: no
// native modules, no network, no credentials. Only ai-activity.ts and files
// that import it can be loaded; any other import fails the test.
module.exports = function environment(
  { session = { access_token: "token" }, sessionError = null, invoke } = {},
) {
  let now = 0, next = 0;
  const timers = new Map(), calls = [], cache = new Map();
  const supabase = {
    auth: { getSession: async () => ({ data: { session }, error: sessionError }) },
    functions: {
      invoke(name, options) {
        calls.push({ name, options });
        return invoke(name, options);
      },
    },
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = ts.transpileModule(fs.readFileSync(path.join(lib, `${name}.ts`), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(source, {
      exports, AbortController,
      setTimeout(fn, delay) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
      clearTimeout(id) { timers.delete(id); },
      require(target) {
        if (target === "./supabase") return { supabase };
        assert.equal(target, "./ai-activity", `Unexpected import: ${target}`);
        return load("ai-activity");
      },
    });
    return exports;
  }
  return {
    load, calls, timers,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
      await turn();
    },
  };
};
module.exports.turn = turn;
