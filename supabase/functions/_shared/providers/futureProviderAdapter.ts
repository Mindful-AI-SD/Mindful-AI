import type {
  DistractionAuditProvider,
  GuidedReflectionProvider,
  SensationLexiconProvider,
} from "./types.ts";
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

// Week 2 Sensation Lexicon counterpart of the stub above.
export const generateFutureSensationLexicon: SensationLexiconProvider = (
  _activityContext,
  _sensations,
) => {
  return Promise.reject(
    new ProviderNotConfiguredError(
      "The future sensation-lexicon provider is not implemented yet. " +
        "Set GUIDED_REFLECTION_PROVIDER=mock (the default) or implement " +
        "this adapter before selecting it.",
    ),
  );
};

// Week 3 Distraction Audit counterpart of the stubs above.
export const generateFutureDistractionAudit: DistractionAuditProvider = (
  _activityContext,
  _events,
) => {
  return Promise.reject(
    new ProviderNotConfiguredError(
      "The future distraction-audit provider is not implemented yet. " +
        "Set GUIDED_REFLECTION_PROVIDER=mock (the default) or implement " +
        "this adapter before selecting it.",
    ),
  );
};
