const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

// npx is a .cmd shim on Windows, which Node only runs through a shell.
const windows = process.platform === "win32";

// Connection details of the local Supabase stack. Refuses anything that is
// not loopback, so these suites can never run against a shared project.
function status(root) {
  const config = JSON.parse(
    execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: windows,
    }),
  );
  assert.equal(
    new URL(config.API_URL).hostname,
    "127.0.0.1",
    "Only local Supabase is supported",
  );
  return config;
}

// Runs one statement as the local database owner, for fixture setup and
// cleanup that a signed-in user is not allowed to do.
function sql(statement) {
  return execFileSync("docker", [
    "exec",
    "supabase_db_Mindful-AI",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-t",
    "-A",
    "-c",
    statement,
  ], { encoding: "utf8", stdio: "pipe" }).trim();
}

module.exports = { status, sql, windows };
