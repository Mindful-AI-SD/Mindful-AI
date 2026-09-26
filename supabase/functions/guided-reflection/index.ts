import { z } from "zod";

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

    const validationResult = guidedReflectionSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return Response.json(
        { error: "INVALID_GUIDED_REFLECTION", message: "The guided reflection request is invalid"},
        { status: 400 },
      );
    }

    const { activityId, userReflection } = validationResult.data;

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

    const reply =
      "Thank you for taking a moment to notice your experience. Try identifying one thought, one feeling, and one physical sensation. What changed when you observed them without judging them?";

    return Response.json({
      sessionId: session.id,
      reply,
      provider: "mock",
      model: "mindful-reflection-v0",
    });
  }),
};