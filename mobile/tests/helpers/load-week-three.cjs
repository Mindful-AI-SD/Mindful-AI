const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
module.exports = function load(supabase) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../../lib/week-three-helpers.ts"),
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
      if (name !== "./supabase") throw new Error("Unexpected import");
      return { supabase };
    },
  });
  return exports;
};
