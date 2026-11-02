import { getActivityWeek, getWeekAccess } from "../lib/week-access";
import { getPublishedWeek } from "../lib/curriculum";
import { getActivityProgress } from "../lib/progress";
import { supabase } from "../lib/supabase";
jest.mock("../lib/curriculum", () => ({ getPublishedWeek: jest.fn() }));
jest.mock("../lib/progress", () => ({ getActivityProgress: jest.fn() }));
jest.mock("../lib/supabase", () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn() } }));
const stamp = "2026-11-02T10:00:00Z";
beforeEach(() => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
  getPublishedWeek.mockImplementation(async number => ({ activities: [{ id: `w${number}-a` }, { id: `w${number}-b` }] }));
  getActivityProgress.mockImplementation(async (_owner, ids) => ids.map(id => ({ activity_id: id, status: "completed", completed_at: stamp })));
});
test("sequential access reads exact published earlier activities and never treats a draft or missing timestamp as completion", async () => {
  expect((await getWeekAccess("student", 1)).allowed).toBe(true);
  expect(getActivityProgress).not.toHaveBeenCalled();
  getActivityProgress.mockResolvedValue([{ activity_id: "w1-a", status: "completed", completed_at: stamp }, { activity_id: "w1-b", status: "in_progress", completed_at: null }]);
  expect(await getWeekAccess("student", 2)).toMatchObject({ allowed: false, requiredWeek: 1 });
  getActivityProgress.mockResolvedValue([{ activity_id: "w1-a", status: "completed", completed_at: stamp }, { activity_id: "w1-b", status: "completed", completed_at: null }]);
  expect((await getWeekAccess("student", 2)).allowed).toBe(false);
});
test("Week 3 requires both earlier weeks; changing saved completion is read on each call", async () => {
  expect((await getWeekAccess("student", 3)).allowed).toBe(true);
  getActivityProgress.mockImplementation(async (_owner, ids) => ids.map(id => ({ activity_id: id, status: id.startsWith("w2") ? "in_progress" : "completed", completed_at: id.startsWith("w2") ? null : stamp })));
  expect(await getWeekAccess("student", 3)).toMatchObject({ allowed: false, requiredWeek: 2 });
  expect(getActivityProgress).toHaveBeenCalledWith("student", ["w2-a", "w2-b"]);
});
test("empty curriculum, unrelated completion and another account cannot grant access", async () => {
  getPublishedWeek.mockResolvedValue({ activities: [] });
  expect((await getWeekAccess("student", 2)).allowed).toBe(false);
  getPublishedWeek.mockResolvedValue({ activities: [{ id: "required" }] });
  getActivityProgress.mockResolvedValue([{ activity_id: "unrelated", status: "completed", completed_at: stamp }]);
  expect((await getWeekAccess("student", 2)).allowed).toBe(false);
  await expect(getWeekAccess("other", 2)).rejects.toThrow(/Sign in/);
});
test("account changes or read failures fail closed rather than reusing an earlier allowed result", async () => {
  getActivityProgress.mockImplementationOnce(async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "other" } } }, error: null });
    return [{ activity_id: "w1-a", status: "completed", completed_at: stamp }];
  });
  await expect(getWeekAccess("student", 2)).rejects.toThrow(/Sign in/);
});
test("direct activity links resolve their actual published week and reject unavailable activities", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: { id, weeks: { week_number: 2, is_published: true } }, error: null }) };
  supabase.from.mockReturnValue(query);
  expect(await getActivityWeek("student", id)).toBe(2);
  query.maybeSingle.mockResolvedValue({ data: { id, weeks: { week_number: 2, is_published: false } }, error: null });
  await expect(getActivityWeek("student", id)).rejects.toThrow(/unavailable/);
});
