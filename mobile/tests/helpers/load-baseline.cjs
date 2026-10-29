const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
module.exports = function loadBaseline(supabase) {
  const source = fs.readFileSync(
    path.join(__dirname, "../../lib/baseline-helpers.ts"),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const model = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../../lib/baseline.ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports: model },
  );
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "./baseline") return model;
      if (name !== "./supabase") throw new Error(`Unexpected import: ${name}`);
      return { supabase };
    },
  });
  return exports;
};
