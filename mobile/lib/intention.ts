import { requestMockIntentions } from "./intention-mock";

export type IntentionRequest = {
  activityId: string;
  activityContext: string;
  userReflection: string;
};

export type Intention = { title: string; explanation: string };

// Matches supabase/schema/guidedReflectionSchema.ts's mock response.
export type IntentionResponse = {
  intentions: [Intention, Intention, Intention];
  provider: "mock";
};

export type IntentionError = {
  code:
    | "TIMEOUT"
    | "CANCELLED"
    | "AUTH_REQUIRED"
    | "NETWORK_ERROR"
    | "REQUEST_FAILED"
    | "INVALID_RESPONSE";
  message: string;
  status: number | null;
};

export type IntentionResult =
  | { data: IntentionResponse; error: null }
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
  return data.provider === "mock" &&
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

/** Uses a local mock provider; no confirmed remote endpoint exists yet. */
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
        return (options.provider ?? requestMockIntentions)(request, controller.signal);
      }
    }).then((data) => {
      if (settled) return;
      finish(isResponse(data)
        ? { data, error: null }
        : failure("INVALID_RESPONSE", "We could not load three intentions. Please try again."));
    }).catch(() => {
      finish(failure("REQUEST_FAILED", "We could not load your intentions. Please try again."));
    });
  });
}
