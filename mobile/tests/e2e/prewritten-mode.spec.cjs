const { test, expect } = require("@playwright/test");
const { parseEnv } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");

// The prewritten mode in a real browser, against a simulated backend. It checks
// what a student sees and what gets saved, using the content pack's labels.
const config = parseEnv(fs.readFileSync(path.join(__dirname, "../../.env"), "utf8"));
const backend = config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const userId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const writing = "I noticed my attention wandering. This week I want to pause and listen before reacting. " + "notice ".repeat(135).trim();
const labels = {
  modeTitle: "Prewritten activity",
  modeDescription: "Use examples and prompts written in advance. Your response is not analyzed by AI.",
  disclosure: "Prewritten activity. These examples and prompts were written in advance. The app does not analyze or interpret your response, and this activity does not send your response to an AI model.",
  responseScreen: "Your words are saved as entered. This activity does not interpret your writing.",
  resultFooter: "Source: Prewritten content, version 1.0",
};
const weekOneResult = {
  instruction: "Choose one, adapt it, or write your own.",
  examples: ["Pause before responding.", "Ask what information is missing."],
  reflectionPrompts: [
    "Which example best matches how you want to approach AI this week, and why?",
    "Rewrite the intention in your own words.",
    "What action would show that you followed your intention?",
    "What might make the intention difficult to follow?",
  ],
};
const MODES = {
  prewritten: { mode: "prewritten", available: true, contentVersion: "1.0.0", labels },
  unavailable: { mode: "claude", available: false, contentVersion: null, labels: null },
};

async function simulateBackend(context, mode) {
  let progress = null, revision = 0;
  const aiRequests = [], errors = [];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "prewritten@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.signature`;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4173") return route.continue();
    if (!request.url().startsWith(backend + "/")) {
      errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
      return route.abort();
    }
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
    if (request.method() === "OPTIONS") return respond({});
    if (url.pathname === "/auth/v1/token") return respond({ access_token: jwt, refresh_token: "test-refresh", expires_in: 86400, token_type: "bearer", user });
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (url.pathname === "/functions/v1/ai-activity") {
      if (request.method() === "GET") return respond(MODES[mode]);
      aiRequests.push(request.postDataJSON());
      if (mode === "unavailable") return respond({ error: "PROVIDER_NOT_CONFIGURED", message: "This activity is not available yet." }, 501);
      return respond({ kind: "intention_mirror", provider: "prewritten", contentVersion: "1.0.0", labels, result: weekOneResult });
    }
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const result = value => respond(single ? value : (value ? [value] : []));
    if (url.pathname === "/rest/v1/weeks") return result({ id: 1, week_number: 1, title: "Mindful Attention", theme: "Awareness and attention", description: "Notice your attention." });
    if (url.pathname === "/rest/v1/activities") return respond([{ id: activityId, activity_type: "reflection", title: "Notice and Reflect", content: "Pause and notice.", sequence_number: 1, duration_minutes: 10 }]);
    if (url.pathname === "/rest/v1/progress") {
      if (request.method() === "GET") return result(progress);
      const body = request.postDataJSON();
      if (!(request.method() === "POST" && request.headers().prefer?.includes("ignore-duplicates") && progress)) {
        progress = { user_id: userId, activity_id: activityId, status: "not_started", current_step: "breathing", writing: null, generated_intentions: [], reflection_answers: {}, started_at: null, completed_at: null, ...progress, ...body, updated_at: new Date(Date.now() + ++revision).toISOString() };
      }
      return result(progress);
    }
    errors.push(`Unexpected backend request: ${url.pathname}`);
    return route.abort();
  });
  return { get progress() { return progress; }, aiRequests, errors };
}

async function reachWriting(page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill("prewritten@example.test");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Notice and Reflect. Not started", exact: true }).click();
  await page.getByRole("button", { name: /^Resume:/ }).click();
  await page.getByRole("radio", { name: "Mood: 3 of 5" }).click();
  await page.getByRole("radio", { name: "Energy: 4 of 5" }).click();
  await page.getByRole("button", { name: "Continue to Practice", exact: true }).click();
  await page.getByRole("button", { name: "Choose 4-2-6 Breathing", exact: true }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).waitFor();
  await page.clock.install();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.clock.fastForward(600_000);
  await page.getByRole("button", { name: "Continue to check-in" }).click();
  await page.getByRole("radio", { name: "No", exact: true }).click();
  await page.getByRole("textbox", { name: "What did you notice?", exact: true }).fill("My breathing feels slower.");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Your writing", exact: true }).fill(writing);
}

test("Week 1 prewritten mode identifies itself, saves the student's own words, and completes", async ({ page, context }) => {
  const db = await simulateBackend(context, "prewritten");
  await reachWriting(page);

  // Identified before the student begins, with no untrue AI acknowledgement.
  await expect(page.getByText(labels.modeTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(labels.modeDescription, { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText(/AI processing/)).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Submit writing" })).toBeEnabled();
  await page.getByRole("button", { name: "Submit writing" }).click();
  await expect(page.getByText(labels.disclosure, { exact: true })).toBeVisible();
  await expect(page.getByText(weekOneResult.instruction, { exact: true })).toBeVisible();
  await expect(page.getByText(labels.resultFooter, { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Pause before responding." }).click();
  const own = "Pause before I reply, in my own words.";
  await page.getByRole("textbox", { name: "Your intention", exact: true }).fill(own);
  await page.getByRole("button", { name: "Save my intention", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue to data self-portrait" })).toBeVisible();

  // Saved word for word, with the content version, and no fake generated result.
  expect(db.progress.reflection_answers.week_one_prewritten_intention).toBe(own);
  expect(JSON.parse(db.progress.reflection_answers.week_one_prewritten_result).contentVersion).toBe("1.0.0");
  expect(db.progress.generated_intentions).toEqual([]);
  expect(db.progress.current_step).toBe("intention_mirror");

  // A returning student gets the same screen and their words back.
  await page.reload();
  await page.getByRole("button", { name: /^Resume:/ }).click();
  await expect(page.getByRole("textbox", { name: "Your intention", exact: true })).toHaveValue(own);

  await page.getByRole("button", { name: "Continue to data self-portrait" }).click();
  await page.getByRole("textbox", { name: "What could data about you show?" }).fill("My daily habits.");
  await page.getByRole("textbox", { name: "What would that data leave out?" }).fill("Why I make choices.");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();

  // The fixed prompts replace the questions about AI output.
  await expect(page.getByText(/intentions get right/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Complete Week 1", exact: true })).toBeDisabled();
  for (const [index, prompt] of weekOneResult.reflectionPrompts.entries()) {
    await page.getByRole("textbox", { name: prompt, exact: true }).fill(`Answer ${index + 1}`);
  }
  await page.getByRole("button", { name: "Complete Week 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 1 complete", exact: true })).toBeVisible();
  await expect(page.getByText(labels.resultFooter, { exact: true })).toBeVisible();

  expect(db.progress.status).toBe("completed");
  expect(db.progress.reflection_answers["week_one_prewritten_1.0.0_prompt_4"]).toBe("Answer 4");
  expect(JSON.parse(db.progress.reflection_answers.week_one_prewritten_result).contentVersion).toBe("1.0.0");
  expect(db.errors).toEqual([]);
});

test("an unavailable mode says so, keeps the writing, and never shows other content", async ({ page, context }) => {
  const db = await simulateBackend(context, "unavailable");
  await reachWriting(page);

  await expect(page.getByText("The selected mode is unavailable. Choose another mode or try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit writing" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writing);
  await expect.poll(() => db.progress.writing).toBe(writing);
  expect(db.aiRequests).toEqual([]);
  await expect(page.getByText(labels.modeTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mock intentions" })).toHaveCount(0);
  expect(db.errors).toEqual([]);
});

test("Week 2 prewritten mode shows the word list, saves chosen words, and keeps its completion rule", async ({ page, context }) => {
  const weekOneActivityId = "33333333-3333-4333-8333-333333333333";
  const result = {
    vocabulary: [{ area: "Breath", words: ["steady", "shallow"] }, { area: "Temperature", words: ["warm", "cool"] }],
    reflectionPrompts: ["Choose three to five words that match what you notice right now.", "Where in your body did you notice each sensation?", "What changed after the practice, if anything?", "What did you observe without needing to explain it?"],
  };
  let progress = null, revision = 0;
  const aiRequests = [];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "prewritten@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.signature`;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4173") return route.continue();
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
    if (request.method() === "OPTIONS") return respond({});
    if (url.pathname === "/auth/v1/token") return respond({ access_token: jwt, refresh_token: "test-refresh", expires_in: 86400, token_type: "bearer", user });
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (url.pathname === "/functions/v1/ai-activity") {
      if (request.method() === "GET") return respond(MODES.prewritten);
      aiRequests.push(request.postDataJSON());
      return respond({ kind: "sensation_lexicon", provider: "prewritten", contentVersion: "1.0.0", labels, result });
    }
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const record = value => respond(single ? value : value ? [value] : []);
    if (url.pathname === "/rest/v1/weeks") {
      const number = Number(url.searchParams.get("week_number")?.replace("eq.", ""));
      return record({ id: number, week_number: number, title: number === 2 ? "Body Awareness" : "Mindful Attention", theme: "Notice", description: null });
    }
    if (url.pathname === "/rest/v1/activities") {
      if (url.searchParams.has("id")) return record({ id: activityId, weeks: { week_number: 2, is_published: true } });
      return respond(url.searchParams.get("week_id") === "eq.1"
        ? [{ id: weekOneActivityId, title: "Notice and Reflect", activity_type: "reflection", content: "Pause.", sequence_number: 1, duration_minutes: null }]
        : [{ id: activityId, title: "Body-map check-in", activity_type: "reflection", content: "Choose a location.", sequence_number: 1, duration_minutes: null }]);
    }
    if (url.pathname === "/rest/v1/progress") {
      if (request.method() === "GET" && url.searchParams.get("activity_id")?.includes(weekOneActivityId)) {
        return record({ user_id: userId, activity_id: weekOneActivityId, status: "completed", current_step: "completed", completed_at: "2026-10-01T00:00:00Z", started_at: "2026-10-01T00:00:00Z", reflection_answers: {}, generated_intentions: [], writing: null, updated_at: "1" });
      }
      if (request.method() === "GET") return record(progress);
      progress = { user_id: userId, activity_id: activityId, ...progress, ...request.postDataJSON(), updated_at: String(++revision) };
      return record(progress);
    }
    return route.abort();
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill("prewritten@example.test");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("radio", { name: "Week 2", exact: true }).click();
  await page.getByRole("button", { name: /^Body-map check-in\./ }).click();
  await page.getByRole("radio", { name: "Chest", exact: true }).click();
  await page.getByRole("button", { name: "Continue to Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.getByRole("button", { name: "Finish practice", exact: true }).click();
  await page.getByRole("button", { name: "Continue to Explore", exact: true }).click();

  // Identified before the student begins, with no untrue AI wording.
  await expect(page.getByText(labels.modeTitle, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/AI processing/)).toHaveCount(0);
  for (const [index, sensation] of ["weird", "warm", "tight"].entries()) {
    await page.getByRole("textbox", { name: `Sensation ${index + 1}`, exact: true }).fill(sensation);
  }
  await page.getByRole("button", { name: "Show the word list", exact: true }).click();

  await expect(page.getByText(labels.resultFooter, { exact: true })).toBeVisible();
  await expect(page.getByText(labels.responseScreen, { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "steady", exact: true }).click();
  await page.getByRole("checkbox", { name: "cool", exact: true }).click();
  await page.getByRole("textbox", { name: "What changed after the practice, if anything?", exact: true }).fill("My breath slowed.");
  await page.getByRole("button", { name: "Save answers", exact: true }).click();
  await expect.poll(() => progress.reflection_answers.week_two_prewritten_prompt_3).toBe("My breath slowed.");
  expect(progress.reflection_answers.week_two_prewritten_words).toBe("steady\ncool");
  expect(JSON.parse(progress.reflection_answers.week_two_lexicon).contentVersion).toBe("1.0.0");

  // A returning student gets their choices back without another request.
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "steady", exact: true })).toBeChecked();
  expect(aiRequests).toHaveLength(1);

  // The prompts do not change the existing completion rule.
  await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
  await expect(page.getByText(labels.resultFooter, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Week 2", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "What could a tracker show, and what might it miss?", exact: true }).fill("Numbers can miss context.");
  await page.getByRole("textbox", { name: "What did you notice, and what did the suggested words capture or miss?", exact: true }).fill("Some of it.");
  await page.getByRole("button", { name: "Complete Week 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 2 complete", exact: true })).toBeVisible();
  expect(progress.status).toBe("completed");
  expect(JSON.parse(progress.reflection_answers.week_two_lexicon).contentVersion).toBe("1.0.0");
});
