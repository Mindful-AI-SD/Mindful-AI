import { supabase } from "./supabase";
import {
  BEAT_IDS,
  type BeatAnswers,
  type BeatId,
  isWeekBeatAnswers,
} from "./four-beat-curriculum";
import type { ProgressStatus } from "./progress";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };
export type BeatProgress = Readonly<{
  user_id: string;
  week_id: number;
  beat_id: BeatId;
  status: ProgressStatus;
  answers: BeatAnswers;
  saved_data: JsonObject;
  resume_state: JsonObject;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}>;
export type BeatProgressPatch = Partial<
  Pick<BeatProgress, "status" | "answers" | "saved_data" | "resume_state">
>;
export type BeatResumeState = Pick<
  BeatProgress,
  "beat_id" | "status" | "answers" | "saved_data" | "resume_state"
>;
const columns =
  "user_id,week_id,beat_id,status,answers,saved_data,resume_state,started_at,completed_at,updated_at";
const writable = new Set(["status", "answers", "saved_data", "resume_state"]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object Object]";
}
function json(
  value: unknown,
  parents = new Set<unknown>(),
  depth = 0,
): boolean {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (
    depth > 20 || parents.has(value) ||
    (!Array.isArray(value) && !object(value))
  ) return false;
  parents.add(value);
  const valid = Object.values(value).every((item) =>
    json(item, parents, depth + 1)
  );
  parents.delete(value);
  return valid;
}
function identity(weekId: number, beatId?: BeatId): void {
  if (!Number.isSafeInteger(weekId) || weekId <= 0) {
    throw new Error("A valid week ID is required.");
  }
  if (beatId !== undefined && !BEAT_IDS.includes(beatId)) {
    throw new Error("A canonical beat ID is required.");
  }
}
async function owner(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error("Sign in to access beat progress.");
  }
  return data.user.id;
}
async function sameOwner(userId: string): Promise<void> {
  if (await owner() !== userId) {
    throw new Error("Your account changed. Please retry.");
  }
}
function patchValues(
  patch: BeatProgressPatch,
  beatId: BeatId,
): BeatProgressPatch {
  if (!object(patch) || Object.keys(patch).some((key) => !writable.has(key))) {
    throw new Error("Unsupported beat progress fields.");
  }
  const values = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  if (
    values.status !== undefined &&
    !["not_started", "in_progress", "completed"].includes(
      values.status as string,
    )
  ) {
    throw new Error("Invalid beat status.");
  }
  if (
    values.answers !== undefined &&
    !isWeekBeatAnswers({ [beatId]: values.answers })
  ) {
    throw new Error("Beat answers must contain string values.");
  }
  for (const key of ["saved_data", "resume_state"]) {
    if (
      values[key] !== undefined && (!object(values[key]) || !json(values[key]))
    ) {
      throw new Error("Beat data and resume state must be JSON objects.");
    }
  }
  return values as BeatProgressPatch;
}

/** weekId is weeks.id (CurriculumWeek.id), not week_number or an activity UUID. */
export async function loadBeatProgress(
  weekId: number,
  beatId: BeatId,
): Promise<BeatProgress | null> {
  const userId = await owner();
  identity(weekId, beatId);
  if (!BEAT_IDS.includes(beatId)) {
    throw new Error("A canonical beat ID is required.");
  }
  const { data, error } = await supabase.from("beat_progress").select(columns)
    .eq("user_id", userId).eq("week_id", weekId).eq("beat_id", beatId)
    .maybeSingle();
  if (error) throw new Error("Could not load beat progress. Please retry.");
  await sameOwner(userId);
  return data as BeatProgress | null;
}

/** Returns saved beats only, in canonical order; never fabricates completion. */
export async function listWeekBeatProgress(
  weekId: number,
): Promise<BeatProgress[]> {
  const userId = await owner();
  identity(weekId);
  const { data, error } = await supabase.from("beat_progress").select(columns)
    .eq("user_id", userId).eq("week_id", weekId);
  if (error) {
    throw new Error("Could not load week beat progress. Please retry.");
  }
  await sameOwner(userId);
  return ((data ?? []) as BeatProgress[]).sort((a, b) =>
    BEAT_IDS.indexOf(a.beat_id) - BEAT_IDS.indexOf(b.beat_id)
  );
}

/** Omitted fields survive; supplied JSON objects replace their entire column.
 * The database owns timestamps. Same-field concurrent writes are last-write-wins.
 */
export async function upsertBeatProgress(
  weekId: number,
  beatId: BeatId,
  patch: BeatProgressPatch,
): Promise<BeatProgress> {
  const userId = await owner();
  identity(weekId, beatId);
  if (!BEAT_IDS.includes(beatId)) {
    throw new Error("A canonical beat ID is required.");
  }
  const values = patchValues(patch, beatId);
  await sameOwner(userId);
  const { data, error } = await supabase.from("beat_progress").upsert(
    { ...values, user_id: userId, week_id: weekId, beat_id: beatId },
    { onConflict: "user_id,week_id,beat_id", defaultToNull: false },
  ).select(columns).single();
  if (error || !data) {
    throw new Error("Could not save beat progress. Please retry.");
  }
  await sameOwner(userId);
  return data as BeatProgress;
}

/** Restores this beat's persisted state without advancing, saving, or gating. */
export async function restoreBeatResumeState(
  weekId: number,
  beatId: BeatId,
): Promise<BeatResumeState | null> {
  const saved = await loadBeatProgress(weekId, beatId);
  if (!saved) return null;
  const { beat_id, status, answers, saved_data, resume_state } = saved;
  return { beat_id, status, answers, saved_data, resume_state };
}
