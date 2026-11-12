// The per-student daily cap on model requests: the claim against the database
// function, the configured limit, and which calls count at all.
import { strict as assert } from "node:assert";
import {
  requestQuotaClaimer,
  RequestQuotaExceededError,
  RequestQuotaUnavailableError,
} from "../../functions/_shared/providers/requestQuota.ts";
import {
  DEFAULT_DAILY_REQUEST_LIMIT,
  MAX_DAILY_REQUEST_LIMIT,
  resolveClaudeConfig,
} from "../../functions/_shared/providers/claudeAdapter.ts";
import { activityCallUsesModel } from "../../functions/_shared/providers/providerSelector.ts";
import type { AiActivityCall } from "../../functions/_shared/providers/types.ts";

type Call = { name: string; args: Record<string, unknown> };

function fakeClient(reply: () => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve(reply());
      },
    },
  };
}

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

Deno.test("quota: an allowed claim resolves and passes the server's own limit", async () => {
  const { calls, client } = fakeClient(() => ({
    data: { allowed: true, count: 3, limit: 7 },
    error: null,
  }));
  await requestQuotaClaimer(client, 7)();
  assert.deepEqual(calls, [{
    name: "claim_ai_request",
    args: { p_daily_limit: 7 },
  }]);
});

Deno.test("quota: a refused claim throws the rate-limit error", async () => {
  const { client } = fakeClient(() => ({
    data: { allowed: false, limit: 7 },
    error: null,
  }));
  const error = await rejection(() => requestQuotaClaimer(client, 7)());
  assert.ok(error instanceof RequestQuotaExceededError);
  assert.equal(error.code, "RATE_LIMITED");
});

Deno.test("quota: a database error, malformed reply, or thrown call fails closed", async () => {
  const replies: Array<() => { data: unknown; error: unknown }> = [
    () => ({ data: null, error: { message: "private database detail" } }),
    () => ({ data: { count: 3 }, error: null }),
    () => ({ data: "allowed", error: null }),
    () => ({ data: null, error: null }),
    () => {
      throw new Error("private network detail");
    },
  ];
  for (const reply of replies) {
    const { client } = fakeClient(reply);
    const error = await rejection(() => requestQuotaClaimer(client, 7)());
    assert.ok(error instanceof RequestQuotaUnavailableError);
    assert.ok(!String((error as Error).message).includes("private"));
  }
});

Deno.test("quota: the claimer defaults to the configured daily limit", async () => {
  const previous = Deno.env.get("CLAUDE_DAILY_REQUEST_LIMIT");
  Deno.env.set("CLAUDE_DAILY_REQUEST_LIMIT", "12");
  try {
    const { calls, client } = fakeClient(() => ({
      data: { allowed: true },
      error: null,
    }));
    await requestQuotaClaimer(client)();
    assert.equal(calls[0].args.p_daily_limit, 12);
  } finally {
    if (previous === undefined) Deno.env.delete("CLAUDE_DAILY_REQUEST_LIMIT");
    else Deno.env.set("CLAUDE_DAILY_REQUEST_LIMIT", previous);
  }
});

Deno.test("config: the daily limit defaults to 30 and ignores out-of-range values", () => {
  const read = (value?: string) => (name: string) =>
    name === "CLAUDE_DAILY_REQUEST_LIMIT" ? value : undefined;
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: string) => warnings.push(message);
  try {
    assert.equal(DEFAULT_DAILY_REQUEST_LIMIT, 30);
    assert.equal(resolveClaudeConfig(read()).dailyRequestLimit, 30);
    assert.equal(resolveClaudeConfig(read("1")).dailyRequestLimit, 1);
    assert.equal(
      resolveClaudeConfig(read(String(MAX_DAILY_REQUEST_LIMIT)))
        .dailyRequestLimit,
      MAX_DAILY_REQUEST_LIMIT,
    );
    for (const bad of ["0", "-5", "501", "2.5", "lots"]) {
      assert.equal(resolveClaudeConfig(read(bad)).dailyRequestLimit, 30);
    }
    assert.ok(warnings.every((line) => !/\d/.test(line.replace("CLAUDE", ""))));
  } finally {
    console.warn = warn;
  }
});

const ENV_KEYS = ["GUIDED_REFLECTION_PROVIDER", "ANTHROPIC_API_KEY"];

function withEnv(vars: Record<string, string>, run: () => void) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, Deno.env.get(key)]),
  );
  for (const key of ENV_KEYS) Deno.env.delete(key);
  for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

const reflection: AiActivityCall = {
  kind: "intention_mirror",
  activityContext: "Intention Mirror",
  input: { reflection: "A synthetic reflection." },
};
const emptyLog: AiActivityCall = {
  kind: "distraction_audit",
  activityContext: "Distraction Audit",
  input: { events: [] },
};
const log: AiActivityCall = {
  kind: "distraction_audit",
  activityContext: "Distraction Audit",
  input: {
    events: [{ id: "e1", at: "2026-10-12T09:00:00Z", label: "Instagram" }],
  },
};

Deno.test("only calls that reach Claude count against the limit", () => {
  withEnv(
    { GUIDED_REFLECTION_PROVIDER: "claude", ANTHROPIC_API_KEY: "test" },
    () => {
      assert.equal(activityCallUsesModel(reflection), true);
      assert.equal(activityCallUsesModel(log), true);
      // The server answers an empty log itself.
      assert.equal(activityCallUsesModel(emptyLog), false);
    },
  );
  withEnv({ GUIDED_REFLECTION_PROVIDER: "claude" }, () => {
    // No key: the request fails as unavailable without a model call.
    assert.equal(activityCallUsesModel(reflection), false);
  });
  for (const mode of ["mock", "prewritten", "future", "not-a-mode"]) {
    withEnv(
      { GUIDED_REFLECTION_PROVIDER: mode, ANTHROPIC_API_KEY: "test" },
      () => {
        assert.equal(activityCallUsesModel(reflection), false, mode);
      },
    );
  }
  withEnv({}, () => assert.equal(activityCallUsesModel(reflection), false));
});
