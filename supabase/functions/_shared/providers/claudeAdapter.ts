import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  distractionAuditInputSchema,
} from "../../../schema/distractionAuditSchema.ts";
import {
  guidedReflectionResponseSchema,
  guidedReflectionSchema,
} from "../../../schema/guidedReflectionSchema.ts";
import {
  sensationLexiconMatchesRequest,
  sensationLexiconResponseSchema,
  sensationLexiconSchema,
} from "../../../schema/sensationLexiconSchema.ts";
import {
  type ActivityPrompt,
  distractionAuditPrompt,
  intentionMirrorPrompt,
  PROMPT_VERSION,
  sensationLexiconPrompt,
} from "../prompts/activityPrompts.ts";
import {
  type AiActivityKind,
  type DistractionAuditProvider,
  type GuidedReflectionProvider,
  ProviderError,
  ProviderNotConfiguredError,
  type ProviderResponse,
  ProviderTimeoutError,
  type SensationLexiconProvider,
  type SensationLexiconResponse,
} from "./types.ts";

export const CLAUDE_PROVIDER_NAME = "claude";
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_MAX_TIMEOUT_MS = 14_000;
export const DEFAULT_DAILY_REQUEST_LIMIT = 30;
export const MAX_DAILY_REQUEST_LIMIT = 500;

const EFFORT_LEVELS = ["low", "medium", "high"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

export type ClaudeConfig = {
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  effort: Effort;
  maxOutputTokens: number;
  refusalFallback: boolean;
  // Model requests one student may start per UTC day, on every Claude route.
  dailyRequestLimit: number;
};

type ReadEnv = (name: string) => string | undefined;
const readDenoEnv: ReadEnv = (name) => Deno.env.get(name);

// Warnings name the setting, never its value.
function boundedInteger(
  read: ReadEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = read(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.warn(`Ignoring out-of-range setting ${name}; using the default.`);
    return fallback;
  }
  return value;
}

export function resolveClaudeConfig(read: ReadEnv = readDenoEnv): ClaudeConfig {
  const apiKey = read("ANTHROPIC_API_KEY")?.trim();
  const effort = read("CLAUDE_EFFORT");
  if (effort !== undefined && !EFFORT_LEVELS.includes(effort as Effort)) {
    console.warn(
      "Ignoring out-of-range setting CLAUDE_EFFORT; using the default.",
    );
  }
  return {
    apiKey: apiKey ? apiKey : null,
    model: read("CLAUDE_MODEL")?.trim() || DEFAULT_CLAUDE_MODEL,
    timeoutMs: boundedInteger(
      read,
      "CLAUDE_TIMEOUT_MS",
      12_000,
      1_000,
      CLAUDE_MAX_TIMEOUT_MS,
    ),
    maxRetries: boundedInteger(read, "CLAUDE_MAX_RETRIES", 1, 0, 2),
    effort: EFFORT_LEVELS.includes(effort as Effort) ? effort as Effort : "low",
    maxOutputTokens: boundedInteger(
      read,
      "CLAUDE_MAX_OUTPUT_TOKENS",
      16_000,
      256,
      16_000,
    ),
    refusalFallback: read("CLAUDE_REFUSAL_FALLBACK") !== "off",
    dailyRequestLimit: boundedInteger(
      read,
      "CLAUDE_DAILY_REQUEST_LIMIT",
      DEFAULT_DAILY_REQUEST_LIMIT,
      1,
      MAX_DAILY_REQUEST_LIMIT,
    ),
  };
}

// One log line per call. Only metadata: never student text, model output,
// prompts, API error messages, or keys.
// Every Claude route logs under its own kind. week_three_audit is the separate
// Week 3 route; the others are ai-activity kinds.
export type ClaudeCallKind = AiActivityKind | "week_three_audit";

export type ClaudeCallRecord = {
  event: "ai_usage" | "ai_provider_failure";
  provider: typeof CLAUDE_PROVIDER_NAME;
  kind: ClaudeCallKind;
  promptVersion: string;
  requestedModel: string;
  servedModel: string | null;
  requestId: string | null;
  latencyMs: number;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  failure: string | null;
  httpStatus: number | null;
};

export type StructuredCallOptions = {
  // A route that keeps its own billing ledger can turn SDK retries off.
  maxRetries?: number;
};

export type ClaudeAdapterOptions = {
  readEnv?: ReadEnv;
  fetch?: typeof globalThis.fetch;
  record?: (record: ClaudeCallRecord) => void;
  now?: () => number;
};

const NOT_CONFIGURED =
  "The Claude provider is not configured. Set ANTHROPIC_API_KEY and a model available to the account.";
const UNAVAILABLE = "The Claude provider could not complete this request.";
const INVALID_OUTPUT = "The Claude provider returned an invalid response.";
const TIMED_OUT = "The Claude provider timed out.";

class OutputRejected extends ProviderError {
  readonly reason: string;
  constructor(reason: string) {
    super(INVALID_OUTPUT);
    this.reason = reason;
  }
}

type Failure = { error: Error; failure: string; httpStatus: number | null };

// Most specific first. Errors thrown from here carry fixed text only, so no
// provider message can reach a student or a log line.
function classifyFailure(error: unknown, deadlinePassed: boolean): Failure {
  if (
    deadlinePassed || error instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return {
      error: new ProviderTimeoutError(TIMED_OUT),
      failure: "timeout",
      httpStatus: null,
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return {
      error: new ProviderError(UNAVAILABLE),
      failure: "connection",
      httpStatus: null,
    };
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : null;
    // Retrying cannot fix these: an operator has to change the configuration.
    if (status === 401 || status === 402 || status === 403 || status === 404) {
      return {
        error: new ProviderNotConfiguredError(NOT_CONFIGURED),
        failure: "account_or_model",
        httpStatus: status,
      };
    }
    return {
      error: new ProviderError(UNAVAILABLE),
      failure: status === 429 ? "rate_limited" : "api_error",
      httpStatus: status,
    };
  }
  return {
    error: new ProviderError(UNAVAILABLE),
    failure: "unexpected",
    httpStatus: null,
  };
}

const intentionOutputSchema = z.object({
  intentions: guidedReflectionResponseSchema.shape.intentions,
}).strict();

const lexiconOutputSchema = z.object({
  items: z.array(
    z.object({ isVague: z.boolean(), suggestions: z.array(z.string()) })
      .strict(),
  ).length(3),
}).strict();

const auditOutputSchema = z.object({
  assignments: z.array(
    z.object({ eventId: z.string(), category: z.string().nullable() }).strict(),
  ),
}).strict();

// Words a mindfulness companion must not use about a student. A guardrail for
// the free text in intentions, on top of the prompt, not a replacement for
// reviewing output.
const CLINICAL_LANGUAGE =
  /\b(?:diagnos\w*|disorders?|(?<!non-)clinical(?:ly)?|symptoms?|treatments?|therap(?:y|ies|ists?|eutic)|medications?|depress(?:ed|ive|ion)|adhd|ptsd)\b/i;

function parseOutput<T>(
  text: string,
  read: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OutputRejected("invalid_json");
  }
  try {
    return read(value);
  } catch (error) {
    if (error instanceof OutputRejected) throw error;
    throw new OutputRejected("schema_mismatch");
  }
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}) {
  const readEnv = options.readEnv ?? readDenoEnv;
  const now = options.now ?? Date.now;
  const record = options.record ?? ((entry: ClaudeCallRecord) => {
    console.info(JSON.stringify(entry));
  });

  async function call<T>(
    kind: ClaudeCallKind,
    prompt: ActivityPrompt,
    read: (value: unknown) => T,
    callOptions: StructuredCallOptions = {},
  ): Promise<T> {
    const config = resolveClaudeConfig(readEnv);
    const startedAt = now();
    const report = (
      fields:
        & Pick<ClaudeCallRecord, "event" | "failure" | "httpStatus">
        & Partial<ClaudeCallRecord>,
    ) =>
      record({
        provider: CLAUDE_PROVIDER_NAME,
        kind,
        promptVersion: PROMPT_VERSION,
        requestedModel: config.model,
        servedModel: null,
        requestId: null,
        latencyMs: now() - startedAt,
        stopReason: null,
        inputTokens: null,
        outputTokens: null,
        ...fields,
      });

    if (!config.apiKey) {
      report({
        event: "ai_provider_failure",
        failure: "missing_api_key",
        httpStatus: null,
      });
      throw new ProviderNotConfiguredError(NOT_CONFIGURED);
    }

    // authToken: null stops the SDK from preferring any other credential in the
    // environment; this adapter only ever uses the server secret.
    const client = new Anthropic({
      apiKey: config.apiKey,
      authToken: null,
      maxRetries: callOptions.maxRetries ?? config.maxRetries,
      timeout: config.timeoutMs,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });

    // One deadline across every attempt and backoff. Aborting also stops any
    // in-flight request, so a slow call does not keep spending.
    const controller = new AbortController();
    let deadlinePassed = false;
    const timer = setTimeout(() => {
      deadlinePassed = true;
      controller.abort();
    }, config.timeoutMs);

    let message;
    try {
      message = await client.beta.messages.create(
        {
          model: config.model,
          max_tokens: Math.min(prompt.maxOutputTokens, config.maxOutputTokens),
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          thinking: { type: "adaptive" },
          output_config: {
            effort: config.effort,
            format: { type: "json_schema", schema: prompt.outputSchema },
          },
          ...(config.refusalFallback
            ? {
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default" as const,
            }
            : {}),
        },
        { signal: controller.signal },
      );
    } catch (error) {
      const failure = classifyFailure(error, deadlinePassed);
      report({
        event: "ai_provider_failure",
        failure: failure.failure,
        httpStatus: failure.httpStatus,
        requestId: error instanceof Anthropic.APIError
          ? error.requestID ?? null
          : null,
      });
      throw failure.error;
    } finally {
      clearTimeout(timer);
    }

    const measured = {
      servedModel: message.model,
      requestId: message._request_id ?? null,
      stopReason: message.stop_reason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      httpStatus: 200,
    };

    try {
      if (message.stop_reason !== "end_turn") {
        throw new OutputRejected(
          message.stop_reason === "refusal"
            ? "refusal"
            : message.stop_reason === "max_tokens"
            ? "truncated"
            : "unexpected_stop",
        );
      }
      // Blocks are selected by type: a response can begin with thinking blocks.
      const text = message.content
        .flatMap((block) => block.type === "text" ? [block.text] : [])
        .join("");
      const output = parseOutput(text, read);
      report({ event: "ai_usage", failure: null, ...measured });
      return output;
    } catch (error) {
      // Tokens were still spent on a rejected response, so they are recorded.
      report({
        event: "ai_provider_failure",
        failure: error instanceof OutputRejected ? error.reason : "unexpected",
        ...measured,
      });
      throw error instanceof ProviderError
        ? error
        : new ProviderError(INVALID_OUTPUT);
    }
  }

  const generateGuidedReflection: GuidedReflectionProvider = async (
    _activityContext,
    userReflection,
  ) => {
    const reflection = guidedReflectionSchema.shape.userReflection.safeParse(
      userReflection,
    );
    if (!reflection.success) throw new ProviderError(UNAVAILABLE);

    const intentions = await call(
      "intention_mirror",
      intentionMirrorPrompt(reflection.data),
      (value) => {
        const output = intentionOutputSchema.parse(value);
        if (
          output.intentions.some(({ title, explanation }) =>
            CLINICAL_LANGUAGE.test(`${title} ${explanation}`)
          )
        ) throw new OutputRejected("clinical_language");
        return output.intentions as ProviderResponse["intentions"];
      },
    );
    return { intentions, provider: CLAUDE_PROVIDER_NAME };
  };

  const generateSensationLexicon: SensationLexiconProvider = async (
    _activityContext,
    sensations,
  ) => {
    const requested = sensationLexiconSchema.shape.sensations.safeParse(
      sensations,
    );
    if (!requested.success) throw new ProviderError(UNAVAILABLE);
    const trimmed = requested.data;

    const items = await call(
      "sensation_lexicon",
      sensationLexiconPrompt(trimmed),
      (value) => {
        const output = lexiconOutputSchema.parse(value);
        // `original` always comes from the request: an altered echo from the
        // model must not be shown back to the student as their own words.
        const response = sensationLexiconResponseSchema.parse({
          provider: CLAUDE_PROVIDER_NAME,
          items: output.items.map((item, index) => ({
            original: trimmed[index],
            ...item,
          })),
        });
        if (!sensationLexiconMatchesRequest(trimmed, response)) {
          throw new OutputRejected("mismatched_request");
        }
        return response.items as SensationLexiconResponse["items"];
      },
    );
    return { items, provider: CLAUDE_PROVIDER_NAME };
  };

  const generateDistractionAudit: DistractionAuditProvider = async (
    _activityContext,
    events,
  ) => {
    const requested = distractionAuditInputSchema.safeParse({ events });
    if (!requested.success) throw new ProviderError(UNAVAILABLE);

    const assignments = await call(
      "distraction_audit",
      distractionAuditPrompt(requested.data.events),
      (value) => {
        const output = auditOutputSchema.parse(value);
        const byId = new Map(
          output.assignments.map((entry) => [entry.eventId, entry.category]),
        );
        // Each event exactly once, nothing extra. Category names are checked by
        // summarizeDistractionAudit, which also does all of the arithmetic.
        if (
          byId.size !== output.assignments.length ||
          byId.size !== events.length ||
          events.some((event) => !byId.has(event.id))
        ) throw new OutputRejected("mismatched_request");
        return events.map((event) => ({
          eventId: event.id,
          category: byId.get(event.id) ?? null,
        })) as Awaited<
          ReturnType<DistractionAuditProvider>
        >["assignments"];
      },
    );
    return { assignments, provider: CLAUDE_PROVIDER_NAME };
  };

  return {
    generateGuidedReflection,
    generateSensationLexicon,
    generateDistractionAudit,
    // For a Claude route outside ai-activity: the same deadline, stop-reason
    // and schema checks, refusal handling, and usage log as every activity.
    generateStructured: call,
  };
}

const adapter = createClaudeAdapter();

export const generateClaudeGuidedReflection = adapter.generateGuidedReflection;
export const generateClaudeSensationLexicon = adapter.generateSensationLexicon;
export const generateClaudeDistractionAudit = adapter.generateDistractionAudit;
