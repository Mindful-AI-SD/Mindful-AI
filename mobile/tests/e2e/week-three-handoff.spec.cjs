const { test, expect } = require("@playwright/test");
const { ids, scenario, savedAudit, install, signIn, accounts } = require("./helpers/week-three-handoff.cjs");
const prompt = "What patterns surprised you? What felt chosen, and what felt designed?";
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function summary(page) {
  await expect(page.getByText("Entertainment: 2 of 6 entries · 33.3%", { exact: true })).toBeVisible();
  for (const category of ["Planning", "Memory", "Worry", "Social comparison"]) await expect(page.getByText(`${category}: 1 of 6 entries · 16.7%`, { exact: true })).toBeVisible();
  await expect(page.getByText("Other: 0 of 6 entries · 0.0%", { exact: true })).toBeVisible();
}
for (const width of [390, 1280]) test(`prewritten handoff at ${width}px: three days, restart, ethics sit and saved completion`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const { state, auth } = await install(context);
  await signIn(page);
  await button(page, "Resume: Arrive").click();
  await page.clock.install();
  await expect(button(page, "Continue to Practice")).toBeDisabled();
  await page.getByRole("radio", { name: "Focus rating 3", exact: true }).click();
  await button(page, "Continue to Practice").click();
  await button(page, "Use text alternative").click();
  await button(page, "Start practice").click();
  await button(page, "Finish practice").click();
  await button(page, "Continue to three-day audit").click();
  for (const day of [1, 2, 3]) {
    if (day === 3) {
      await page.reload();
      await button(page, "Resume: Explore").click();
      await expect(page.getByText("Day 3: What pulled your attention?", { exact: true })).toBeVisible();
    }
    for (const entry of scenario.filter(item => item.day === day)) {
      if (entry.app) await button(page, "Apps or content").click();
      await page.getByRole("textbox", { name: "Topic or trigger", exact: true }).fill(entry.topic);
      if (entry.app) {
        await page.getByRole("textbox", { name: "App or content type (required for daily technology)", exact: true }).fill(entry.app);
        await page.getByRole("textbox", { name: "Time spent in minutes (optional)", exact: true }).fill(entry.minutes);
      }
      await button(page, "Save audit entry").click();
      await expect(page.getByText(entry.topic, { exact: true })).toBeVisible();
    }
    await button(page, `Complete Day ${day}`).click();
    await expect(page.getByText("Saving or checking Week 3…", { exact: true })).toHaveCount(0);
  }
  await button(page, "Use prewritten version").click();
  await expect(page.getByText(/Prewritten activity. These examples and prompts were written in advance/)).toBeVisible();
  for (const item of scenario) await page.getByRole("radio", { name: `${item.category} for ${item.topic}`, exact: true }).click();
  await button(page, "Review category summary").click();
  await summary(page); expect(state.ai).toHaveLength(0);
  await button(page, "Open attention ethics card").click();
  await expect(button(page, "Continue to Notice the gap")).toBeDisabled();
  await button(page, "Start practice").click();
  await page.clock.runFor(60000);
  await page.reload();
  await button(page, "Resume: Ethics").click();
  await button(page, "Resume practice").click();
  await page.clock.runFor(59000);
  await expect(button(page, "Continue to Notice the gap")).toBeDisabled();
  await page.clock.runFor(1000);
  await button(page, "Save completed two-minute sit").click();
  await button(page, "Continue to Notice the gap").click();
  await expect(button(page, "Complete Week 3")).toBeDisabled();
  await page.getByRole("textbox", { name: prompt, exact: true }).fill("  Some pulls felt chosen; the feed felt designed.  ");
  state.failSave = true;
  await button(page, "Complete Week 3").click();
  await expect(page.getByText(/Could not save Week 3. Your input is still here/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: prompt, exact: true })).toHaveValue("  Some pulls felt chosen; the feed felt designed.  ");
  await button(page, "Retry Week 3 save").click();
  await expect(page.getByText("Your Week 3 completion and reflection are saved. Completed work is read-only.", { exact: true })).toBeVisible();
  await page.reload(); await button(page, "Resume: Week 3 complete").click();
  await expect(page.getByRole("textbox", { name: prompt, exact: true })).not.toBeEditable();
  await summary(page);
  await button(page, "Back to curriculum").click();
  await expect(page.getByRole("button", { name: "Week 3 activity. Completed", exact: true })).toBeVisible();
  const saved = JSON.parse(state.records.get(accounts.a.id).reflection_answers.week_three_module_v1);
  expect(saved.entries).toHaveLength(6); expect(saved.content_version).toBe("1.0.0"); expect(saved.step).toBe("completed");
  expect(state.ai).toHaveLength(0); expect(auth.errors).toEqual([]);
});
test("live comparison: one delayed request, reviewed categories, timeout recovery and explicit prewritten switch", async ({ page, context }) => {
  const { state } = await install(context);
  const data = savedAudit();
  state.records.set(accounts.a.id, { activity_id: ids[3], current_step: "week_three_explore", status: "in_progress", started_at: "2026-11-09T08:00:00Z", completed_at: null, updated_at: "seed", reflection_answers: { week_three_module_v1: JSON.stringify(data), unrelated: "Keep" } });
  await signIn(page); await button(page, "Resume: Explore").click(); await page.clock.install();
  await button(page, "Use live AI").click();
  let release; state.delayAi = new Promise(resolve => { release = resolve; });
  await button(page, "Request AI category proposals").click();
  await expect.poll(() => state.ai.length).toBe(1);
  await expect(button(page, "Retry categorization request")).toBeDisabled();
  release(); state.delayAi = null;
  for (const item of scenario) await button(page, `Confirm category for ${item.topic}`).click();
  await button(page, "Review category summary").click(); await summary(page);
  await button(page, "Back to audit entries").click();
  state.failAi = true;
  await button(page, "Request AI category proposals").click();
  await expect(page.getByText(/Live AI timed out. Your entries remain saved/)).toBeVisible();
  const failedId = state.ai.at(-1).operationId;
  state.failAi = false;
  await button(page, "Retry AI categorization").click();
  await expect.poll(() => state.ai.length).toBe(3);
  expect(state.ai.at(-1).operationId).not.toBe(failedId);
  await button(page, "Confirm category for Thinking about a project deadline").click();
  await button(page, "Use prewritten version").click();
  for (const item of scenario) await page.getByRole("radio", { name: `${item.category} for ${item.topic}`, exact: true }).click();
  await button(page, "Review category summary").click(); await summary(page);
  expect(state.ai).toHaveLength(3);
  for (const body of state.ai) { expect(Object.keys(body).sort()).toEqual(["activityId", "events", "operationId"]); expect(body.events[0]).toEqual({ id: data.entries[0].id, topic: data.entries[0].topic_trigger }); }
  expect(state.records.get(accounts.a.id).reflection_answers.unrelated).toBe("Keep");
});
