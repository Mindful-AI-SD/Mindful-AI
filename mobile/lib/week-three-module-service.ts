import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getActivityWeek, getWeekAccess } from "./week-access";
import { newWeekThreeModule, validateModuleGates, type Category, type WeekThreeModule } from "./week-three-module";
import { isCategory } from "./week-three-module";

export type ModuleSnapshot = { data: WeekThreeModule; updatedAt: string | null; operationId: string | null };
export type Categorization = { assignments: { eventId: string; category: Category }[]; provider: "claude" };
export type WeekThreeModuleService = {
  load(): Promise<ModuleSnapshot>;
  save(data: WeekThreeModule, expected: ModuleSnapshot, operationId: string): Promise<ModuleSnapshot>;
  available(): Promise<boolean>;
  categorize(data: WeekThreeModule, operationId: string, signal: AbortSignal): Promise<Categorization>;
  legacyPreview(): Promise<Record<string, string> | null>;
};
const stateKey = "week_three_module_v1";
const receiptKey = "week_three_module_operation_v1";
const select = "reflection_answers,current_step,status,started_at,completed_at,updated_at";
type Row = { reflection_answers: Record<string, string>; current_step: string; status: string; started_at: string | null; completed_at: string | null; updated_at: string };
export class WeekThreeRequestError extends Error {
  constructor(message: string, public readonly definitive = false) { super(message); }
}

// The fixed support response from crisisSupport.ts, as one readable message.
function readSupport(value: unknown): string | null {
  const body = value as { outcome?: unknown; message?: unknown; resources?: unknown } | null;
  if (body?.outcome !== "support" || typeof body.message !== "string" || !Array.isArray(body.resources)) return null;
  const resources = body.resources.flatMap((item: { name?: unknown; contact?: unknown }) =>
    typeof item?.name === "string" && typeof item.contact === "string" ? [`${item.name}: ${item.contact}`] : []);
  return [body.message, ...resources].join(" ");
}

export function createWeekThreeModuleService(userId: string, activityId: string): WeekThreeModuleService {
  async function owner() {
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== userId) throw new Error("Sign in again to access your Week 3 work.");
  }
  async function allowed() {
    await owner();
    if (await getActivityWeek(userId, activityId) !== 3 || !(await getWeekAccess(userId, 3)).allowed) throw new Error("Complete the earlier weeks before opening Week 3.");
    await owner();
  }
  async function read() {
    await owner();
    const { data, error } = await supabase.from("progress").select(select).eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
    await owner();
    if (error) throw new Error("Could not load Week 3. Retry loading; saved work has not been replaced.");
    return data as Row | null;
  }
  function restore(row: Row | null): ModuleSnapshot {
    const answers = row?.reflection_answers ?? {};
    if (typeof answers !== "object" || Array.isArray(answers) || Object.values(answers).some(answer => typeof answer !== "string")) throw new Error("Could not read saved Week 3 answers.");
    let data = newWeekThreeModule();
    if (answers[stateKey]) {
      try { data = JSON.parse(answers[stateKey]); validateModuleGates(data); }
      catch { throw new Error("Saved Week 3 data needs recovery. It has not been replaced."); }
    } else if (row?.status === "completed") throw new Error("This activity has earlier completed data. It has not been replaced by the new Week 3 flow.");
    if (row && ((data.step === "completed") !== (row.status === "completed") || data.step === "completed" && !row.completed_at)) throw new Error("The saved completion status could not be verified.");
    return { data, updatedAt: row?.updated_at ?? null, operationId: answers[receiptKey] ?? null };
  }
  return {
    async load() { await allowed(); return restore(await read()); },
    async save(data, expected, operationId) {
      validateModuleGates(data);
      if (!/^[\da-f-]{36}$/i.test(operationId)) throw new Error("Invalid save operation.");
      await allowed();
      const row = await read();
      const current = restore(row);
      const encoded = JSON.stringify(data);
      if (current.operationId === operationId) {
        if (JSON.stringify(current.data) !== encoded) throw new Error("The retry operation changed. Reload before reconciling.");
        return current;
      }
      if (current.updatedAt !== expected.updatedAt) throw new Error("Week 3 changed in another session. Reload saved work before reconciling your draft.");
      if (row?.status === "completed") throw new Error("Completed Week 3 work is read-only.");
      const complete = data.step === "completed";
      const patch = {
        reflection_answers: { ...row?.reflection_answers, [stateKey]: encoded, [receiptKey]: operationId },
        current_step: complete ? "completed" : `week_three_${data.step}`,
        status: complete ? "completed" : "in_progress", started_at: row?.started_at ?? new Date().toISOString(), completed_at: complete ? data.completed_at : null,
      };
      await owner();
      const query = row
        ? supabase.from("progress").update(patch).eq("user_id", userId).eq("activity_id", activityId).eq("updated_at", row.updated_at).eq("current_step", row.current_step)
        : supabase.from("progress").insert({ ...patch, user_id: userId, activity_id: activityId });
      const { data: saved, error } = await query.select(select).maybeSingle();
      await owner();
      if (error || !saved) throw new Error("Could not save Week 3. Your input is still here. Retry the same save, or reload to reconcile another session.");
      return restore(saved as Row);
    },
    async available() {
      await owner();
      const { data, error } = await supabase.functions.invoke("week-three-audit", { method: "GET" });
      await owner();
      if (error || typeof data?.available !== "boolean") throw new Error("Could not check live AI availability. Choose prewritten or retry.");
      return data.available;
    },
    async categorize(data, operationId, signal) {
      await owner();
      // Deliberately excludes baseline, reflections, app duration and other work.
      const events = data.entries.map(entry => ({ id: entry.id, topic: entry.topic_trigger, ...(entry.source === "daily_technology" ? { app: entry.app_content_type } : {}) }));
      const { data: result, error } = await supabase.functions.invoke("week-three-audit", { signal, body: { activityId, operationId, events } });
      await owner();
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        throw new WeekThreeRequestError(
          status === 408 ? "Live AI timed out. Your entries remain saved. Retry or choose the prewritten version."
            : status === 429 ? "You have reached today's limit for live AI. Your entries remain saved. Choose the prewritten version or try again tomorrow."
            : "Live AI could not categorize these entries. Your entries remain saved. Retry or choose the prewritten version.",
          [400, 401, 404, 408, 429, 501, 502].includes(status ?? 0),
        );
      }
      // The server's fixed crisis response: no categories were produced. Show
      // the message and resources, and do not treat it as a model answer.
      const support = readSupport(result);
      if (support) throw new WeekThreeRequestError(support, true);
      if (result?.provider !== "claude" || !Array.isArray(result.assignments) || result.assignments.length !== events.length ||
        result.assignments.some((assignment: { eventId: string; category: unknown }, index: number) => assignment.eventId !== events[index].id || !isCategory(assignment.category))) throw new WeekThreeRequestError("Live AI returned invalid categories. Your entries remain saved; retry or choose prewritten.", true);
      return result as Categorization;
    },
    async legacyPreview() {
      await owner();
      const raw = await AsyncStorage.getItem(`week-three-screen-fixture:v1:${userId}:${activityId}`);
      await owner();
      if (!raw) return null;
      try {
        const saved = JSON.parse(raw);
        if (saved.progress?.activityId !== activityId || typeof saved.progress?.answers !== "object") return null;
        return Object.fromEntries(Object.entries(saved.progress.answers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      } catch { return null; }
    },
  };
}
