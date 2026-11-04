const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { simulateAuthBackend, accounts } = require("./helpers/auth-backend.cjs");

// These journeys exercise the shipped screens, with deliberately synthetic
// authentication/curriculum/completion responses. They are not live RLS tests.
const ids = { 1: "22222222-2222-4222-8222-222222222222", 2: "44444444-4444-4444-8444-444444444444", 3: "55555555-5555-4555-8555-555555555555" };
const evidenceDir = path.resolve(__dirname, "../../verification/final-student-path");
async function installFixtures(context, state) {
  const auth = await simulateAuthBackend(context);
  await context.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (!request.headers().authorization?.endsWith(".synthetic-signature")) {
      state.errors.push("Unauthenticated curriculum request");
      return respond({ message: "Sign in required" }, 401);
    }
    if (request.method() !== "GET") {
      state.writes.push(url.pathname);
      return respond({ message: "No backend writes expected" }, 500);
    }
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const one = value => respond(single ? value : value ? [value] : []);
    if (url.pathname.endsWith("/weeks")) {
      const n = Number(url.searchParams.get("week_number")?.slice(3));
      return one({ id: n, week_number: n, title: `Synthetic Week ${n}`, theme: "Test curriculum fixture", description: "Synthetic published activity for screen verification." });
    }
    if (url.pathname.endsWith("/activities")) {
      const target = url.searchParams.get("id")?.slice(3);
      if (target) {
        const n = Number(Object.keys(ids).find(n => ids[n] === target));
        return one(n ? { id: target, weeks: { week_number: n, is_published: true } } : null);
      }
      const n = Number(url.searchParams.get("week_id")?.slice(3));
      return respond([{ id: ids[n], title: `Synthetic Week ${n} activity`, activity_type: "reflection", content: "Fixture activity", sequence_number: 1, duration_minutes: null }]);
    }
    if (url.pathname.endsWith("/progress")) {
      const owner = url.searchParams.get("user_id")?.slice(3);
      const account = Object.values(accounts).find(value => value.id === owner);
      const payload = JSON.parse(Buffer.from(request.headers().authorization.split(".")[1], "base64url").toString());
      if (!account || payload.sub !== owner) {
        state.errors.push("Cross-account progress request");
        return respond({ message: "Wrong owner" }, 403);
      }
      const target = url.searchParams.get("activity_id");
      const rows = [1, 2].filter(n => state.completed[owner]?.has(n) && target?.includes(ids[n])).map(n => ({
        activity_id: ids[n], status: "completed", current_step: "completed",
        started_at: "2026-11-04T08:00:00Z", completed_at: "2026-11-04T08:30:00Z",
      }));
      return respond(single ? rows[0] ?? null : rows);
    }
    state.errors.push(`Unexpected REST path: ${url.pathname}`);
    return respond({ message: "Unexpected fixture request" }, 500);
  });
  context.on("request", request => { if (request.url().includes("/functions/v1/")) state.providerCalls.push(request.url()); });
  return auth;
}
async function signIn(page, account) {
  await page.getByRole("textbox", { name: "Email address" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

for (const layout of [
  { name: "desktop-web", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
  { name: "mobile-web", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) test(`${layout.name}: fresh and returning fixture student path with screenshot evidence`, async ({ browser }) => {
  const state = { completed: {}, writes: [], providerCalls: [], errors: [], defects: [] };
  const contexts = [], authRuns = [], screenshots = [];
  let context, page;
  async function launch(storageState) {
    context = await browser.newContext({ viewport: layout.viewport, isMobile: layout.isMobile, hasTouch: layout.hasTouch, baseURL: "http://127.0.0.1:4173", storageState });
    contexts.push(context);
    authRuns.push(await installFixtures(context, state));
    page = await context.newPage();
  }
  async function restart(url) {
    // Carry the same device's storage in memory into a new browser context.
    // Never write auth/session snapshots to evidence files.
    const storage = await context.storageState();
    await context.close();
    await launch(storage);
    await page.goto(url);
  }
  async function shot(name) {
    await fs.mkdir(evidenceDir, { recursive: true });
    const file = `${layout.name}-${name}.png`;
    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
    screenshots.push(file);
  }
  async function leaveSession() {
    // Wait for the returned dashboard to finish loading before checking actions.
    await expect(page.getByText(/^Week 1: Available\./)).toBeVisible();
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    if (await signOut.count()) {
      await signOut.click();
    } else {
      if (!state.defects.length) {
        const defect = "No reachable Sign out control on the student dashboard; account switching cannot be verified through the UI.";
        state.defects.push(defect);
        test.info().annotations.push({ type: "remaining-defect", description: defect });
        await shot("09-dashboard-missing-sign-out");
      }
      // Continue isolation checks using a synthetic session reset, explicitly
      // not a successful user-visible sign-out. Keep only known fixture drafts.
      const storage = await context.storageState();
      const draftsOnly = { cookies: [], origins: storage.origins.map(origin => ({
        ...origin, localStorage: origin.localStorage.filter(item => /^(baseline-fixture:|week-three-screen-fixture:)/.test(item.name)),
      })) };
      await context.close();
      await launch(draftsOnly);
      await page.goto("/");
    }
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  }
  const openBaseline = () => page.getByRole("button", { name: "Open saved Guiding Questions", exact: true }).click();
  const fields = () => page.getByRole("textbox", { name: /^Guiding Question \d:/ });
  try {
    await launch();
    await page.goto(`/?week=3&activityId=${ids[3]}`);
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Explore response (example field)" })).toHaveCount(0);
    await signIn(page, accounts.a);
    await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible();
    await expect(page.getByText("Complete Week 1 before opening Week 3.", { exact: true })).toBeVisible();
    await shot("01-fresh-locked-route");
    await page.getByRole("radio", { name: "Week 1", exact: true }).click();
    await openBaseline();
    await expect(fields()).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(fields().nth(i)).toHaveValue("");
    await expect(page.getByText(/Example question wording. Saved answers stay on this device/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit original baseline" })).toBeDisabled();
    await shot("02-fresh-baseline-source");
    await fields().nth(0).fill("Fresh student partial fixture answer");
    await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open saved Guiding Questions" })).toBeVisible();
    await restart("/");
    await openBaseline();
    await expect(fields().nth(0)).toHaveValue("Fresh student partial fixture answer");
    for (let i = 1; i < 5; i++) await fields().nth(i).fill(`Fixture answer ${i + 1}`);
    await fields().nth(4).fill("x".repeat(2001));
    await expect(page.getByText("Question 5 exceeds its character limit.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit original baseline" })).toBeDisabled();
    await shot("03-baseline-validation");
    await fields().nth(4).fill("Fixture answer 5");
    await page.getByRole("button", { name: "Submit original baseline" }).click();
    await expect(page.getByText("Original submitted answers. These answers are read-only.", { exact: true })).toBeVisible();
    await restart("/");
    await openBaseline();
    for (let i = 0; i < 5; i++) await expect(fields().nth(i)).not.toBeEditable();
    await expect(fields().nth(0)).toHaveValue("Fresh student partial fixture answer");
    for (let i = 1; i < 5; i++) await expect(fields().nth(i)).toHaveValue(`Fixture answer ${i + 1}`);
    await shot("04-returning-original-baseline");
    await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
    await page.getByRole("radio", { name: "Week 2", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Week 2 locked", exact: true })).toBeVisible();
    // Only an explicit synthetic server completion changes access, not baseline submission.
    state.completed[accounts.a.id] = new Set([1]);
    await page.getByRole("button", { name: "Check prerequisites again", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Synthetic Week 2 activity\./ })).toBeVisible();
    await shot("05-week-two-unlocked-card");
    await page.getByRole("radio", { name: "Week 3", exact: true }).click();
    await expect(page.getByText("Complete Week 2 before opening Week 3.", { exact: true })).toBeVisible();
    state.completed[accounts.a.id].add(2);
    await page.getByRole("button", { name: "Check prerequisites again", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Synthetic Week 3 activity\./ })).toBeVisible();
    await shot("06-week-three-unlocked-card");
    await page.getByRole("button", { name: /^Synthetic Week 3 activity\./ }).click();
    await page.getByRole("button", { name: "Resume: Explore (fixture)", exact: true }).click();
    const explore = () => page.getByRole("textbox", { name: "Explore response (example field)", exact: true });
    const notice = () => page.getByRole("textbox", { name: "Notice response (example field)", exact: true });
    await expect(page.getByText("Synthetic tap", { exact: true })).toBeVisible();
    await expect(page.getByText(/Fixture path: synthetic tap log and example question wording/)).toBeVisible();
    await expect(page.getByText(/No AI request is made by these screens/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Notice", exact: true })).toBeDisabled();
    await shot("07-explore-source-and-log");
    await explore().fill("Explore response saved across the returning journey");
    await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save reflection", exact: true })).toBeDisabled();
    await notice().fill("Notice response saved across the returning journey");
    await page.getByRole("button", { name: "Save reflection", exact: true }).click();
    await expect(page.getByText("Week 3 answers and step saved on this device.", { exact: true })).toBeVisible();
    await restart(`/?week=3&activityId=${ids[3]}`);
    await page.getByRole("button", { name: "Resume: Notice (fixture)", exact: true }).click();
    await expect(notice()).toHaveValue("Notice response saved across the returning journey");
    await notice().scrollIntoViewIfNeeded();
    await shot("08-returning-notice-answer");
    await page.getByRole("button", { name: "Back to Explore", exact: true }).click();
    await expect(explore()).toHaveValue("Explore response saved across the returning journey");
    await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
    await expect(notice()).toHaveValue("Notice response saved across the returning journey");
    await expect(page.getByText(/Week 3 completion is unavailable until the approved completion rules/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Week 3", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save and return to curriculum", exact: true }).click();
    await leaveSession();
    await page.goto(`/?week=3&activityId=${ids[3]}`);
    await signIn(page, accounts.b);
    await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Week 1", exact: true }).click();
    await openBaseline();
    for (let i = 0; i < 5; i++) await expect(fields().nth(i)).toHaveValue("");
    await shot("10-other-account-empty-baseline");
    await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
    await leaveSession();
    await signIn(page, accounts.a);
    await page.goto(`/?week=3&activityId=${ids[3]}`);
    await page.getByRole("button", { name: "Resume: Notice (fixture)", exact: true }).click();
    await expect(notice()).toHaveValue("Notice response saved across the returning journey");
    expect(state.writes).toEqual([]);
    expect(state.providerCalls).toEqual([]);
    expect(state.errors).toEqual([]);
    for (const auth of authRuns) expect(auth.errors).toEqual([]);
    await fs.writeFile(path.join(evidenceDir, `${layout.name}-result.json`), JSON.stringify({
      executedAt: new Date().toISOString(), layout: layout.name, viewport: layout.viewport,
      result: state.defects.length ? "CHECKS EXECUTED; REMAINING DEFECTS" : "PASS", source: "Synthetic auth/curriculum/completion; app's labeled local baseline/Week 3 fixtures",
      restart: "New browser context with same-device storage copied in memory",
      accountSwitch: state.defects.length ? "Fixture-only draft storage retained; synthetic session reset; NOT a UI sign-out pass" : "UI sign-out/sign-in",
      defects: state.defects,
      nativeMobile: "NOT RUN", screenshots, backendWrites: state.writes.length, providerCalls: state.providerCalls.length,
    }, null, 2) + "\n");
  } finally { for (const item of contexts) await item.close(); }
});
