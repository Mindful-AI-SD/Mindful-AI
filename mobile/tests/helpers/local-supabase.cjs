// Shared local test infrastructure. CLI output (including credentials) stays captured.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "../../..");
const cli = (args) =>
  execFileSync(
    process.env.SUPABASE_CLI || "npx",
    process.env.SUPABASE_CLI ? args : ["--yes", "supabase", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const sql = (source) =>
  execFileSync("docker", [
    "exec",
    "-i",
    "supabase_db_Mindful-AI",
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
  ], { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
    .trim();
// Preserve the local-only historical MIN-110 migration without editing its history
// or importing it into the branch. The CLI needs a matching file for an already
// applied version; use recorded SQL in an ephemeral migration workspace only.
function migrate() {
  const versions = fs.readdirSync(path.join(root, "supabase/migrations")).map(
    (name) => name.split("_")[0],
  );
  const recorded = JSON.parse(
    sql(
      "select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations;",
    ),
  );
  const extra = recorded.filter((value) => !versions.includes(value));
  if (!extra.length) return cli(["migration", "up", "--local"]);
  assert.deepEqual(
    extra,
    ["20261015000000"],
    "Unexpected local drift: inspect before migrating",
  );
  const statements = JSON.parse(
    sql(
      "select to_json(statements) from supabase_migrations.schema_migrations where version='20261015000000';",
    ),
  );
  assert.ok(
    Array.isArray(statements) && statements.length,
    "Recorded historical SQL must be available",
  );
  const temp = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "mindful-min220-migrations-"),
  );
  try {
    fs.mkdirSync(path.join(temp, "supabase"));
    fs.copyFileSync(
      path.join(root, "supabase/config.toml"),
      path.join(temp, "supabase/config.toml"),
    );
    fs.cpSync(
      path.join(root, "supabase/migrations"),
      path.join(temp, "supabase/migrations"),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(
        temp,
        "supabase/migrations/20261015000000_recorded_local_history.sql",
      ),
      statements.join(";\n") + ";\n",
    );
    return cli(["--workdir", temp, "migration", "up", "--local"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { cli, quote, sql, migrate };
