const { test, expect } = require("@playwright/test");
const { parseEnv } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const config = parseEnv(fs.readFileSync(path.join(__dirname, "../../.env"), "utf8"));
const backend = config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const userId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const writing = "I noticed my attention wandering. This week I want to pause and listen before reacting.";

async function simulateBackend(context) {
  let progress = null, revision = 0;
  const errors = [];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "returning-user@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.test-signature`;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4173") return route.continue();
    if (!request.url().startsWith(backend + "/")) {
      errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
      return route.abort();
    }
    const respond = data => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
    if (request.method() === "OPTIONS") return respond({});
    if (url.pathname === "/auth/v1/token") return respond({ access_token: jwt, refresh_token: "test-refresh", expires_in: 86400, token_type: "bearer", user });
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname === "/auth/v1/logout") return respond({});
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const result = value => respond(single ? value : (value ? [value] : []));
    if (url.pathname === "/rest/v1/weeks") return result({ id: 1, week_number: 1, title: "Mindful Attention", theme: "Awareness and attention", description: "Notice your experience." });
    if (url.pathname === "/rest/v1/activities") return respond([{ id: activityId, activity_type: "reflection", title: "Notice and Reflect", content: "Pause and notice.", sequence_number: 1, duration_minutes: 10 }]);
    if (url.pathname === "/rest/v1/progress") {
      if (request.method() === "GET") return result(progress);
      const body = request.postDataJSON();
      if (request.method() === "PATCH" && (url.searchParams.get("current_step") !== `eq.${progress.current_step}` || url.searchParams.get("updated_at") !== `eq.${progress.updated_at}`)) return respond([]);
      if (!(request.method() === "POST" && request.headers().prefer?.includes("ignore-duplicates") && progress)) {
        progress = { user_id: userId, activity_id: activityId, status: "not_started", current_step: "breathing", writing: null, generated_intentions: [], reflection_answers: {}, started_at: null, completed_at: null, ...progress, ...body, updated_at: new Date(Date.now() + ++revision).toISOString() };
      }
      return result(progress);
    }
    errors.push(`Unexpected backend request: ${url.pathname}`);
    return route.abort();
  });
  return { get progress() { return progress; }, errors };
}

for (const restart of [false, true]) {
  test(restart ? "Week 1 restores after writing and mock generation" : "Week 1 completes normally", async ({ page, context }) => {
    const db = await simulateBackend(context);
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto("/");
    await page.getByRole("textbox", { name: "Email address" }).fill("returning-user@example.test");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Start or continue Week 1" }).click();
    await page.getByRole("button", { name: "Start breathing session", exact: true }).waitFor();
    await page.clock.install();
    await page.getByRole("button", { name: "Start breathing session", exact: true }).click();
    await page.clock.fastForward(600_000);
    await page.getByRole("button", { name: "Continue to check-in" }).click();
    await page.getByRole("textbox", { name: "What do you notice now?" }).fill("My breathing feels slower.");
    await page.getByRole("button", { name: "Save and continue", exact: true }).click();
    await page.getByRole("textbox", { name: "Your writing", exact: true }).fill(writing);
    await expect.poll(() => db.progress.writing).toBe(writing);
    expect(db.progress.current_step).toBe("writing");
    if (restart) {
      await page.reload();
      await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writing);
      expect(db.progress.current_step).toBe("writing");
    }
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit writing" }).click();
    await expect(page.getByRole("heading", { name: "Mock intentions", exact: true })).toBeVisible();
    expect(db.progress.current_step).toBe("intention_mirror");
    const savedIntentions = structuredClone(db.progress.generated_intentions);
    expect(savedIntentions).toHaveLength(3);
    if (restart) {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Mock intentions", exact: true })).toBeVisible();
      expect(db.progress.generated_intentions).toEqual(savedIntentions);
      expect(db.progress.writing).toBe(writing);
    }
    await page.getByRole("button", { name: "Continue to data self-portrait" }).click();
    await page.getByRole("textbox", { name: "What could data about you show?" }).fill("My daily habits.");
    await page.getByRole("textbox", { name: "What would that data leave out?" }).fill("Why I make choices.");
    await page.getByRole("button", { name: "Save and continue", exact: true }).click();
    await page.getByRole("textbox", { name: "What did the mock intentions get right?" }).fill("They noticed attention.");
    await page.getByRole("textbox", { name: "What did they miss?" }).fill("My personal context.");
    await page.getByRole("textbox", { name: "What does the gap reveal?" }).fill("AI cannot know my full experience.");
    await page.getByRole("button", { name: "Continue to Yellowdig draft" }).click();
    await page.getByRole("textbox", { name: "Your discussion draft" }).fill("I noticed that data captures patterns but misses context. What do others notice?");
    await page.getByRole("button", { name: "Complete Week 1", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Week 1 complete", exact: true })).toBeVisible();
    expect(db.progress.current_step).toBe("completed");
    expect(db.progress.status).toBe("completed");
    expect(db.progress.completed_at).toBeTruthy();
    expect(db.progress.writing).toBe(writing);
    expect(db.progress.generated_intentions).toEqual(savedIntentions);
    expect(Object.keys(db.progress.reflection_answers)).toHaveLength(7);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Week 1 complete", exact: true })).toBeVisible();
    expect(db.errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
