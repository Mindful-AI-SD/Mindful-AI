// Same TypeScript/VM technique as the existing MIN-64 helper harness.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
module.exports = function load(supabase) {
  const cache = new Map();
  const allowed = new Set([
    "beat-progress-helpers",
    "four-beat-curriculum",
    "progress-helpers",
    "progress",
    "week-one",
    "week-one-arrival",
    "week-one-writing",
  ]);
  function module(name) {
    if (!allowed.has(name)) throw new Error(`Unexpected test import: ${name}`);
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../../lib", `${name}.ts`),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (name === "./supabase") return { supabase };
        if (!name.startsWith("./")) {
          throw new Error(`Unexpected test import: ${name}`);
        }
        return module(name.slice(2));
      },
    });
    return exports;
  }
  return {
    beats: module("beat-progress-helpers"),
    legacy: module("progress-helpers"),
    weekOne: module("week-one"),
    contract: module("four-beat-curriculum"),
  };
};
