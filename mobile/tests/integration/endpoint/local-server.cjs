const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

// Use the real Edge runtime and existing server-only mock knobs. Never replace
// the endpoint, provider, auth middleware, or database with test doubles.
module.exports = async function serve(
  root,
  directory,
  scenario,
  apiUrl,
  functionName = "mindfulness-response",
) {
  const envFile = join(directory, "scenario.env");
  writeFileSync(
    envFile,
    [
      `MOCK_PROVIDER_SCENARIO=${scenario}`,
      "MOCK_PROVIDER_TIMEOUT_MS=100",
      "MOCK_PROVIDER_DELAY_MS=6000",
      "MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE=false",
      "MIN74_PRIVATE_CONFIG=min74-private-config-sentinel",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  const child = spawn("npx", [
    "--yes",
    "supabase",
    "functions",
    "serve",
    functionName,
    "--env-file",
    envFile,
  ], { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let ready = false, closed = false, failed = false, output = "";
  child.on("error", () => {
    failed = true;
  });
  child.on("close", () => {
    closed = true;
  });
  const capture = (chunk) => {
    // Keep startup logs private: CLI output can contain local credentials.
    output = (output + chunk.toString()).slice(-16384);
    ready ||= /Serving functions on/.test(output);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const signal = (name) => {
    if (!child.pid || closed) return;
    try {
      process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const onExit = () => signal("SIGTERM");
  process.once("exit", onExit);
  async function stop() {
    signal("SIGTERM");
    for (let i = 0; !closed && i < 50; i++) await delay(100);
    signal("SIGKILL");
    process.removeListener("exit", onExit);
  }
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !closed && !failed) {
      if (ready) {
        try {
          const response = await fetch(
            `${apiUrl}/functions/v1/${functionName}`,
            { method: "OPTIONS", signal: AbortSignal.timeout(1000) },
          );
          await response.body?.cancel();
          if (response.ok) return stop;
        } catch { /* Runtime may still be starting after the CLI banner. */ }
      }
      await delay(200);
    }
    throw new Error(
      `Local Edge runtime did not become ready (${scenario}). Check Docker and Supabase locally; startup logs are suppressed to protect credentials.`,
    );
  } catch (error) {
    await stop();
    throw error;
  }
};
