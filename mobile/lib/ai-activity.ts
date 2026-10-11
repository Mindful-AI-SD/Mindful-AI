import type { Intention } from "./intention";
import { supabase } from "./supabase";

// Client for the general `ai-activity` Edge Function: one authenticated
// request and response contract for every AI lab. Mirrors
// supabase/schema/aiActivitySchema.ts.

export type SensationItem = {
  original: string;
  isVague: boolean;
  suggestions: string[];
};

export type AiActivityInputs = {
  intention_mirror: { reflection: string };
  sensation_lexicon: { sensations: [string, string, string] };
};

export type AiActivityResults = {
  intention_mirror: { intentions: [Intention, Intention, Intention] };
  sensation_lexicon: { items: [SensationItem, SensationItem, SensationItem] };
};

export type AiActivityKind = keyof AiActivityInputs;

export type AiActivityRequest<K extends AiActivityKind> = {
  activityId: string;
  activityContext: string;
  input: AiActivityInputs[K];
};

export type SupportResource = { name: string; contact: string };

// "result" is the normal answer. "support" is the server's fixed response to
// crisis language: show its message and resources and do not continue the lab.
export type AiActivityData<K extends AiActivityKind> =
  | {
    outcome: "result";
    kind: K;
    provider: string;
    result: AiActivityResults[K];
  }
  | { outcome: "support"; message: string; resources: SupportResource[] };

export type AiActivityError = {
  code:
    | "TIMEOUT"
    | "CANCELLED"
    | "AUTH_REQUIRED"
    | "INVALID_INPUT"
    | "NETWORK_ERROR"
    | "REQUEST_FAILED"
    | "INVALID_RESPONSE";
  message: string;
  status: number | null;
};

export type AiActivityResult<K extends AiActivityKind> =
  | { data: AiActivityData<K>; error: null }
  | { data: null; error: AiActivityError };

export type AiActivityTransport = (
  body: unknown,
  signal: AbortSignal,
) => Promise<unknown>;

// Thrown by a transport when the request did not succeed. A null status means
// the server was never reached.
export class AiActivityTransportError extends Error {
  status: number | null;

  constructor(status: number | null) {
    // Never carries server text or anything the student typed.
    super("AI activity request failed");
    this.status = status;
  }
}

type Fields = Record<string, unknown>;

function failure(
  code: AiActivityError["code"],
  message: string,
  status: number | null = null,
): { data: null; error: AiActivityError } {
  return { data: null, error: { code, message, status } };
}

const unavailable = "We could not load this activity. Please try again.";

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.trim().length <= max;
}

function isFields(value: unknown): value is Fields {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Fields, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => actual.includes(key));
}

// The server trims student text and, where it echoes it, echoes the trimmed
// form, so the same trimming happens here before sending and comparing.
const normalizers: {
  [K in AiActivityKind]: (input: AiActivityInputs[K]) => AiActivityInputs[K];
} = {
  intention_mirror: (input) => ({ reflection: input.reflection.trim() }),
  sensation_lexicon: (input) => ({
    sensations: input.sensations.map((sensation) => sensation.trim()) as [
      string,
      string,
      string,
    ],
  }),
};

const readers: {
  [K in AiActivityKind]: (
    result: Fields,
    input: AiActivityInputs[K],
  ) => AiActivityResults[K] | null;
} = {
  intention_mirror(result) {
    if (
      !hasOnlyKeys(result, ["intentions"]) ||
      !Array.isArray(result.intentions) || result.intentions.length !== 3
    ) return null;
    const intentions: Intention[] = [];
    for (const entry of result.intentions) {
      if (
        !isFields(entry) || !hasOnlyKeys(entry, ["title", "explanation"]) ||
        !isText(entry.title, 120) || !isText(entry.explanation, 1000)
      ) return null;
      intentions.push({ title: entry.title, explanation: entry.explanation });
    }
    return { intentions: intentions as [Intention, Intention, Intention] };
  },
  // Includes the check that the items answer the sensations that were sent.
  sensation_lexicon(result, input) {
    if (
      !hasOnlyKeys(result, ["items"]) || !Array.isArray(result.items) ||
      result.items.length !== 3
    ) return null;
    const items: SensationItem[] = [];
    for (const [index, entry] of result.items.entries()) {
      if (
        !isFields(entry) ||
        !hasOnlyKeys(entry, ["original", "isVague", "suggestions"]) ||
        typeof entry.original !== "string" ||
        entry.original !== input.sensations[index] ||
        typeof entry.isVague !== "boolean" ||
        !Array.isArray(entry.suggestions) || entry.suggestions.length > 5 ||
        entry.isVague !== (entry.suggestions.length > 0) ||
        !entry.suggestions.every((suggestion) => isText(suggestion, 40))
      ) return null;
      const suggestions = entry.suggestions as string[];
      const offered = suggestions.map((suggestion) => suggestion.toLowerCase());
      if (
        offered.includes(entry.original.toLowerCase()) ||
        new Set(offered).size !== offered.length
      ) return null;
      items.push({
        original: entry.original,
        isVague: entry.isVague,
        suggestions: [...suggestions],
      });
    }
    return { items: items as [SensationItem, SensationItem, SensationItem] };
  },
};

function readSupport(value: Fields): AiActivityData<never> | null {
  if (
    !hasOnlyKeys(value, ["outcome", "message", "resources"]) ||
    value.outcome !== "support" || !isText(value.message, 1000) ||
    !Array.isArray(value.resources) || value.resources.length === 0
  ) return null;
  const resources: SupportResource[] = [];
  for (const entry of value.resources) {
    if (
      !isFields(entry) || !hasOnlyKeys(entry, ["name", "contact"]) ||
      !isText(entry.name, 200) || !isText(entry.contact, 200)
    ) return null;
    resources.push({ name: entry.name, contact: entry.contact });
  }
  return { outcome: "support", message: value.message, resources };
}

function readResponse<K extends AiActivityKind>(
  kind: K,
  input: AiActivityInputs[K],
  value: unknown,
): AiActivityData<K> | null {
  if (!isFields(value)) return null;
  if ("outcome" in value) return readSupport(value);
  if (
    !hasOnlyKeys(value, ["kind", "provider", "result"]) ||
    value.kind !== kind || !isText(value.provider, 50) ||
    !isFields(value.result)
  ) return null;
  const result = readers[kind](value.result, input);
  return result && {
    outcome: "result",
    kind,
    provider: value.provider,
    result,
  };
}

function transportFailure(
  error: unknown,
): { data: null; error: AiActivityError } {
  if (!(error instanceof AiActivityTransportError)) {
    return failure("REQUEST_FAILED", unavailable);
  }
  const { status } = error;
  if (status === null) {
    return failure("NETWORK_ERROR", "Check your connection and try again.");
  }
  if (status === 401) {
    return failure("AUTH_REQUIRED", "Sign in again to continue.", status);
  }
  if (status === 400) {
    return failure(
      "INVALID_INPUT",
      "Check what you wrote and try again.",
      status,
    );
  }
  if (status === 408) {
    return failure(
      "TIMEOUT",
      "This is taking too long. Please try again.",
      status,
    );
  }
  return failure("REQUEST_FAILED", unavailable, status);
}

// Calls the authenticated Edge Function. The signed-in user's session supplies
// the token; no user ID and no provider key is ever sent from the app.
export async function requestAiActivity(
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || !auth.session) throw new AiActivityTransportError(401);

  const { data, error } = await supabase.functions.invoke("ai-activity", {
    body: body as Fields,
    signal,
  });
  if (error) {
    const status = (error as { context?: { status?: unknown } }).context
      ?.status;
    throw new AiActivityTransportError(
      typeof status === "number" ? status : null,
    );
  }
  return data;
}

export function getAiActivity<K extends AiActivityKind>(
  kind: K,
  request: AiActivityRequest<K>,
  options: {
    signal?: AbortSignal;
    transport?: AiActivityTransport;
    timeoutMs?: number;
  } = {},
): Promise<AiActivityResult<K>> {
  const input = normalizers[kind](request.input);
  const body = {
    kind,
    activityId: request.activityId,
    activityContext: request.activityContext,
    input,
  };

  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function finish(result: AiActivityResult<K>) {
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

    // Catch rejected promises and synchronous transport failures alike.
    void Promise.resolve().then(() => {
      if (!settled) {
        return (options.transport ?? requestAiActivity)(
          body,
          controller.signal,
        );
      }
    }).then((value) => {
      if (settled) return;
      const data = readResponse(kind, input, value);
      finish(
        data
          ? { data, error: null }
          : failure("INVALID_RESPONSE", unavailable),
      );
    }).catch((error) => {
      finish(transportFailure(error));
    });
  });
}
