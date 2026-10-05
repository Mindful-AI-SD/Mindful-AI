const assert = require("node:assert/strict");
const test = require("node:test");
const { scanText, checkEnvironment } = require("../scripts/check-client-security.cjs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("allows only public client configuration", () => {
  assert.deepEqual(checkEnvironment({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  }), []);
  assert.deepEqual(checkEnvironment({ EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }), []);
  assert.ok(checkEnvironment({ EXPO_PUBLIC_SUPABASE_URL: "https://user:password@example.com" }).length);
  assert.ok(checkEnvironment({ EXPO_PUBLIC_PROVIDER_KEY: "test" }).length);
  assert.ok(checkEnvironment({ OPENAI_API_KEY: "test" }).length);
  assert.ok(checkEnvironment({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_example" }).length);
});

test("finds secret keys and service-role JWTs without echoing values", () => {
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"role":"service_role"}').toString("base64url")}.signature`;
  for (const secret of [jwt, "sb_secret_" + "x".repeat(30), "sk-proj-" + "x".repeat(30), "sk-ant-" + "x".repeat(30), "-----BEGIN " + "PRIVATE KEY-----"]) {
    const issues = scanText(`const value = '${secret}';`);
    assert.ok(issues.length);
    assert.ok(!issues.join(" ").includes(secret));
  }
});

test("blocks server environment references, dynamic reads, and backend imports", () => {
  for (const code of [
    "process.env.SUPABASE_SERVICE_ROLE_KEY",
    "process.env.OPENAI_API_KEY",
    "process.env.EXPO_PUBLIC_PROVIDER_KEY",
    "process.env['KEY']",
    "process['env'].KEY",
    "const { SECRET } = process.env",
    "import { withSupabase } from '@supabase/server';",
    "import backend from '../../supabase/functions/example';",
  ]) assert.ok(scanText(code, true).length, code);
  assert.deepEqual(scanText("process.env.EXPO_PUBLIC_SUPABASE_URL; process.env.EXPO_OS", true), []);
});

test("patched router decoder preserves query parameters and handles malformed input without hanging", () => {
  const query = require("query-string");
  assert.deepEqual({ ...query.parse("name=Ren%C3%A9e&note=hello+world&activityId=abc") }, {
    name: "Renée", note: "hello world", activityId: "abc",
  });
  const result = spawnSync(process.execPath, ["-e", "const query = require('query-string'); query.parse('note=' + '%C2'.repeat(12000));"], {
    cwd: path.join(__dirname, ".."), timeout: 3000, encoding: "utf8",
  });
  assert.equal(result.error, undefined, "Malformed query decoding must finish within the timeout");
  assert.equal(result.status, 0, result.stderr);
});
