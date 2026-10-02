import { z } from "zod";
import { getReflectionOutcome } from "./reflectionPolicy.ts";
import {
  extractDevScenarioOverride,
  generateMockGuidedReflection,
  resolveMockScenario,
  resolveMockTimingConfig,
} from "../_shared/providers/mockProviderAdapter.ts";
import {
  ProviderError,
  ProviderNotConfiguredError,
  ProviderTimeoutError,
} from "../_shared/providers/types.ts";
import {
  getGuidedReflectionProvider,
  resolveProviderName,
} from "../_shared/providers/providerSelector.ts";

const guidedReflectionSchema = z.object({
  activityId: z.uuid(),
  activityContext: z.string().trim().min(1).max(4000),
  userReflection: z.string().trim().min(3).max(2000),
}).strict();

import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 },
      );
    }

    let requestBody: unknown;

    try {
      requestBody = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const rawReflection = requestBody && typeof requestBody === "object" &&
        !Array.isArray(requestBody) && "userReflection" in requestBody &&
        typeof requestBody.userReflection === "string"
      ? requestBody.userReflection
      : undefined;
    const reflectionOutcome = rawReflection === undefined
      ? undefined
      : getReflectionOutcome(rawReflection);

    if (reflectionOutcome?.validation === "reject") {
      return Response.json(reflectionOutcome.result.body, {
        status: reflectionOutcome.result.status,
      });
    }

    // devMockScenario is a development-only fixture (see resolveMockScenario)
    // and is stripped before schema validation so it never appears as a
    // production-facing request field, regardless of whether the override
    // is actually enabled server-side.
    const { override: devScenarioOverride, sanitizedBody } =
      extractDevScenarioOverride(requestBody);

    const validationResult = guidedReflectionSchema.safeParse(sanitizedBody);

    if (!validationResult.success) {
      return Response.json(
        {
          error: "INVALID_GUIDED_REFLECTION",
          message: "The guided reflection request is invalid",
        },
        { status: 400 },
      );
    }

    if (!reflectionOutcome || reflectionOutcome.validation !== "accept") {
      return Response.json(
        {
          error: "INVALID_GUIDED_REFLECTION",
          message: "The guided reflection request is invalid",
        },
        { status: 400 },
      );
    }

    const { activityId, activityContext, userReflection } =
      validationResult.data;

    const { data: activity, error: activityError } = await ctx.supabase
      .from("activities")
      .select("id")
      .eq("id", activityId)
      .eq("is_published", true)
      .maybeSingle();

    if (activityError) {
      console.error("Could not validate activity:", activityError.message);

      return Response.json(
        { error: "Could not validate the activity" },
        { status: 500 },
      );
    }

    if (!activity) {
      return Response.json(
        { error: "Published activity not found" },
        { status: 404 },
      );
    }

    const userId = ctx.userClaims?.id;

    if (!userId) {
      return Response.json(
        { error: "Authenticated user not found" },
        { status: 401 },
      );
    }

    const providerName = resolveProviderName();

    let providerResponse;

    try {
      if (providerName === "mock") {
        // The scenario/timing fixtures only make sense for the mock
        // provider; other providers use the plain two-argument interface.
        providerResponse = await generateMockGuidedReflection(
          activityContext,
          userReflection,
          resolveMockScenario(devScenarioOverride),
          resolveMockTimingConfig(),
        );
      } else {
        const provider = getGuidedReflectionProvider(providerName);
        providerResponse = await provider(activityContext, userReflection);
      }
    } catch (error) {
      if (error instanceof ProviderTimeoutError) {
        console.error("Provider timed out:", error.message);

        return Response.json(
          { error: error.code, message: error.message },
          { status: 504 },
        );
      }

      if (error instanceof ProviderNotConfiguredError) {
        console.error("Provider is not configured:", error.message);

        return Response.json(
          { error: error.code, message: error.message },
          { status: 501 },
        );
      }

      if (error instanceof ProviderError) {
        console.error("Provider returned an error:", error.message);

        return Response.json(
          { error: error.code, message: error.message },
          { status: 502 },
        );
      }

      throw error;
    }

    const { data: session, error: sessionError } = await ctx.supabase
      .from("ai_sessions")
      .insert({
        user_id: userId,
        activity_id: activityId,
        message_count: 2,
        ended_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (sessionError) {
      console.error("Could not create AI session:", sessionError.message);

      return Response.json(
        { error: "Could not create the reflection session" },
        { status: 500 },
      );
    }

    return Response.json({
      sessionId: session.id,
      ...providerResponse,
    });
  }),
};
