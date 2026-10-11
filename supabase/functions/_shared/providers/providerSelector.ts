import type {
  AiActivityCall,
  AiActivityKind,
  AiActivityOutput,
  AiActivityProvider,
  DistractionAuditProvider,
  GuidedReflectionProvider,
  SensationLexiconProvider,
} from "./types.ts";
import { summarizeDistractionAudit } from "./distractionAudit.ts";
import {
  generateMockDistractionAudit,
  generateMockGuidedReflection,
  generateMockSensationLexicon,
  resolveMockScenario,
  resolveMockTimingConfig,
} from "./mockProviderAdapter.ts";
import {
  generateFutureDistractionAudit,
  generateFutureGuidedReflection,
  generateFutureSensationLexicon,
} from "./futureProviderAdapter.ts";

export type ProviderName = "mock" | "future";

export const DEFAULT_PROVIDER_NAME: ProviderName = "mock";

const PROVIDERS: Record<ProviderName, GuidedReflectionProvider> = {
  mock: generateMockGuidedReflection,
  future: generateFutureGuidedReflection,
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
};

function forEachProvider<K extends AiActivityKind>(
  build: (name: ProviderName) => AiActivityProvider<K>,
): Record<ProviderName, AiActivityProvider<K>> {
  return { mock: build("mock"), future: build("future") };
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
  // nothing can be invented for it.
  distraction_audit: forEachProvider((name) =>
  async (
    activityContext,
    { events },
  ) => {
    if (events.length === 0) {
      return { provider: name, result: summarizeDistractionAudit([], []) };
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
 * Server-only provider selection via GUIDED_REFLECTION_PROVIDER. Unset or
 * unrecognized values fall back to the mock provider (with a warning for
 * the latter) so a typo or missing configuration never breaks the endpoint.
 * This module lives under supabase/functions and is never imported by the
 * Expo app.
 */
export function resolveProviderName(): ProviderName {
  const configured = Deno.env.get("GUIDED_REFLECTION_PROVIDER");

  if (configured !== undefined && !isProviderName(configured)) {
    console.warn(
      `Unrecognized GUIDED_REFLECTION_PROVIDER "${configured}"; ` +
        `falling back to "${DEFAULT_PROVIDER_NAME}".`,
    );
  }

  return isProviderName(configured) ? configured : DEFAULT_PROVIDER_NAME;
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

// Runs one call through its kind's provider and tags the result with the kind.
// New endpoints use this rather than importing an adapter.
export async function runAiActivity(
  call: AiActivityCall,
  name: ProviderName = resolveProviderName(),
): Promise<AiActivityOutput> {
  switch (call.kind) {
    case "intention_mirror":
      return {
        kind: call.kind,
        ...await getActivityProvider(call.kind, name)(
          call.activityContext,
          call.input,
        ),
      };
    case "sensation_lexicon":
      return {
        kind: call.kind,
        ...await getActivityProvider(call.kind, name)(
          call.activityContext,
          call.input,
        ),
      };
    case "distraction_audit":
      return {
        kind: call.kind,
        ...await getActivityProvider(call.kind, name)(
          call.activityContext,
          call.input,
        ),
      };
  }
}
