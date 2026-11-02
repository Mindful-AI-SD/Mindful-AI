const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts } = require("./helpers/auth-backend.cjs");
const ids = { 1: "22222222-2222-4222-8222-222222222222", 2: "44444444-4444-4444-8444-444444444444", 3: "55555555-5555-4555-8555-555555555555" };
const stamp = "2026-11-02T10:00:00Z";
async function setup(context) {
  await simulateAuthBackend(context);
  const state = { completed: new Set(), writes: [], failReads: false };
  await context.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const one = value => respond(single ? value : value ? [value] : []);
    if (request.method() !== "GET") { state.writes.push(request.postDataJSON()); return respond({ error: "Unexpected write" }, 500); }
    if (url.pathname.endsWith("/weeks")) {
      const n = Number(url.searchParams.get("week_number")?.slice(3));
      return one({ id: n, week_number: n, title: `Module ${n}`, theme: "Test curriculum", description: null });
    }
    if (url.pathname.endsWith("/activities")) {
      const target = url.searchParams.get("id")?.slice(3);
      if (target) { const n = Number(Object.keys(ids).find(n => ids[n] === target)); return one(n ? { id: target, weeks: { week_number: n, is_published: true } } : null); }
      const n = Number(url.searchParams.get("week_id")?.slice(3));
      return respond([{ id: ids[n], title: `Week ${n} saved activity`, activity_type: "reflection", content: null, sequence_number: 1, duration_minutes: null }]);
    }
    if (url.pathname.endsWith("/progress")) {
      if (state.failReads) return respond({ message: "Unavailable" }, 503);
      const owner = url.searchParams.get("user_id");
      if (owner !== `eq.${accounts.a.id}`) return respond({ message: "Wrong owner" }, 403);
      const target = url.searchParams.get("activity_id");
      const rows = [1, 2].filter(n => target === `eq.${ids[n]}` || target?.includes(ids[n])).map(n => ({
        user_id: accounts.a.id, activity_id: ids[n], status: state.completed.has(n) ? "completed" : "in_progress",
        completed_at: state.completed.has(n) ? stamp : null, current_step: n === 2 ? "week_two_explore" : "writing",
        started_at: stamp, updated_at: stamp, writing: "Saved writing", generated_intentions: [],
        reflection_answers: n === 2 ? { arrive_body_region: "chest", week_two_practice_complete: "yes", week_two_sensation_1: "warm", week_two_sensation_2: "tight", week_two_sensation_3: "soft" } : {},
      }));
      return respond(single ? rows[0] ?? null : rows);
    }
    return route.fallback();
  });
  return state;
}
async function signIn(page, target = "/") {
  await page.goto(target);
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("Week 2/3 lock, unlock from saved completion, resume after restart and reject stale/direct navigation", async ({ page, context }) => {
  const state = await setup(context);
  await signIn(page, `/?week=2&activityId=${ids[2]}`);
  await expect(page.getByRole("heading", { name: "Week 2 locked", exact: true })).toBeVisible();
  await expect(page.getByText("Complete Week 1 before opening Week 2.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  state.completed.add(1); // A saved server completion, never a local UI completion.
  await page.getByRole("button", { name: "Check prerequisites again", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Sensation 1", exact: true })).toHaveValue("warm");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Sensation 1", exact: true })).toHaveValue("warm");
  await page.goto(`/?week=3&activityId=${ids[3]}`);
  await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Complete Week 2 before opening Week 3.", { exact: true })).toBeVisible();
  state.completed.add(2);
  await page.getByRole("button", { name: "Check prerequisites again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 3", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Week 3", exact: true })).toBeVisible();
  state.completed.delete(2);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible();
  await page.goto(`/breathing-player?activityId=${ids[3]}`);
  await expect(page.getByText("Complete Week 2 before opening Week 3.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("failed completion reads keep dashboard and direct resume locked until a successful retry", async ({ page, context }) => {
  const state = await setup(context);
  state.completed.add(1); state.completed.add(2); state.failReads = true;
  await signIn(page, `/?week=3&activityId=${ids[3]}`);
  await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Could not verify Week 3 access/).last()).toBeVisible();
  state.failReads = false;
  await page.getByRole("button", { name: "Check prerequisites again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 3", exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("a stale available dashboard card cannot bypass a fresh entry check or the activity's week", async ({ page, context }) => {
  const state = await setup(context);
  state.completed.add(1);
  await signIn(page, "/?week=2");
  const activity = page.getByRole("button", { name: /^Week 2 saved activity\./ });
  await expect(activity).toBeVisible();
  state.completed.delete(1);
  await activity.click();
  await expect(page.getByRole("heading", { name: "Week 2 locked", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Sensation 1", exact: true })).toHaveCount(0);
  state.completed.add(1);
  await page.goto(`/?week=2&activityId=${ids[3]}`);
  await expect(page.getByText("This activity does not belong to the selected published week.", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
