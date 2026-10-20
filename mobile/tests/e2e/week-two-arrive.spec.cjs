const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts, activityId } = require("./helpers/auth-backend.cjs");

test("Week 2 restores all four beats, Sensation Lexicon results, ethics answers, and completion", async ({ page, context }) => {
  await simulateAuthBackend(context);
  let progress = null, failSave = false, revision = 0;
  const aiRequests = [];
  await context.route("**/functions/v1/ai-activity", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" } });
    const body = route.request().postDataJSON();
    aiRequests.push(body);
    const items = body.input.sensations.map(original => ({ original, isVague: original === "weird", suggestions: original === "weird" ? ["tingling", "fluttering"] : [] }));
    return route.fulfill({ status: aiRequests.length === 1 ? 408 : 200, contentType: "application/json", body: JSON.stringify(aiRequests.length === 1 ? { error: "timeout" } : { kind: "sensation_lexicon", provider: "mock", result: { items } }) });
  });
  await context.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const respond = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const record = value => respond(single ? value : value ? [value] : []);
    if (url.pathname.endsWith("/weeks")) {
      const number = Number(url.searchParams.get("week_number")?.replace("eq.", ""));
      return record({ id: number, week_number: number, title: number === 2 ? "Body Awareness" : "Mindful Attention", theme: "Notice", description: null });
    }
    if (url.pathname.endsWith("/activities")) {
      if (url.searchParams.has("id")) return record({ id: activityId, weeks: { week_number: 2, is_published: true } });
      return respond(url.searchParams.get("week_id") === "eq.2" ? [{ id: activityId, title: "Body-map check-in", activity_type: "reflection", content: "Choose a location.", sequence_number: 1, duration_minutes: null }] : []);
    }
    if (url.pathname.endsWith("/progress")) {
      if (request.method() === "GET") return record(progress);
      if (failSave) { failSave = false; return respond({ message: "Save unavailable" }, 503); }
      const values = request.postDataJSON();
      progress = { user_id: accounts.a.id, activity_id: activityId, ...progress, ...values, updated_at: String(++revision) };
      return record(progress);
    }
    return route.fallback();
  });

  async function openWeekTwo() {
    await page.getByRole("radio", { name: "Week 2", exact: true }).click();
    await page.getByRole("button", { name: /^Body-map check-in\./ }).click();
  }
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await openWeekTwo();
  await expect(page.getByRole("button", { name: "Continue to Practice", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Head", exact: true }).click();
  await page.getByRole("radio", { name: "Chest", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Head", exact: true })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Chest", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Continue to Practice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
  expect(progress.reflection_answers.arrive_body_region).toBe("chest");
  expect(progress.current_step).toBe("week_two_practice");
  expect(progress.status).toBe("in_progress");

  await page.reload();
  await openWeekTwo();
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revise location", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Chest", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Left foot", exact: true }).click();
  failSave = true;
  await page.getByRole("button", { name: "Continue to Practice", exact: true }).click();
  await expect(page.getByText("Could not save your location. Your selection is still here. Please retry.", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Left foot", exact: true })).toBeChecked();
  expect(progress.reflection_answers.arrive_body_region).toBe("chest");
  await page.getByRole("button", { name: "Retry and continue to Practice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
  expect(progress.reflection_answers.arrive_body_region).toBe("left_foot");

  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.getByRole("button", { name: "Finish practice", exact: true }).click();
  await page.getByRole("button", { name: "Continue to Explore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore · Sensation Lexicon", exact: true })).toBeVisible();
  for (const [index, sensation] of ["weird", "warm", "tight"].entries()) {
    await page.getByRole("textbox", { name: `Sensation ${index + 1}`, exact: true }).fill(sensation);
  }
  await page.getByRole("button", { name: "Save answers", exact: true }).click();
  await expect.poll(() => progress.reflection_answers.week_two_sensation_3).toBe("tight");
  await page.reload();
  await openWeekTwo();
  await expect(page.getByRole("textbox", { name: "Sensation 1", exact: true })).toHaveValue("weird");
  await expect(page.getByRole("textbox", { name: "Sensation 2", exact: true })).toHaveValue("warm");
  await expect(page.getByRole("textbox", { name: "Sensation 3", exact: true })).toHaveValue("tight");
  expect(aiRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Generate sensation words", exact: true }).click();
  await expect(page.getByText("This is taking too long. Please try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Sensation 1", exact: true })).toHaveValue("weird");
  await page.getByRole("button", { name: "Retry Sensation Lexicon", exact: true }).click();
  await expect(page.getByText("Suggested words: tingling, fluttering", { exact: true })).toBeVisible();
  expect(aiRequests).toHaveLength(2);
  expect(Object.keys(aiRequests[1]).sort()).toEqual(["activityContext", "activityId", "input", "kind"]);
  expect(aiRequests[1].input).toEqual({ sensations: ["weird", "warm", "tight"] });
  await expect.poll(() => progress.reflection_answers.week_two_lexicon).toBeTruthy();
  await page.reload();
  await openWeekTwo();
  await expect(page.getByText("Suggested words: tingling, fluttering", { exact: true })).toBeVisible();
  expect(aiRequests).toHaveLength(2);
  await page.getByRole("button", { name: "Continue to Notice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notice", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracker ethics", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "What could a tracker show, and what might it miss?", exact: true }).fill("Numbers can miss context.");
  await page.getByRole("textbox", { name: "What did you notice, and what did the suggested words capture or miss?", exact: true }).fill("The words captured warmth but missed my experience.");
  await page.getByRole("button", { name: "Save answers", exact: true }).click();
  await expect.poll(() => progress.reflection_answers.week_two_closing_reflection).toBe("The words captured warmth but missed my experience.");
  await page.reload();
  await openWeekTwo();
  await expect(page.getByRole("heading", { name: "Notice", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What could a tracker show, and what might it miss?", exact: true })).toHaveValue("Numbers can miss context.");
  await expect(page.getByRole("textbox", { name: "What did you notice, and what did the suggested words capture or miss?", exact: true })).toHaveValue("The words captured warmth but missed my experience.");
  failSave = true;
  await page.getByRole("button", { name: "Complete Week 2", exact: true }).click();
  await expect(page.getByText("Could not save Week 2. Your answers are still here. Please retry.", { exact: true })).toBeVisible();
  expect(progress.status).toBe("in_progress");
  await page.getByRole("button", { name: "Complete Week 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 2 complete", exact: true })).toBeVisible();
  expect(progress.status).toBe("completed");
  expect(progress.completed_at).toBeTruthy();
  await page.reload();
  await openWeekTwo();
  await expect(page.getByRole("heading", { name: "Week 2 complete", exact: true })).toBeVisible();
  await expect(page.getByText("Numbers can miss context.", { exact: true })).toBeVisible();
  expect(aiRequests).toHaveLength(2);
});
