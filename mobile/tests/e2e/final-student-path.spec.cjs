// Current handoff path; replaces the historical synthetic Explore/Notice route.
// Historical November 4 screenshots remain evidence of that earlier candidate.
const { test, expect } = require("@playwright/test");
const { ids, install, signIn, accounts } = require("./helpers/week-three-handoff.cjs");
for (const width of [390, 1280]) test(`current ${width}px student path: baseline return, real prerequisite locks and saved Arrive`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const { state, auth } = await install(context);
  state.completed.set(accounts.a.id, new Set());
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Week 3 locked", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Week 1", exact: true }).click();
  const open = () => page.getByRole("button", { name: "Open saved Guiding Questions", exact: true }).click();
  await open();
  const fields = page.getByRole("textbox", { name: /^Guiding Question \d:/ });
  await expect(fields).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expect(fields.nth(i)).toHaveValue("");
  await fields.nth(0).fill("Baseline draft kept separately from Week 3");
  await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open saved Guiding Questions", exact: true })).toBeVisible();
  await page.reload(); await open();
  await expect(fields.nth(0)).toHaveValue("Baseline draft kept separately from Week 3");
  await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
  state.completed.set(accounts.a.id, new Set([1, 2])); // Explicit synthetic server completion.
  await page.goto(`/?week=3&activityId=${ids[3]}`);
  await page.getByRole("button", { name: "Resume: Arrive", exact: true }).click();
  await page.getByRole("radio", { name: "Focus rating 4", exact: true }).click();
  await page.getByRole("button", { name: "Save and return to curriculum", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week 3 activity. In progress", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Week 3 activity. In progress", exact: true }).click();
  await page.getByRole("button", { name: "Resume: Arrive", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Focus rating 4", exact: true })).toBeChecked();
  const saved = JSON.parse(state.records.get(accounts.a.id).reflection_answers.week_three_module_v1);
  expect(saved.entries).toEqual([]); expect(saved.step).toBe("arrive"); expect(saved.completed_at).toBeNull();
  expect(state.ai).toHaveLength(0); expect(auth.errors).toEqual([]);
});
