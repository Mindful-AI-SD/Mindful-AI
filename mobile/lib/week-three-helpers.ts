import { supabase } from "./supabase";
import type { BeatId } from "./four-beat-curriculum";
// Client wire types mirror the existing Distraction Audit contract. No server imports.
export type DistractionEvent = { id: string; at: string; label: string };
export type DistractionAuditSummary = {
  totalEvents: number;
  categories: { category: string; count: number; percent: number }[];
  uncategorized: { count: number; percent: number };
  assignments: { eventId: string; category: string | null }[];
};

export type AuditCache = {
  contractVersion: "distraction-audit-cache/v1";
  inputEventsRevision: number;
  inputEvents: DistractionEvent[];
  provider: string;
  data: DistractionAuditSummary;
};
export type WeekThreeResume = {
  elapsedActiveMs: number;
  positionMs: number | null;
  state: "idle" | "paused";
};
export type WeekThreePatch = {
  events?: DistractionEvent[];
  currentBeat?: BeatId;
  answers?: Record<string, string>;
  resumeState?: WeekThreeResume;
  auditResult?: AuditCache;
};
export type WeekThreeWrite = {
  slug: string;
  operationId: string;
  expectedRevision: number;
  contentVersion: string;
  patch: WeekThreePatch;
};
// Explicit database projection; ownership is never supplied or returned by the RPC.
export type WeekThreeProgress = {
  activityId: string;
  contractVersion: "sprint3-storage/v1";
  contentVersion: string;
  revision: number;
  eventsRevision: number;
  status: "not_started" | "in_progress" | "completed";
  currentBeat: BeatId;
  events: DistractionEvent[];
  answers: Record<string, string>;
  resumeState: WeekThreeResume;
  auditResult: AuditCache | null;
  completionPolicyVersion: string | null;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};
const messages = {
  AUTH_REQUIRED: "Sign in to access your Week 3 progress.",
  ACCOUNT_CHANGED: "Your account changed. Reload before retrying.",
  INVALID_INPUT: "The Week 3 data is invalid.",
  ACTIVITY_NOT_AVAILABLE: "This Week 3 activity is unavailable.",
  PREREQUISITE_CONFIGURATION_UNAVAILABLE:
    "Week 3 prerequisites are not configured.",
  PREREQUISITE_NOT_MET: "Complete the required earlier activities first.",
  CONTENT_VERSION_CONFLICT:
    "This activity version changed. Reload before retrying.",
  STALE_REVISION: "Your progress changed. Reload before retrying.",
  OPERATION_CONFLICT: "This operation ID was already used for different data.",
  WEEK_THREE_IMMUTABLE: "Completed Week 3 progress cannot be changed.",
  COMPLETION_POLICY_UNAVAILABLE: "Week 3 completion is not available yet.",
  WEEK_THREE_UNAVAILABLE: "Could not access Week 3 progress. Please retry.",
} as const;
export class WeekThreeError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "WeekThreeError";
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const slug = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 100 &&
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
async function call(name: string, request: unknown): Promise<unknown> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new WeekThreeError("AUTH_REQUIRED");
    const { data, error: authError } = await supabase.auth.getUser(
      session.access_token,
    );
    if (authError || data.user?.id !== session.user.id) {
      throw new WeekThreeError("AUTH_REQUIRED");
    }
    const { data: result, error: rpcError } = await supabase.rpc(name, {
      p_request: request,
    }).setHeader("Authorization", `Bearer ${session.access_token}`);
    if (rpcError) {
      throw new WeekThreeError(
        Object.hasOwn(messages, rpcError.message)
          ? rpcError.message as keyof typeof messages
          : "WEEK_THREE_UNAVAILABLE",
      );
    }
    const { data: current, error: currentError } = await supabase.auth
      .getUser();
    if (currentError || current.user?.id !== session.user.id) {
      throw new WeekThreeError("ACCOUNT_CHANGED");
    }
    return result;
  } catch (error) {
    if (error instanceof WeekThreeError) throw error;
    throw new WeekThreeError("WEEK_THREE_UNAVAILABLE");
  }
}
export async function saveWeekThreeDraft(
  input: WeekThreeWrite,
): Promise<
  { contractVersion: "sprint3-storage/v1"; revision: number; replayed: boolean }
> {
  if (
    !object(input) || Object.keys(input).length !== 5 || !slug(input.slug) ||
    typeof input.operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.operationId,
    ) ||
    !integer(input.expectedRevision) ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER ||
    typeof input.contentVersion !== "string" || !input.contentVersion.length ||
    !object(input.patch) ||
    !Object.keys(input.patch).length ||
    Object.keys(input.patch).some((k) =>
      !["events", "currentBeat", "answers", "resumeState", "auditResult"]
        .includes(k)
    )
  ) throw new WeekThreeError("INVALID_INPUT");
  // Snapshot before awaiting authentication; omitted patch fields remain unchanged.
  let request;
  try {
    request = JSON.parse(
      JSON.stringify({ ...input, contractVersion: "sprint3-storage/v1" }),
    );
  } catch {
    throw new WeekThreeError("INVALID_INPUT");
  }
  const r = await call("save_week_three_draft", request);
  if (
    !object(r) || r.contractVersion !== "sprint3-storage/v1" ||
    !integer(r.revision) || !r.revision || typeof r.replayed !== "boolean"
  ) throw new WeekThreeError("WEEK_THREE_UNAVAILABLE");
  return r as {
    contractVersion: "sprint3-storage/v1";
    revision: number;
    replayed: boolean;
  };
}
export async function loadWeekThreeProgress(
  activitySlug: string,
): Promise<WeekThreeProgress | null> {
  if (!slug(activitySlug)) throw new WeekThreeError("INVALID_INPUT");
  const r = await call("load_week_three_progress", { slug: activitySlug });
  if (r === null) return null;
  if (
    !object(r) || r.contractVersion !== "sprint3-storage/v1" ||
    !integer(r.revision) || r.revision === 0 ||
    !Array.isArray(r.events) || !object(r.resumeState) ||
    !["idle", "paused"].includes(String(r.resumeState.state)) ||
    !integer(r.resumeState.elapsedActiveMs) ||
    !(r.resumeState.positionMs === null ||
      integer(r.resumeState.positionMs)) ||
    Object.hasOwn(r, "user_id")
  ) throw new WeekThreeError("WEEK_THREE_UNAVAILABLE");
  return r as WeekThreeProgress;
}
export async function restoreWeekThreeResume(
  activitySlug: string,
): Promise<WeekThreeResume | null> {
  return (await loadWeekThreeProgress(activitySlug))?.resumeState ?? null;
}
