const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts } = require("./helpers/auth-backend.cjs");
const ids = { 1: "22222222-2222-4222-8222-222222222222", 2: "44444444-4444-4444-8444-444444444444", 3: "55555555-5555-4555-8555-555555555555" };

test("Week 3 fixture log and both response beats restore through restart, backward navigation, and storage errors without AI calls", async ({ page, context }) => {
  const db = await simulateAuthBackend(context);
  const providerCalls = [], writes = [];
  context.on("request", request => { if (request.url().includes("/functions/v1/")) providerCalls.push(request.url()); });
  await context.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    if (request.method() !== "GET") { writes.push(request.postDataJSON()); return respond({ message: "Unexpected write" }, 500); }
    if (url.pathname.endsWith("/weeks")) {
      const n = Number(url.searchParams.get("week_number")?.slice(3));
      const week = { id: n, week_number: n, title: `Module ${n}`, theme: "Test", description: null };
      return respond(single ? week : [week]);
    }
    if (url.pathname.endsWith("/activities")) {
      const n = Number(url.searchParams.get("week_id")?.slice(3));
      return respond([{ id: ids[n], title: `Week ${n} activity`, activity_type: "reflection", content: null, sequence_number: 1, duration_minutes: null }]);
    }
    if (url.pathname.endsWith("/progress")) {
      const target = url.searchParams.get("activity_id");
      const rows = [1, 2].filter(n => target?.includes(ids[n])).map(n => ({ activity_id: ids[n], status: "completed", current_step: "completed", completed_at: "2026-11-02T10:00:00Z", started_at: "2026-11-02T09:00:00Z" }));
      return respond(single ? rows[0] ?? null : rows);
    }
    return route.fallback();
  });
  await page.goto(`/?week=3&activityId=${ids[3]}`);
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Resume: Explore (fixture)", exact: true }).click();
  await expect(page.getByText("Synthetic tap", { exact: true })).toBeVisible();
  await expect(page.getByText("2026-10-28T16:00:00Z", { exact: true })).toBeVisible();
  await expect(page.getByText(/No AI request is made by these screens/)).toBeVisible();
  const explore = page.getByRole("textbox", { name: "Explore response (example field)", exact: true });
  const notice = page.getByRole("textbox", { name: "Notice response (example field)", exact: true });
  await expect(page.getByRole("button", { name: "Continue to Notice", exact: true })).toBeDisabled();
  await explore.fill("My Explore response 😀");
  await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
  await notice.fill("My Notice response");
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByText("Week 3 answers and step saved on this device.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume: Notice (fixture)", exact: true }).click();
  await expect(notice).toHaveValue("My Notice response");
  await page.getByRole("button", { name: "Back to Explore", exact: true }).click();
  await expect(explore).toHaveValue("My Explore response 😀");
  await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
  await expect(notice).toHaveValue("My Notice response");
  await notice.fill("Updated Notice response retained after failure");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("week-three-screen-fixture:")) { Storage.prototype.setItem = original; throw new Error("Test storage failure"); }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByText(/Could not save Week 3/)).toBeVisible();
  await expect(notice).toHaveValue("Updated Notice response retained after failure");
  await page.getByRole("button", { name: "Retry Week 3 save", exact: true }).click();
  await expect(page.getByText("Week 3 answers and step saved on this device.", { exact: true })).toBeVisible();
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key.startsWith("week-three-screen-fixture:")) { Storage.prototype.getItem = original; throw new Error("Test load failure"); }
      return original.call(this, key);
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Retry loading Week 3", exact: true }).click();
  await page.getByRole("button", { name: "Resume: Notice (fixture)", exact: true }).click();
  await expect(notice).toHaveValue("Updated Notice response retained after failure");
  await expect(page.getByRole("button", { name: "Complete Week 3", exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith("week-three-screen-fixture:")))).progress);
  expect(stored.answers.example_explore_response).toBe("My Explore response 😀");
  expect(stored.currentBeat).toBe("notice"); expect(stored.status).toBe("in_progress");
  expect(stored.completedAt).toBeNull(); expect(stored.events).toHaveLength(1);
  expect(stored.eventsRevision).toBe(1); expect(stored.resumeState.elapsedActiveMs).toBe(12000);
  expect(writes).toHaveLength(0); expect(providerCalls).toHaveLength(0); expect(db.errors).toEqual([]);
});
