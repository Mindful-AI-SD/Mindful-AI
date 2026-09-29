import type { GuidedReflectionProvider } from "./types.ts";
import { generateMockGuidedReflection } from "./mockProviderAdapter.ts";
import { generateFutureGuidedReflection } from "./futureProviderAdapter.ts";

export type ProviderName = "mock" | "future";

export const DEFAULT_PROVIDER_NAME: ProviderName = "mock";

const PROVIDERS: Record<ProviderName, GuidedReflectionProvider> = {
  mock: generateMockGuidedReflection,
  future: generateFutureGuidedReflection,
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
