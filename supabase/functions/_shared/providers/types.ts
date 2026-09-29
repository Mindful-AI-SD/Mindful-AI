// Provider-agnostic shapes. Every guided-reflection provider (mock, and
// whatever real provider replaces/joins it later) satisfies these same
// types, so the endpoint and frontend never need to change when a provider
// is added or swapped.

export type ReflectionIntention = {
  title: string;
  explanation: string;
};

export type ProviderResponse = {
  intentions: [ReflectionIntention, ReflectionIntention, ReflectionIntention];
  provider: string;
};

export type GuidedReflectionProvider = (
  activityContext: string,
  userReflection: string,
) => Promise<ProviderResponse>;

export class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderError extends Error {
  readonly code = "PROVIDER_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

// Thrown by a provider adapter that exists but hasn't been implemented or
// configured yet (e.g. a real provider stub before credentials/API access
// are in place) — distinct from ProviderError, which means a configured
// provider's call itself failed.
export class ProviderNotConfiguredError extends Error {
  readonly code = "PROVIDER_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}
