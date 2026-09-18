const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default {
  fetch(req: Request): Response {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (req.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        {
          status: 405,
          headers: {
            ...corsHeaders,
            Allow: "GET",
          },
        },
      );
    }

    return Response.json(
      {
        status: "ok",
        service: "mindful-ai",
        version: "0.1.0",
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  },
};