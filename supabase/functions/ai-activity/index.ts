import { withSupabase } from "@supabase/server";
import {
  aiActivityRequestSchema,
  type AiActivityResponse,
  aiActivityResponseMatchesRequest,
  aiActivityResponseSchema,
} from "../../schema/aiActivitySchema.ts";
import { runAiActivity } from "../_shared/providers/providerSelector.ts";
import {
  type AiActivityCall,
  ProviderNotConfiguredError,
  ProviderTimeoutError,
} from "../_shared/providers/types.ts";
import {
  containsCrisisLanguage,
  CRISIS_SUPPORT_RESPONSE,
} from "../_shared/crisisSupport.ts";

type Runner = (call: AiActivityCall) => Promise<unknown>;
// Resolves true when the activity exists and is published for this user.
export type ActivityLookup = (activityId: string) => Promise<boolean>;

const errors = {
  400: {
    error: "INVALID_INPUT",
    message: "The AI activity request is invalid.",
  },
  401: {
    error: "AUTH_REQUIRED",
    message: "Sign in to use this activity.",
  },
  404: {
    error: "ACTIVITY_NOT_FOUND",
    message: "This activity is not available.",
  },
  408: {
    error: "PROVIDER_TIMEOUT",
    message: "The provider timed out. Please try again.",
  },
  501: {
    error: "PROVIDER_NOT_CONFIGURED",
    message: "This activity is not available yet.",
  },
  502: {
    error: "PROVIDER_ERROR",
    message: "This activity is unavailable. Please try again.",
  },
  503: {
    error: "ACTIVITY_CHECK_UNAVAILABLE",
    message: "Could not check the activity. Please try again.",
  },
} as const;

function failure(status: keyof typeof errors, headers?: Headers): Response {
  return Response.json(errors[status], { status, headers });
}

// Every string a student may have typed, whatever the activity kind and
// however the input is nested.
function studentTexts(input: unknown): string[] {
  if (typeof input === "string") return [input];
  if (input === null || typeof input !== "object") return [];
  return Object.values(input).flatMap(studentTexts);
}

// Injection is server-side only, for testing failures without replacing the adapter.
export function createAiActivityEndpoint(
  runner: Runner = runAiActivity,
  timeoutMs = 5000,
  lookupOverride?: ActivityLookup,
) {
  const authenticated = withSupabase({ auth: "user" }, async (req, ctx) => {
    if (!ctx.userClaims?.id) return failure(401);
    if (req.method !== "POST") {
      return Response.json({
        error: "METHOD_NOT_ALLOWED",
        message: "Use POST.",
      }, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return failure(400);
    }
    // Crisis language gets the fixed support response before validation and
    // the provider, even when the request would otherwise be rejected.
    const rawInput = (body as { input?: unknown } | null)?.input;
    if (containsCrisisLanguage(studentTexts(rawInput))) {
      return Response.json(CRISIS_SUPPORT_RESPONSE);
    }
    const input = aiActivityRequestSchema.safeParse(body);
    if (!input.success) return failure(400);
    const request = input.data;

    const isPublished: ActivityLookup = lookupOverride ?? (async (id) => {
      const { data, error } = await ctx.supabase
        .from("activities")
        .select("id")
        .eq("id", id)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw new Error("Activity lookup unavailable");
      return data !== null;
    });
    try {
      if (!await isPublished(request.activityId)) return failure(404);
    } catch {
      return failure(503);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let output: AiActivityResponse;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => runner(request)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ProviderTimeoutError("Deadline exceeded")),
            timeoutMs,
          );
        }),
      ]);
      output = aiActivityResponseSchema.parse(result);
      // A well-formed answer to a different question is still a bad answer.
      if (!aiActivityResponseMatchesRequest(request, output)) {
        return failure(502);
      }
    } catch (error) {
      if (error instanceof ProviderTimeoutError) return failure(408);
      if (error instanceof ProviderNotConfiguredError) return failure(501);
      return failure(502);
    } finally {
      clearTimeout(timer);
    }
    return Response.json(output);
  });
  return {
    async fetch(req: Request): Promise<Response> {
      const response = await authenticated(req);
      // Middleware rejects unsigned requests before our handler; normalize its
      // diagnostics too, preserving CORS headers for browser callers.
      if (response.status === 401) {
        await response.body?.cancel();
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return failure(401, headers);
      }
      return response;
    },
  };
}

export default createAiActivityEndpoint();
