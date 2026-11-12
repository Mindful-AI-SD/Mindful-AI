import { withSupabase } from "@supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createClaudeAdapter, resolveClaudeConfig } from "../_shared/providers/claudeAdapter.ts";
import { resolveProviderName } from "../_shared/providers/providerSelector.ts";
import { weekThreeAuditPrompt } from "../_shared/prompts/activityPrompts.ts";
import { ProviderNotConfiguredError, ProviderTimeoutError } from "../_shared/providers/types.ts";
import { collectStudentText, containsCrisisLanguage, CRISIS_SUPPORT_RESPONSE } from "../_shared/crisisSupport.ts";
import {
  type ClaimModelRequest,
  RequestQuotaExceededError,
  requestQuotaClaimer,
  RequestQuotaUnavailableError,
} from "../_shared/providers/requestQuota.ts";
import { requestSchema, readAssignments, type AuditRequest } from "./contract.ts";
import { runOnce } from "./run-once.ts";

const UNAVAILABLE = "The selected mode is unavailable. Your entries remain saved; retry or choose prewritten.";
const RATE_LIMITED = "You have reached today's limit for live AI. Your entries remain saved; choose prewritten or try again tomorrow.";
const unavailable = (status: number) => Response.json({ message: status === 429 ? RATE_LIMITED : UNAVAILABLE }, { status });
function configured() { return resolveProviderName() === "claude" && !!resolveClaudeConfig().apiKey && !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); }

type StructuredCall = ReturnType<typeof createClaudeAdapter>["generateStructured"];
const adapter = createClaudeAdapter();

// Same controls as every Claude route: the shared prompt module and version,
// one deadline, stop-reason and schema checks, refusal handling, and the
// metadata-only ai_usage log. SDK retries stay off because the ledger below
// already decides when a request may be billed again.
export async function categorize(request: AuditRequest, call: StructuredCall = adapter.generateStructured) {
  const result = await call("week_three_audit", weekThreeAuditPrompt(request.events), (value) => readAssignments(request, value), { maxRetries: 0 });
  return { provider: "claude", ...result };
}

export function failureStatus(error: unknown): number {
  if (error instanceof RequestQuotaExceededError) return 429;
  if (error instanceof RequestQuotaUnavailableError) return 503;
  if (error instanceof ProviderTimeoutError) return 408;
  if (error instanceof ProviderNotConfiguredError) return 501;
  return 502;
}

// Injection is server-side only, for testing without a model or database.
export function createWeekThreeAuditHandler(overrides: { claim?: ClaimModelRequest; categorize?: typeof categorize } = {}) {
  return withSupabase({ auth: "user" }, async (req, ctx) => {
    if (!ctx.userClaims?.id) return unavailable(401);
    try {
      if (req.method === "GET") return Response.json({ available: configured() });
      if (req.method !== "POST") return unavailable(405);
      const body = await req.json().catch(() => null);
      // Crisis language gets the fixed support response before validation and
      // before any provider, as on every route that accepts student text.
      if (containsCrisisLanguage(collectStudentText((body as { events?: unknown } | null)?.events))) {
        return Response.json(CRISIS_SUPPORT_RESPONSE);
      }
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) return unavailable(400);
      if (!configured()) return unavailable(501);
      const input = parsed.data;
      const { data: activity, error: activityError } = await ctx.supabase.from("activities").select("id,weeks!inner(week_number,is_published)").eq("id", input.activityId).eq("is_published", true).maybeSingle();
      const row = activity as unknown as { weeks: { week_number: number; is_published: boolean } } | null;
      if (activityError || row?.weeks.week_number !== 3 || !row.weeks.is_published) return unavailable(404);
      // Published earlier-week activities must have real saved completion.
      for (const number of [1, 2]) {
        const { data: week } = await ctx.supabase.from("weeks").select("id").eq("week_number", number).eq("is_published", true).maybeSingle();
        if (!week) return unavailable(403);
        const { data: activities, error } = await ctx.supabase.from("activities").select("id").eq("week_id", week.id).eq("is_published", true);
        if (error || !activities?.length) return unavailable(403);
        const { data: progress, error: readError } = await ctx.supabase.from("progress").select("activity_id,status,completed_at").eq("user_id", ctx.userClaims.id).in("activity_id", activities.map(item => item.id));
        if (readError || !activities.every(item => progress?.some(saved => saved.activity_id === item.id && saved.status === "completed" && saved.completed_at))) return unavailable(403);
      }
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ activityId: input.activityId, events: input.events }))))].map(value => value.toString(16).padStart(2, "0")).join("");
      const owner = ctx.userClaims.id;
      // Counted against the student's own session, only when the ledger decides
      // a new model call is due: a replayed receipt costs nothing and is not counted.
      const claim = overrides.claim ?? requestQuotaClaimer(ctx.supabase);
      const run = overrides.categorize ?? categorize;
      const outcome = await runOnce(digest, {
        async claim() { const { error } = await admin.from("week_three_audit_requests").insert({ user_id: owner, operation_id: input.operationId, activity_id: input.activityId, input_digest: digest, status: "processing" }); return !error; },
        async read() { const { data } = await admin.from("week_three_audit_requests").select("input_digest,status,result,error_status").eq("user_id", owner).eq("operation_id", input.operationId).maybeSingle(); return data; },
        async succeed(result) { const { error } = await admin.from("week_three_audit_requests").update({ status: "succeeded", result }).eq("user_id", owner).eq("operation_id", input.operationId); return !error; },
        async fail(status) { await admin.from("week_three_audit_requests").update({ status: "failed", error_status: status }).eq("user_id", owner).eq("operation_id", input.operationId); },
      }, async () => {
        await claim();
        return await run(input);
      }, failureStatus);
      return outcome.status === 200 ? Response.json(outcome.result) : unavailable(outcome.status);
    } catch { return unavailable(503); }
  });
}

export default createWeekThreeAuditHandler();
