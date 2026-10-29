// Load the actual checked-in schema/arithmetic; do not duplicate fixture validators.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "../../..");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "zod") return require("zod/v4");
      const target = path.resolve(path.dirname(file), name);
      if (
        ![
          "supabase/functions/_shared/providers/distractionAudit.ts",
          "supabase/functions/_shared/providers/types.ts",
        ].map((p) => path.join(root, p)).includes(target)
      ) throw new Error("Unexpected schema import");
      return load(target);
    },
  });
  return exports;
}
module.exports = load(
  path.join(root, "supabase/schema/distractionAuditSchema.ts"),
);
