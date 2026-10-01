import { withSupabase } from "@supabase/server";
import {
  type GuidedReflectionRequest,
  type GuidedReflectionResponse,
  guidedReflectionResponseSchema,
  guidedReflectionSchema,
} from "../../schema/guidedReflectionSchema.ts";
import {
  generateMockGuidedReflection,
  resolveMockScenario,
  resolveMockTimingConfig,
} from "../_shared/providers/mockProviderAdapter.ts";
import { ProviderTimeoutError } from "../_shared/providers/types.ts";

export type MindfulnessResponseRequest = GuidedReflectionRequest;
export type MindfulnessResponse = GuidedReflectionResponse;

type Provider = (context: string, reflection: string) => Promise<unknown>;
const errors = {
  400: {
    error: "INVALID_INPUT",
    message: "The mindfulness request is invalid.",
  },
  401: { error: "AUTH_REQUIRED", message: "Sign in to request intentions." },
  408: {
    error: "PROVIDER_TIMEOUT",
    message: "The provider timed out. Please try again.",
  },
  502: {
    error: "PROVIDER_ERROR",
    message: "Intentions are unavailable. Please try again.",
  },
} as const;

function failure(status: keyof typeof errors, headers?: Headers): Response {
  return Response.json(errors[status], { status, headers });
}

const mockProvider: Provider = (context, reflection) =>
  generateMockGuidedReflection(
    context,
    reflection,
    resolveMockScenario(),
    resolveMockTimingConfig(),
  );

// Injection is server-side only, for testing failures without replacing the adapter.
export function createMindfulnessEndpoint(
  provider: Provider = mockProvider,
  timeoutMs = 5000,
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
    const input = guidedReflectionSchema.safeParse(body);
    if (!input.success) return failure(400);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          provider(input.data.activityContext, input.data.userReflection)
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ProviderTimeoutError("Deadline exceeded")),
            timeoutMs,
          );
        }),
      ]);
      const output = guidedReflectionResponseSchema.safeParse(result);
      if (!output.success) return failure(502);
      return Response.json(output.data);
    } catch (error) {
      return failure(error instanceof ProviderTimeoutError ? 408 : 502);
    } finally {
      clearTimeout(timer);
    }
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

export default createMindfulnessEndpoint();
