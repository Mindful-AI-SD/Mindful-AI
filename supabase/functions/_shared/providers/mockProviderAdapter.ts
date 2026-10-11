import type {
  DistractionAssignment,
  DistractionCategory,
  DistractionEvent,
  ReflectionIntention,
  SensationLexiconItem,
  SensationList,
} from "./types.ts";
import {
  DISTRACTION_CATEGORIES,
  ProviderError,
  ProviderTimeoutError,
} from "./types.ts";

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

// Crisis language is handled before any provider is called, by
// ../crisisSupport.ts. The mock has no safety logic of its own.
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

function selectIntentions(label: string): MockProviderResponse["intentions"] {
  return ORDINARY_INTENTIONS.map((intention) => ({
    ...intention,
    title: `${label} ${intention.title}`,
  })) as MockProviderResponse["intentions"];
}

// Real providers plug in behind this same signature:
// (activityContext, userReflection) -> Promise<MockProviderResponse>.
export async function generateMockGuidedReflection(
  activityContext: string,
  _userReflection: string,
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
        intentions: selectIntentions(DEMO_LABELS.delayed),
        provider: "mock",
      };

    case "success":
    default:
      return {
        intentions: selectIntentions(DEMO_LABELS.success),
        provider: "mock",
      };
  }
}

export type MockSensationLexiconResponse = {
  items: [SensationLexiconItem, SensationLexiconItem, SensationLexiconItem];
  provider: "mock";
};

// Synthetic word lists for the mock only; not sponsor-approved curriculum
// copy. Every suggestion is a plain sensory word: no causes, no clinical or
// diagnostic terms. Keys are the vague words the mock recognizes.
const VAGUE_SENSATION_WORDS: Record<string, string[]> = {
  weird: ["tingling", "fluttery", "buzzing", "prickly"],
  strange: ["tingling", "floaty", "buzzing", "prickly"],
  funny: ["fluttery", "ticklish", "tingling", "jittery"],
  off: ["unsteady", "heavy", "restless", "hollow"],
  bad: ["tight", "heavy", "achy", "sore"],
  uncomfortable: ["tight", "stiff", "restless", "warm"],
  tired: ["heavy", "slow", "droopy", "sluggish"],
  fine: ["loose", "steady", "warm", "light"],
  okay: ["loose", "steady", "warm", "light"],
  ok: ["loose", "steady", "warm", "light"],
  good: ["loose", "light", "warm", "steady"],
};

function describeSensation(original: string): SensationLexiconItem {
  const words: string[] = original.toLowerCase().match(/[a-z]+/g) ?? [];
  const vagueWord = words.find((word) => word in VAGUE_SENSATION_WORDS);

  if (vagueWord === undefined) {
    return { original, isVague: false, suggestions: [] };
  }

  return {
    original,
    isVague: true,
    // Never offer a word the student already used.
    suggestions: VAGUE_SENSATION_WORDS[vagueWord].filter((suggestion) =>
      !words.includes(suggestion)
    ),
  };
}

function describeSensations(
  sensations: SensationList,
): MockSensationLexiconResponse {
  return {
    items: sensations.map(
      describeSensation,
    ) as MockSensationLexiconResponse["items"],
    provider: "mock",
  };
}

// Same scenarios and timing knobs as generateMockGuidedReflection. Success
// bodies carry no demo label, because every string in them is either the
// student's own text or a single suggested word; failures keep the label in
// the error message.
export async function generateMockSensationLexicon(
  _activityContext: string,
  sensations: SensationList,
  scenario: MockScenario = DEFAULT_SCENARIO,
  timing: MockTimingConfig = DEFAULT_TIMING_CONFIG,
): Promise<MockSensationLexiconResponse> {
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
      return describeSensations(sensations);

    case "success":
    default:
      return describeSensations(sensations);
  }
}

export type MockDistractionAuditResponse = {
  assignments: DistractionAssignment[];
  provider: "mock";
};

// Synthetic keyword lists for the mock only. A label is matched word by word,
// and the first category in DISTRACTION_CATEGORIES order with a matching word
// wins. A label with no matching word is left uncategorized (null).
const DISTRACTION_KEYWORDS: Record<DistractionCategory, string[]> = {
  social_media: [
    "instagram",
    "tiktok",
    "snapchat",
    "facebook",
    "twitter",
    "reddit",
    "social",
  ],
  messaging: ["text", "message", "messages", "chat", "email", "call", "dm"],
  entertainment: [
    "youtube",
    "netflix",
    "video",
    "videos",
    "game",
    "games",
    "music",
    "show",
    "tv",
  ],
  news_and_browsing: ["news", "browsing", "search", "shopping", "headlines"],
  work_and_school: [
    "homework",
    "assignment",
    "class",
    "work",
    "deadline",
    "canvas",
  ],
  thoughts: ["worry", "worrying", "daydream", "planning", "memory", "thought"],
};

function categorizeDistraction(label: string): DistractionCategory | null {
  const words: string[] = label.toLowerCase().match(/[a-z]+/g) ?? [];

  return DISTRACTION_CATEGORIES.find((category) =>
    DISTRACTION_KEYWORDS[category].some((keyword) => words.includes(keyword))
  ) ?? null;
}

function categorizeDistractions(
  events: DistractionEvent[],
): MockDistractionAuditResponse {
  return {
    assignments: events.map((event) => ({
      eventId: event.id,
      category: categorizeDistraction(event.label),
    })),
    provider: "mock",
  };
}

// Same scenarios and timing knobs as the other mocks. It returns assignments
// only; summarizeDistractionAudit turns them into counts and percentages.
export async function generateMockDistractionAudit(
  _activityContext: string,
  events: DistractionEvent[],
  scenario: MockScenario = DEFAULT_SCENARIO,
  timing: MockTimingConfig = DEFAULT_TIMING_CONFIG,
): Promise<MockDistractionAuditResponse> {
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
      return categorizeDistractions(events);

    case "success":
    default:
      return categorizeDistractions(events);
  }
}
