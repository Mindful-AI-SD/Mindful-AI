const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

module.exports = function loadProgressHelpers(supabase) {
  const source = fs.readFileSync(
    path.join(__dirname, "../../lib/progress-helpers.ts"),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name !== "./supabase") throw new Error(`Unexpected import: ${name}`);
      return { supabase };
    },
  });
  return exports;
};
