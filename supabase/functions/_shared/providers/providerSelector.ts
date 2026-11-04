import type {
  AiActivityCall,
  AiActivityKind,
  AiActivityOutput,
  AiActivityProvider,
  DistractionAuditProvider,
  GuidedReflectionProvider,
  SensationLexiconProvider,
} from "./types.ts";
import { ProviderError, ProviderNotConfiguredError } from "./types.ts";
import { aiActivityResponseSchema } from "../../../schema/aiActivitySchema.ts";
import { summarizeDistractionAudit } from "./distractionAudit.ts";
import {
  generateMockDistractionAudit,
  generateMockGuidedReflection,
  generateMockSensationLexicon,
  resolveMockScenario,
  resolveMockTimingConfig,
} from "./mockProviderAdapter.ts";
import {
  NON_AI_CONTENT_VERSION,
  PREWRITTEN_LABELS,
  PREWRITTEN_RESULTS,
} from "../prewritten/prewrittenContent.ts";
import {
  CLAUDE_MAX_TIMEOUT_MS,
  generateClaudeDistractionAudit,
  generateClaudeGuidedReflection,
  generateClaudeSensationLexicon,
  resolveClaudeConfig,
} from "./claudeAdapter.ts";
import {
  generateFutureDistractionAudit,
  generateFutureGuidedReflection,
  generateFutureSensationLexicon,
} from "./futureProviderAdapter.ts";

export type ProviderName = "mock" | "future" | "claude" | "prewritten";

// The prewritten mode generates nothing, so it has no provider for the older
// endpoints that only know how to return generated intentions. Asking for one is
// an explicit failure, not a silent switch to another mode.
function noGeneratedResult(): Promise<never> {
  return Promise.reject(
    new ProviderNotConfiguredError(
      "The prewritten mode does not generate results for this endpoint.",
    ),
  );
}

export const DEFAULT_PROVIDER_NAME: ProviderName = "mock";

const PROVIDERS: Record<ProviderName, GuidedReflectionProvider> = {
  mock: generateMockGuidedReflection,
  future: generateFutureGuidedReflection,
  claude: generateClaudeGuidedReflection,
  prewritten: noGeneratedResult,
};

const SENSATION_LEXICON_PROVIDERS: Record<
  ProviderName,
  SensationLexiconProvider
> = {
  // The mock follows the server-only QA scenario and timing settings, so an
  // endpoint needs nothing but getSensationLexiconProvider().
  mock: (activityContext, sensations) =>
    generateMockSensationLexicon(
      activityContext,
      sensations,
      resolveMockScenario(),
      resolveMockTimingConfig(),
    ),
  future: generateFutureSensationLexicon,
  claude: generateClaudeSensationLexicon,
  prewritten: noGeneratedResult,
};

// Intention Mirror through the general route. Unlike PROVIDERS.mock above,
// this mock follows the server-only QA scenario and timing settings.
const INTENTION_MIRROR_PROVIDERS: Record<
  ProviderName,
  GuidedReflectionProvider
> = {
  mock: (activityContext, userReflection) =>
    generateMockGuidedReflection(
      activityContext,
      userReflection,
      resolveMockScenario(),
      resolveMockTimingConfig(),
    ),
  future: generateFutureGuidedReflection,
  claude: generateClaudeGuidedReflection,
  prewritten: noGeneratedResult,
};

const DISTRACTION_AUDIT_PROVIDERS: Record<
  ProviderName,
  DistractionAuditProvider
> = {
  mock: (activityContext, events) =>
    generateMockDistractionAudit(
      activityContext,
      events,
      resolveMockScenario(),
      resolveMockTimingConfig(),
    ),
  future: generateFutureDistractionAudit,
  claude: generateClaudeDistractionAudit,
  prewritten: noGeneratedResult,
};

function forEachProvider<K extends AiActivityKind>(
  build: (name: ProviderName) => AiActivityProvider<K>,
): Record<ProviderName, AiActivityProvider<K>> {
  return {
    mock: build("mock"),
    future: build("future"),
    claude: build("claude"),
    prewritten: build("prewritten"),
  };
}

// The routing table: activity kind -> provider name -> implementation.
const ACTIVITY_PROVIDERS: {
  [K in AiActivityKind]: Record<ProviderName, AiActivityProvider<K>>;
} = {
  intention_mirror: forEachProvider((name) =>
  async (
    activityContext,
    { reflection },
  ) => {
    const { intentions, provider } = await INTENTION_MIRROR_PROVIDERS[name](
      activityContext,
      reflection,
    );
    return { provider, result: { intentions } };
  }),
  sensation_lexicon: forEachProvider((name) =>
  async (
    activityContext,
    { sensations },
  ) => {
    const { items, provider } = await SENSATION_LEXICON_PROVIDERS[name](
      activityContext,
      sensations,
    );
    return { provider, result: { items } };
  }),
  // The provider only assigns categories; the counts and percentages are
  // computed here. An empty log is answered without calling a provider, so
  // nothing can be invented for it. Under Claude it says "server", because no
  // model took part and the label must not claim a live response.
  distraction_audit: forEachProvider((name) =>
  async (
    activityContext,
    { events },
  ) => {
    if (events.length === 0) {
      return {
        provider: name === "claude" ? "server" : name,
        result: summarizeDistractionAudit([], []),
      };
    }
    const { assignments, provider } = await DISTRACTION_AUDIT_PROVIDERS[name](
      activityContext,
      events,
    );
    return { provider, result: summarizeDistractionAudit(events, assignments) };
  }),
};

export function isProviderName(value: unknown): value is ProviderName {
  return typeof value === "string" && value in PROVIDERS;
}

/**
 * Server-only mode selection via GUIDED_REFLECTION_PROVIDER. Unset means the
 * mock. An unrecognized value fails with ProviderNotConfiguredError: a typo such
 * as "cluade" must never silently serve test data while the team believes Claude
 * is on. This module lives under supabase/functions and is never imported by the
 * Expo app.
 */
export function resolveProviderName(): ProviderName {
  const configured = Deno.env.get("GUIDED_REFLECTION_PROVIDER");
  if (configured === undefined) return DEFAULT_PROVIDER_NAME;
  if (isProviderName(configured)) return configured;
  throw new ProviderNotConfiguredError(
    "GUIDED_REFLECTION_PROVIDER is not a recognized mode.",
  );
}

export type ActivityMode = {
  mode: ProviderName | null;
  available: boolean;
  contentVersion: string | null;
  labels: typeof PREWRITTEN_LABELS | null;
};

/**
 * What the app shows before a student begins, so a prewritten activity can
 * identify itself and an unavailable one can say so. It reveals no model name or
 * credential, and it makes no provider call.
 */
export function describeActivityMode(): ActivityMode {
  let mode: ProviderName;
  try {
    mode = resolveProviderName();
  } catch {
    return {
      mode: null,
      available: false,
      contentVersion: null,
      labels: null,
    };
  }
  const prewritten = mode === "prewritten";
  return {
    mode,
    available: mode === "claude"
      ? resolveClaudeConfig().apiKey !== null
      : mode !== "future",
    contentVersion: prewritten ? NON_AI_CONTENT_VERSION : null,
    labels: prewritten ? PREWRITTEN_LABELS : null,
  };
}

export function getGuidedReflectionProvider(
  name: ProviderName = resolveProviderName(),
): GuidedReflectionProvider {
  return PROVIDERS[name];
}

// Same provider selection as above, for the Week 2 Sensation Lexicon.
export function getSensationLexiconProvider(
  name: ProviderName = resolveProviderName(),
): SensationLexiconProvider {
  return SENSATION_LEXICON_PROVIDERS[name];
}

/**
 * General routing for every AI activity. The provider defaults to the one
 * named by GUIDED_REFLECTION_PROVIDER, which itself defaults to the mock.
 */
export function getActivityProvider<K extends AiActivityKind>(
  kind: K,
  name: ProviderName = resolveProviderName(),
): AiActivityProvider<K> {
  return ACTIVITY_PROVIDERS[kind][name];
}

const DEFAULT_ACTIVITY_DEADLINE_MS = 5_000;

/**
 * How long an endpoint waits for one activity. A real model needs longer than
 * the mock's five seconds, and the endpoint's deadline must outlast the
 * provider's own, so the provider cancels its call and reports the timeout. The
 * app stops waiting at 15 seconds, which is why CLAUDE_MAX_TIMEOUT_MS is 14.
 */
export function resolveActivityDeadlineMs(
  name: ProviderName = resolveProviderName(),
): number {
  if (name !== "claude") return DEFAULT_ACTIVITY_DEADLINE_MS;
  return Math.min(resolveClaudeConfig().timeoutMs, CLAUDE_MAX_TIMEOUT_MS) + 500;
}

function assertValidAiActivityOutput(
  kind: AiActivityKind,
  output: unknown,
): AiActivityOutput {
  const payload = typeof output === "object" && output !== null
    ? output as Record<string, unknown>
    : {};
  const parsed = aiActivityResponseSchema.safeParse({ kind, ...payload });
  if (!parsed.success) {
    throw new ProviderError(
      "The provider returned an invalid response for this activity.",
    );
  }
  return parsed.data as AiActivityOutput;
}

// Runs one call through its kind's provider and tags the result with the kind.
// New endpoints use this rather than importing an adapter.
export async function runAiActivity(
  call: AiActivityCall,
  name: ProviderName = resolveProviderName(),
): Promise<AiActivityOutput> {
  // Fixed content: this branch reaches no provider and makes no network call.
  if (name === "prewritten") {
    return assertValidAiActivityOutput(call.kind, {
      provider: "prewritten",
      contentVersion: NON_AI_CONTENT_VERSION,
      labels: PREWRITTEN_LABELS,
      result: PREWRITTEN_RESULTS[call.kind],
    });
  }
  switch (call.kind) {
    case "intention_mirror":
      return assertValidAiActivityOutput(
        call.kind,
        await getActivityProvider(
          call.kind,
          name,
        )(
          call.activityContext,
          call.input,
        ),
      );
    case "sensation_lexicon":
      return assertValidAiActivityOutput(
        call.kind,
        await getActivityProvider(
          call.kind,
          name,
        )(
          call.activityContext,
          call.input,
        ),
      );
    case "distraction_audit":
      return assertValidAiActivityOutput(
        call.kind,
        await getActivityProvider(
          call.kind,
          name,
        )(
          call.activityContext,
          call.input,
        ),
      );
  }
}
