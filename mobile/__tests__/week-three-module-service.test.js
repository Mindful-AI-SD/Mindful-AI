import { createWeekThreeModuleService } from "../lib/week-three-module-service";
import { newWeekThreeModule } from "../lib/week-three-module";
import { supabase } from "../lib/supabase";
import { getActivityWeek, getWeekAccess } from "../lib/week-access";
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock("../lib/week-access", () => ({ getActivityWeek: jest.fn(), getWeekAccess: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
let row, writes, filters, fail;
beforeEach(() => {
  row = { reflection_answers: { untouched_answer: "Original other reflection" }, current_step: "week_three_arrive", status: "in_progress", started_at: "2026-11-09T08:00:00Z", completed_at: null, updated_at: "revision-1" };
  writes = []; filters = []; fail = false;
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
  getActivityWeek.mockResolvedValue(3); getWeekAccess.mockResolvedValue({ allowed: true });
  supabase.from.mockImplementation(table => {
    expect(table).toBe("progress"); let patch;
    const chain = {
      select: jest.fn(() => chain), eq: jest.fn((...args) => { filters.push(args); return chain; }),
      update: jest.fn(value => { patch = value; return chain; }), insert: jest.fn(value => { patch = value; return chain; }),
      maybeSingle: jest.fn(async () => {
        if (patch) { writes.push(patch); if (fail) return { data: null, error: new Error() }; row = { ...row, ...patch, updated_at: "revision-2" }; }
        return { data: row, error: null };
      }),
    };
    return chain;
  });
});
test("remote save preserves other answers, filters owner/activity and CAS revision, then replays a lost acknowledgement once", async () => {
  const service = createWeekThreeModuleService("student", "activity");
  const initial = await service.load();
  const data = { ...initial.data, arrival_focus: 4 };
  const op = "00000000-0000-4000-8000-000000000001";
  const saved = await service.save(data, initial, op);
  expect(writes).toHaveLength(1);
  expect(writes[0].reflection_answers.untouched_answer).toBe("Original other reflection");
  expect(writes[0]).not.toHaveProperty("writing"); expect(writes[0]).not.toHaveProperty("generated_intentions");
  expect(filters).toContainEqual(["user_id", "student"]); expect(filters).toContainEqual(["activity_id", "activity"]); expect(filters).toContainEqual(["updated_at", "revision-1"]);
  expect(await service.save(data, initial, op)).toEqual(saved); expect(writes).toHaveLength(1);
});
test("save errors keep the prior snapshot; stale sessions and premature completion do not write", async () => {
  const service = createWeekThreeModuleService("student", "activity");
  const initial = await service.load(); fail = true;
  await expect(service.save({ ...initial.data, arrival_focus: 3 }, initial, "00000000-0000-4000-8000-000000000001")).rejects.toThrow(/input is still here/);
  expect(row.updated_at).toBe("revision-1");
  fail = false; row.updated_at = "changed";
  await expect(service.save(initial.data, initial, "00000000-0000-4000-8000-000000000002")).rejects.toThrow(/another session/);
  await expect(service.save({ ...initial.data, step: "completed", completed_at: "2026-11-09T09:00:00Z" }, initial, "00000000-0000-4000-8000-000000000003")).rejects.toThrow();
  expect(writes).toHaveLength(1);
});
test("account changes and denied prerequisites cannot load or save another user's record", async () => {
  const service = createWeekThreeModuleService("student", "activity");
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "other" } } }, error: null });
  await expect(service.load()).rejects.toThrow(/Sign in again/); expect(writes).toEqual([]);
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
  getWeekAccess.mockResolvedValue({ allowed: false });
  await expect(service.load()).rejects.toThrow(/earlier weeks/); expect(writes).toEqual([]);
});
test("AI sends only minimized entries through the proxy and rejects unknown categories", async () => {
  const data = newWeekThreeModule(); data.notice_reflection = "Do not send this";
  data.entries = [{ id: "entry", source: "practice", topic_trigger: "My deadline", app_content_type: "", duration_minutes: null, occurred_at: "2026-11-09T08:00:00Z" }];
  supabase.functions.invoke.mockResolvedValue({ data: { provider: "claude", assignments: [{ eventId: "entry", category: "planning" }] }, error: null });
  const service = createWeekThreeModuleService("student", "activity");
  const signal = new AbortController().signal;
  await service.categorize(data, "operation", signal);
  expect(supabase.functions.invoke).toHaveBeenCalledWith("week-three-audit", { signal, body: { activityId: "activity", operationId: "operation", events: [{ id: "entry", topic: "My deadline" }] } });
  supabase.functions.invoke.mockResolvedValue({ data: { provider: "claude", assignments: [{ eventId: "entry", category: "thoughts" }] }, error: null });
  await expect(service.categorize(data, "operation", signal)).rejects.toThrow(/invalid categories/);
});
