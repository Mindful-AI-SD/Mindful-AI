import { withSupabase } from "@supabase/server";

export type MindfulnessResponseRequest = {
  activityId: string;
  activityContext: string;
  userReflection: string;
};

export type MindfulnessResponse = {
  activityId: string;
  reply: string;
  status: "placeholder";
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ error: "Authenticated user not found" }, {
        status: 401,
      });
    }

    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON" }, {
        status: 400,
      });
    }

    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      !("activityId" in body) || typeof body.activityId !== "string" ||
      !("activityContext" in body) ||
      typeof body.activityContext !== "string" ||
      !("userReflection" in body) || typeof body.userReflection !== "string"
    ) {
      return Response.json({
        error:
          "activityId, activityContext, and userReflection must be strings",
      }, { status: 400 });
    }

    const input: MindfulnessResponseRequest = {
      activityId: body.activityId,
      activityContext: body.activityContext,
      userReflection: body.userReflection,
    };
    // Shell only: no provider call, persistence, or reflection echoing.
    const response: MindfulnessResponse = {
      activityId: input.activityId,
      reply:
        "Your reflection has been received. Mindfulness responses are coming soon.",
      status: "placeholder",
    };
    return Response.json(response);
  }),
};
