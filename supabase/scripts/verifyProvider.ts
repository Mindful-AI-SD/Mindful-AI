// Runs synthetic activity requests through a deployed or local ai-activity
// function, the way the app does, and prints evidence as JSON. It never prints a
// token or password. Synthetic input only: never real student text.
//
//   deno task verify:provider            (see docs/sprint-3/claude-live-verification.md)
//
// Every request to a live Claude deployment costs money.
import {
  aiActivityRequestSchema,
  aiActivityResponseMatchesRequest,
  aiActivityResponseSchema,
} from "../schema/aiActivitySchema.ts";
import { evaluateRubric, type Scenario, SCENARIOS } from "./scenarios.ts";

export type VerifyConfig = {
  supabaseUrl: string;
  publishableKey: string;
  email: string;
  password: string;
  expectedProvider: string;
  scenarioSet: "smoke" | "all";
};

export type ScenarioEvidence = {
  scenario: string;
  kind: string;
  status: number;
  latencyMs: number;
  provider: string | null;
  schemaValid: boolean;
  matchesRequest: boolean;
  expectedProvider: boolean;
  rubric: { rule: string; passed: boolean }[];
  errorCode: string | null;
  output: unknown;
  passed: boolean;
};

export type VerifyReport = {
  supabaseHost: string;
  expectedProvider: string;
  mode: unknown;
  ranAt: string;
  allPassed: boolean;
  scenarios: ScenarioEvidence[];
};

type Fetch = typeof globalThis.fetch;

async function signIn(config: VerifyConfig, fetcher: Fetch): Promise<string> {
  const response = await fetcher(
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
  );
  const body = await response.json();
  // The server's error text is left out: it is not needed to diagnose this.
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Sign-in failed with HTTP ${response.status}.`);
  }
  return body.access_token;
}

async function publishedActivityId(
  config: VerifyConfig,
  token: string,
  week: number,
  fetcher: Fetch,
): Promise<string> {
  const response = await fetcher(
    `${config.supabaseUrl}/rest/v1/activities?select=id,weeks!inner(week_number)` +
      `&is_published=eq.true&weeks.week_number=eq.${week}&limit=1`,
    {
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const rows = await response.json();
  if (!response.ok || !Array.isArray(rows) || !rows[0]?.id) {
    throw new Error(`No published activity found for Week ${week}.`);
  }
  return rows[0].id;
}

function parseRequest(kind: string, activityId: string, input: unknown) {
  return aiActivityRequestSchema.parse({
    kind,
    activityId,
    activityContext: "Synthetic verification request.",
    input,
  });
}

export async function runVerification(
  config: VerifyConfig,
  fetcher: Fetch = globalThis.fetch,
  now: () => number = Date.now,
): Promise<VerifyReport> {
  const token = await signIn(config, fetcher);
  const endpoint = `${config.supabaseUrl}/functions/v1/ai-activity`;
  const headers = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const modeResponse = await fetcher(endpoint, { method: "GET", headers });
  const mode = modeResponse.ok ? await modeResponse.json() : null;
  if (!modeResponse.ok) await modeResponse.body?.cancel();

  const selected: Scenario[] = config.scenarioSet === "smoke"
    ? SCENARIOS.filter((scenario) => scenario.smoke)
    : SCENARIOS;

  // Week 3 has no seeded activity yet, so it runs against the Week 2 row. The
  // kind is what selects the contract; the row only has to be published.
  const activityIds = new Map<number, string>();
  const activityFor = async (week: number) => {
    const row = Math.min(week, 2);
    if (!activityIds.has(row)) {
      activityIds.set(
        row,
        await publishedActivityId(config, token, row, fetcher),
      );
    }
    return activityIds.get(row)!;
  };

  const scenarios: ScenarioEvidence[] = [];
  for (const scenario of selected) {
    const request = parseRequest(
      scenario.kind,
      await activityFor(scenario.week),
      scenario.input,
    );
    const startedAt = now();
    const response = await fetcher(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    const latencyMs = now() - startedAt;
    const body = await response.json().catch(() => null);
    const parsed = aiActivityResponseSchema.safeParse(body);
    const matchesRequest = parsed.success &&
      aiActivityResponseMatchesRequest(request, parsed.data);
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const rubric = parsed.success ? evaluateRubric(scenario, parsed.data) : [];
    const expectedProvider = provider === config.expectedProvider;
    scenarios.push({
      scenario: scenario.name,
      kind: scenario.kind,
      status: response.status,
      latencyMs,
      provider,
      schemaValid: parsed.success,
      matchesRequest,
      expectedProvider,
      rubric,
      errorCode: typeof body?.error === "string" ? body.error : null,
      output: parsed.success ? parsed.data.result : null,
      passed: response.status === 200 && parsed.success && matchesRequest &&
        expectedProvider && rubric.every(({ passed }) => passed),
    });
  }

  return {
    supabaseHost: new URL(config.supabaseUrl).host,
    expectedProvider: config.expectedProvider,
    mode,
    ranAt: new Date().toISOString(),
    allPassed: scenarios.length > 0 &&
      scenarios.every(({ passed }) => passed),
    scenarios,
  };
}

if (import.meta.main) {
  const required = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) {
      console.error(`Set ${name} before running this script.`);
      Deno.exit(2);
    }
    return value;
  };
  const report = await runVerification({
    supabaseUrl: required("VERIFY_SUPABASE_URL").replace(/\/$/, ""),
    publishableKey: required("VERIFY_PUBLISHABLE_KEY"),
    email: required("VERIFY_EMAIL"),
    password: required("VERIFY_PASSWORD"),
    expectedProvider: Deno.env.get("VERIFY_EXPECTED_PROVIDER") ?? "claude",
    scenarioSet: Deno.args.includes("--all") ? "all" : "smoke",
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.allPassed) Deno.exit(1);
}
