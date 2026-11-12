import {
  type AiActivityError,
  getAiActivity,
  type SupportResource,
} from "./ai-activity";
import type { PrewrittenRecord, WeekOnePrewritten } from "./prewritten-content";

export type IntentionRequest = {
  activityId: string;
  activityContext: string;
  userReflection: string;
  expectedMode?: string;
};

export type Intention = { title: string; explanation: string };

export type IntentionResponse = {
  intentions: [Intention, Intention, Intention];
  provider: string;
};

// The server's fixed crisis response: show it and do not continue the activity.
export type IntentionSupport = {
  kind: "support";
  message: string;
  resources: SupportResource[];
};

// Fixed non-AI content, which the student chooses from. Never a generated answer.
export type IntentionPrewritten =
  & { kind: "prewritten" }
  & PrewrittenRecord<WeekOnePrewritten>;

export type IntentionData =
  | IntentionResponse
  | IntentionSupport
  | IntentionPrewritten;

export type IntentionError = {
  code:
    | "TIMEOUT"
    | "CANCELLED"
    | "AUTH_REQUIRED"
    | "NETWORK_ERROR"
    | "INVALID_INPUT"
    | "UNAVAILABLE"
    | "MODE_CHANGED"
    | "RATE_LIMITED"
    | "REQUEST_FAILED"
    | "INVALID_RESPONSE";
  message: string;
  status: number | null;
};

export type IntentionResult =
  | { data: IntentionData; error: null }
  | { data: null; error: IntentionError };

function failure(
  code: IntentionError["code"],
  message: string,
  status: number | null = null,
): IntentionResult {
  return { data: null, error: { code, message, status } };
}

export type IntentionProvider = (
  request: IntentionRequest,
  signal: AbortSignal,
) => Promise<unknown>;

function isResponse(value: unknown): value is IntentionResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.provider === "string" && data.provider.trim().length > 0 &&
    data.provider.length <= 50 &&
    Object.keys(data).length === 2 &&
    Array.isArray(data.intentions) && data.intentions.length === 3 &&
    data.intentions.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const intention = item as Record<string, unknown>;
      return Object.keys(intention).length === 2 &&
        typeof intention.title === "string" &&
        intention.title.trim().length > 0 && intention.title.trim().length <= 120 &&
        typeof intention.explanation === "string" &&
        intention.explanation.trim().length > 0 && intention.explanation.trim().length <= 1000;
    });
}

function isOutcome(value: unknown): value is IntentionSupport | IntentionPrewritten {
  const kind = (value as { kind?: unknown } | null)?.kind;
  return kind === "support" || kind === "prewritten";
}

// Carries the general client's already student-safe error through the provider
// interface, so its code and message reach the screen unchanged.
class ServiceError extends Error {
  failure: AiActivityError;

  constructor(failure: AiActivityError) {
    super("Intention request failed");
    this.failure = failure;
  }
}

// The real route: the authenticated ai-activity function, which runs the crisis
// check and selects the mode on the server. The app holds no provider or key.
async function requestServerIntentions(
  request: IntentionRequest,
  signal: AbortSignal,
): Promise<IntentionData> {
  const { data, error } = await getAiActivity("intention_mirror", {
    activityId: request.activityId,
    activityContext: request.activityContext,
    input: { reflection: request.userReflection },
    expectedMode: request.expectedMode,
  }, { signal });
  if (error) throw new ServiceError(error);
  if (data.outcome === "support") {
    return {
      kind: "support",
      message: data.message,
      resources: data.resources,
    };
  }
  if (data.outcome === "prewritten") {
    return {
      kind: "prewritten",
      provider: data.provider,
      contentVersion: data.contentVersion,
      labels: data.labels,
      result: data.result,
    };
  }
  return { intentions: data.result.intentions, provider: data.provider };
}

export function getIntentions(
  request: IntentionRequest,
  options: {
    signal?: AbortSignal;
    provider?: IntentionProvider;
    timeoutMs?: number;
  } = {},
): Promise<IntentionResult> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function finish(result: IntentionResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      controller.abort();
      resolve(result);
    }
    function cancel() {
      finish(failure("CANCELLED", "Request cancelled."));
    }

    if (options.signal?.aborted) {
      cancel();
      return;
    }
    options.signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      finish(failure("TIMEOUT", "This is taking too long. Please try again."));
    }, options.timeoutMs ?? 15_000);

    // Catch rejected promises and synchronous provider failures alike.
    void Promise.resolve().then(() => {
      if (!settled) {
        return (options.provider ?? requestServerIntentions)(request, controller.signal);
      }
    }).then((data) => {
      if (settled) return;
      finish(isResponse(data) || isOutcome(data)
        ? { data, error: null }
        : failure("INVALID_RESPONSE", "We could not load three intentions. Please try again."));
    }).catch((error) => {
      if (error instanceof ServiceError) {
        finish({ data: null, error: error.failure });
        return;
      }
      finish(failure("REQUEST_FAILED", "We could not load your intentions. Please try again."));
    });
  });
}
