import { z } from "zod";
import { type SubmissionStore, submissionStore } from "./submissions.ts";
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

const requestSchema = guidedReflectionSchema.extend({
  activityId: z.uuid(),
  submissionId: z.uuid(),
});
export type MindfulnessResponseRequest = GuidedReflectionRequest & {
  submissionId: string;
};
export type MindfulnessResponse = GuidedReflectionResponse;

type Provider = (context: string, reflection: string) => Promise<unknown>;
const errors = {
  400: {
    error: "INVALID_INPUT",
    message: "The mindfulness request is invalid.",
  },
  401: { error: "AUTH_REQUIRED", message: "Sign in to request intentions." },
  409: {
    error: "SUBMISSION_CONFLICT",
    message:
      "Submission is in progress or the ID was reused for different input.",
  },
  503: {
    error: "PERSISTENCE_UNAVAILABLE",
    message: "Could not save intentions. Retry with the same submission ID.",
  },
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
  storeOverride?: SubmissionStore,
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
    const input = requestSchema.safeParse(body);
    if (!input.success) return failure(400);

    const store = storeOverride ?? submissionStore(ctx.supabase);
    const { submissionId, activityId, activityContext, userReflection } =
      input.data;
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([activityId, activityContext, userReflection]),
      ),
    );
    const hash = Array.from(
      new Uint8Array(bytes),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const token = crypto.randomUUID();
    try {
      const claim = await store.claim(submissionId, activityId, hash, token);
      if (claim.status === "invalid") return failure(400);
      if (claim.status === "conflict" || claim.status === "processing") {
        return failure(409);
      }
      if (claim.status === "completed") {
        const saved = guidedReflectionResponseSchema.safeParse(claim.response);
        return saved.success ? Response.json(saved.data) : failure(503);
      }
      if (claim.status === "failed") {
        return failure(claim.failureStatus === 408 ? 408 : 502);
      }
    } catch {
      return failure(503);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let output: MindfulnessResponse;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => provider(activityContext, userReflection)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ProviderTimeoutError("Deadline exceeded")),
            timeoutMs,
          );
        }),
      ]);
      output = guidedReflectionResponseSchema.parse(result);
    } catch (error) {
      const status = error instanceof ProviderTimeoutError ? 408 : 502;
      try {
        await store.finish(submissionId, token, null, status);
      } catch {
        return failure(503);
      }
      return failure(status);
    } finally {
      clearTimeout(timer);
    }
    try {
      await store.finish(submissionId, token, output);
      return Response.json(output);
    } catch {
      // Keep the claim: never regenerate after an uncertain database commit.
      return failure(503);
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
