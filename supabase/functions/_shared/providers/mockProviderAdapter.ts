import type { ReflectionIntention } from "./types.ts";
import { ProviderError, ProviderTimeoutError } from "./types.ts";

// Re-exported for callers that already import these from this module.
export type { ReflectionIntention };
export { ProviderError, ProviderTimeoutError };

export type MockProviderResponse = {
  intentions: [ReflectionIntention, ReflectionIntention, ReflectionIntention];
  provider: "mock";
};

export type MockScenario = "success" | "delayed" | "timeout" | "error";

export type MockTimingConfig = {
  delayMs: number;
  timeoutMs: number;
};

const CONCERNING_LANGUAGE =
  /\b(?:might|may|want to|plan to|going to)\s+(?:hurt|harm)\s+myself\b/i;

const ORDINARY_INTENTIONS: MockProviderResponse["intentions"] = [
  {
    title: "Name one sensation",
    explanation:
      "Notice a single physical sensation from this activity and describe it without judging it.",
  },
  {
    title: "Name one thought",
    explanation:
      "Identify a thought that came up during this activity and observe it as separate from yourself.",
  },
  {
    title: "Carry it forward",
    explanation:
      "Choose one small way to bring this awareness into the next hour of your day.",
  },
];

const CONCERNING_INTENTIONS: MockProviderResponse["intentions"] = [
  {
    title: "Reach out to someone you trust",
    explanation:
      "Consider sharing how you're feeling with a friend, family member, or counselor today.",
  },
  {
    title: "Find a grounding action",
    explanation:
      "Try a simple grounding technique, like naming five things you can see, to steady the moment.",
  },
  {
    title: "Know support is available",
    explanation:
      "If the feeling grows stronger, a crisis line or trusted professional can help right away.",
  },
];

const MOCK_SCENARIOS = new Set<MockScenario>([
  "success",
  "delayed",
  "timeout",
  "error",
]);

// Short, recognizable markers so QA can identify which demo scenario fired
// straight from the response body or error message, without timing the
// request or reading logs. Documented in the README's QA Demo Scenarios
// section alongside the MOCK_PROVIDER_SCENARIO value that triggers each one.
export const DEMO_LABELS: Record<MockScenario, string> = {
  success: "[Demo: Normal Success]",
  delayed: "[Demo: Slow Success]",
  timeout: "[Demo: Timeout]",
  error: "[Demo: Provider Failure]",
};

export const DEFAULT_SCENARIO: MockScenario = "success";

export const DEFAULT_TIMING_CONFIG: MockTimingConfig = {
  delayMs: 1500,
  timeoutMs: 5000,
};

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" &&
    MOCK_SCENARIOS.has(value as MockScenario);
}

// The one request-body field ever inspected for a dev-only scenario
// override. Named here as the single source of truth so extraction and
// resolution can't drift apart.
export const DEV_SCENARIO_OVERRIDE_FIELD = "devMockScenario";

/**
 * Pulls the dev-only scenario override off a raw, not-yet-validated request
 * body and returns a copy with that field removed. The removal happens
 * unconditionally — regardless of whether MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE
 * is set — so the field can never reach production-facing schema validation
 * or downstream handling either way. Whether the extracted value is actually
 * honored is decided later, by resolveMockScenario alone.
 */
export function extractDevScenarioOverride(
  requestBody: unknown,
): { override: unknown; sanitizedBody: unknown } {
  const isPlainObject = requestBody !== null &&
    typeof requestBody === "object" && !Array.isArray(requestBody);

  if (!isPlainObject) {
    return { override: undefined, sanitizedBody: requestBody };
  }

  const body = requestBody as Record<string, unknown>;
  const { [DEV_SCENARIO_OVERRIDE_FIELD]: override, ...sanitizedBody } = body;

  return { override, sanitizedBody };
}

/**
 * Server-only scenario selection. An explicit request override is only
 * honored when MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE=true, so production
 * traffic (where that variable is unset) can never steer the mock via
 * request fields. Kept separate from generateMockGuidedReflection so the
 * generation logic itself stays a pure, permission-free function to test.
 */
export function resolveMockScenario(requestOverride?: unknown): MockScenario {
  const overrideAllowed =
    Deno.env.get("MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE") === "true";

  if (overrideAllowed && isMockScenario(requestOverride)) {
    return requestOverride;
  }

  const envScenario = Deno.env.get("MOCK_PROVIDER_SCENARIO");
  return isMockScenario(envScenario) ? envScenario : DEFAULT_SCENARIO;
}

function resolvePositiveMs(envValue: string | undefined, fallback: number): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveMockTimingConfig(): MockTimingConfig {
  return {
    delayMs: resolvePositiveMs(
      Deno.env.get("MOCK_PROVIDER_DELAY_MS"),
      DEFAULT_TIMING_CONFIG.delayMs,
    ),
    timeoutMs: resolvePositiveMs(
      Deno.env.get("MOCK_PROVIDER_TIMEOUT_MS"),
      DEFAULT_TIMING_CONFIG.timeoutMs,
    ),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectIntentions(
  userReflection: string,
  label: string,
): MockProviderResponse["intentions"] {
  const base = CONCERNING_LANGUAGE.test(userReflection)
    ? CONCERNING_INTENTIONS
    : ORDINARY_INTENTIONS;

  return base.map((intention) => ({
    ...intention,
    title: `${label} ${intention.title}`,
  })) as MockProviderResponse["intentions"];
}

// Real providers plug in behind this same signature:
// (activityContext, userReflection) -> Promise<MockProviderResponse>.
export async function generateMockGuidedReflection(
  activityContext: string,
  userReflection: string,
  scenario: MockScenario = DEFAULT_SCENARIO,
  timing: MockTimingConfig = DEFAULT_TIMING_CONFIG,
): Promise<MockProviderResponse> {
  switch (scenario) {
    case "error":
      throw new ProviderError(
        `${DEMO_LABELS.error} Mock provider returned an error`,
      );

    case "timeout":
      await wait(timing.timeoutMs);
      throw new ProviderTimeoutError(
        `${DEMO_LABELS.timeout} Mock provider timed out after ${timing.timeoutMs}ms`,
      );

    case "delayed":
      await wait(timing.delayMs);
      return {
        intentions: selectIntentions(userReflection, DEMO_LABELS.delayed),
        provider: "mock",
      };

    case "success":
    default:
      return {
        intentions: selectIntentions(userReflection, DEMO_LABELS.success),
        provider: "mock",
      };
  }
}
