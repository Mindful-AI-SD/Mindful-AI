import { withSupabase } from "npm:@supabase/server@1";

type GuidedReflectionRequest = {
  activityId?: unknown;
  reflection?: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 },
      );
    }

    let requestBody: GuidedReflectionRequest;

    try {
      requestBody = await req.json();
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    const activityId =
      typeof requestBody.activityId === "string"
        ? requestBody.activityId.trim()
        : "";

    const reflection =
      typeof requestBody.reflection === "string"
        ? requestBody.reflection.trim()
        : "";

    if (!uuidPattern.test(activityId)) {
      return Response.json(
        { error: "A valid activityId is required" },
        { status: 400 },
      );
    }

    if (reflection.length < 3 || reflection.length > 2000) {
      return Response.json(
        { error: "Reflection must contain between 3 and 2000 characters" },
        { status: 400 },
      );
    }

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