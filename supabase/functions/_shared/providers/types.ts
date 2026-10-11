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

// Week 2 Sensation Lexicon. The student lists three sensations; the provider
// marks the vague ones and offers optional, non-clinical word choices. Each
// item echoes the student's own text in `original`, in the same order, so the
// endpoint can check the result against the request.
export type SensationList = [string, string, string];

export type SensationLexiconItem = {
  original: string;
  isVague: boolean;
  suggestions: string[];
};

export type SensationLexiconResponse = {
  items: [SensationLexiconItem, SensationLexiconItem, SensationLexiconItem];
  provider: string;
};

export type SensationLexiconProvider = (
  activityContext: string,
  sensations: SensationList,
) => Promise<SensationLexiconResponse>;

// Week 3 Distraction Audit. The student quick-taps a time-stamped event each
// time they notice a distraction. The provider only assigns each event a
// category, or null when none fits; counts and percentages are computed by
// summarizeDistractionAudit, never by a model.
//
// PLACEHOLDER categories: not yet confirmed by the sponsor.
export const DISTRACTION_CATEGORIES = [
  "social_media",
  "messaging",
  "entertainment",
  "news_and_browsing",
  "work_and_school",
  "thoughts",
] as const;

export type DistractionCategory = (typeof DISTRACTION_CATEGORIES)[number];

export type DistractionEvent = {
  id: string;
  at: string;
  label: string;
};

export type DistractionAssignment = {
  eventId: string;
  category: DistractionCategory | null;
};

export type DistractionAuditResponse = {
  assignments: DistractionAssignment[];
  provider: string;
};

export type DistractionAuditProvider = (
  activityContext: string,
  events: DistractionEvent[],
) => Promise<DistractionAuditResponse>;

export type DistractionAuditSummary = {
  totalEvents: number;
  categories: {
    category: DistractionCategory;
    count: number;
    percent: number;
  }[];
  uncategorized: { count: number; percent: number };
  assignments: DistractionAssignment[];
};

// General AI activity contract. Every AI lab is one `kind` with its own input
// and result shape; an endpoint routes a call to the provider for that kind.
// Adding a lab means adding its kind here, then its mock and real adapter, its
// schema, and its routing entry in providerSelector.ts.
export const AI_ACTIVITY_KINDS = [
  "intention_mirror",
  "sensation_lexicon",
  "distraction_audit",
] as const;

export type AiActivityKind = (typeof AI_ACTIVITY_KINDS)[number];

export type AiActivityInputs = {
  intention_mirror: { reflection: string };
  sensation_lexicon: { sensations: SensationList };
  distraction_audit: { events: DistractionEvent[] };
};

export type AiActivityResults = {
  intention_mirror: { intentions: ProviderResponse["intentions"] };
  sensation_lexicon: { items: SensationLexiconResponse["items"] };
  distraction_audit: DistractionAuditSummary;
};

export type AiActivityProvider<K extends AiActivityKind> = (
  activityContext: string,
  input: AiActivityInputs[K],
) => Promise<{ provider: string; result: AiActivityResults[K] }>;

export type AiActivityCall = {
  [K in AiActivityKind]: {
    kind: K;
    activityContext: string;
    input: AiActivityInputs[K];
  };
}[AiActivityKind];

export type AiActivityOutput = {
  [K in AiActivityKind]: {
    kind: K;
    provider: string;
    result: AiActivityResults[K];
  };
}[AiActivityKind];

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
