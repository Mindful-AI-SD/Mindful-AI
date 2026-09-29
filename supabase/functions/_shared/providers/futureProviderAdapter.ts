import type { GuidedReflectionProvider } from "./types.ts";
import { ProviderNotConfiguredError } from "./types.ts";

/**
 * Placeholder for the next guided-reflection provider (a candidate is UCF
 * Copilot, pending API access; the name is not final). It satisfies the
 * same GuidedReflectionProvider interface as the mock adapter so it can be
 * selected via GUIDED_REFLECTION_PROVIDER without any endpoint or frontend
 * changes. Implementing the real call is the only change this file needs.
 */
export const generateFutureGuidedReflection: GuidedReflectionProvider = (
  _activityContext,
  _userReflection,
) => {
  return Promise.reject(
    new ProviderNotConfiguredError(
      "The future guided-reflection provider is not implemented yet. " +
        "Set GUIDED_REFLECTION_PROVIDER=mock (the default) or implement " +
        "this adapter before selecting it.",
    ),
  );
};
