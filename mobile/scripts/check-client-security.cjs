const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const allowed = new Set(["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
const config = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "lib/client-config.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: config, URL });

function scanText(text, source = false) {
  const issues = [];
  if (/\b(?:sb_secret_[A-Za-z0-9_-]{10,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{30,})\b/.test(text) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    issues.push("Secret key material detected");
  }
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") issues.push("Service-role credential detected");
    } catch { /* Not a decodable JWT. */ }
  }
  if (source) {
    for (const match of text.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      if (!allowed.has(match[1]) && !["NODE_ENV", "EXPO_OS"].includes(match[1])) {
        issues.push("Non-client environment reference detected");
      }
    }
    if (/process\s*(?:\.\s*env\s*\[|\[\s*['"]env['"])/.test(text) ||
        /\{[^}]*\}\s*=\s*process\.env/.test(text)) {
      issues.push("Use explicit allowlisted client environment references");
    }
    if (/(?:from\s*|require\s*\(|import\s*\(?)\s*['"][^'"\n]*(?:supabase\/functions|@supabase\/server|@anthropic-ai\/sdk|\bopenai)['"/]/.test(text)) {
      issues.push("Server-only import detected");
    }
  }
  return [...new Set(issues)];
}

function checkEnvironment(values) {
  const issues = [];
  for (const [name, value] of Object.entries(values)) {
    if (!allowed.has(name) && name !== "NODE_ENV") issues.push("Unexpected mobile environment variable");
    issues.push(...scanText(value));
  }
  const url = values.EXPO_PUBLIC_SUPABASE_URL;
  const key = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && !config.isPublicSupabaseUrl(url)) issues.push("Invalid public Supabase URL");
  if (key && !config.isPublishableKey(key)) issues.push("Supabase key must be a publishable client key");
  return [...new Set(issues)];
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", ".git", ".expo"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function check(bundleDirectory) {
  const findings = [];
  const report = (file, issues) => issues.forEach(issue => findings.push(`${file}: ${issue}`));
  const files = [
    ...walk(path.join(root, "src")), ...walk(path.join(root, "lib")),
    ...fs.readdirSync(root).filter(name => /^(?:app\.|babel\.|metro\.|eas\.|\.env)/.test(name)).map(name => path.join(root, name)),
  ];
  for (const file of files) {
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, "utf8");
    report(path.relative(root, file), path.basename(file).startsWith(".env")
      ? checkEnvironment(parseEnv(text)) : scanText(text, true));
  }
  // Expo also inlines public values supplied by the invoking shell or CI.
  report("build environment", checkEnvironment(Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.startsWith("EXPO_PUBLIC_")),
  )));
  if (bundleDirectory) {
    for (const file of walk(path.resolve(root, bundleDirectory))) {
      if (/\.(?:js|json|html|map|hbc)$/.test(file)) {
        report(path.relative(root, file), scanText(fs.readFileSync(file, "utf8")));
      }
    }
  }
  // Report file names and reasons only, never matching values or source lines.
  if (findings.length) {
    console.error(findings.join("\n"));
    return false;
  }
  console.log(`Client security check passed${bundleDirectory ? " (including exported bundles)" : ""}.`);
  return true;
}

module.exports = { scanText, checkEnvironment, check };
if (require.main === module) {
  const bundleIndex = process.argv.indexOf("--bundle");
  if (!check(bundleIndex >= 0 ? process.argv[bundleIndex + 1] : undefined)) process.exitCode = 1;
}
