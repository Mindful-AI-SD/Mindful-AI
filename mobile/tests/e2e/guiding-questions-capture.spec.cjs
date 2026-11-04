const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts } = require("./helpers/auth-backend.cjs");

for (const width of [390, 1280]) test(`baseline Back retains partial input through save errors and restart at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 844 });
  await simulateAuthBackend(context);
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const open = page.getByRole("button", { name: "Open saved Guiding Questions" });
  await open.click();
  const fields = page.getByRole("textbox", { name: /^Guiding Question \d:/ });
  await fields.nth(0).fill("Partial answer retained by Back");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("baseline-fixture:")) { Storage.prototype.setItem = original; throw new Error("Save failed"); }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
  await expect(page.getByText(/Could not save your baseline/)).toBeVisible();
  await expect(fields.nth(0)).toHaveValue("Partial answer retained by Back");
  await page.getByRole("button", { name: "Retry baseline save", exact: true }).click();
  await expect(open).toBeVisible();
  await page.reload();
  await open.click();
  await expect(fields.nth(0)).toHaveValue("Partial answer retained by Back");
  await expect(fields.nth(1)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Submit original baseline" })).toBeDisabled();
  // The second curriculum exit must use the same save-before-leaving path.
  await fields.nth(1).fill("Second exit also saves");
  await page.getByRole("button", { name: "Return to curriculum for Week 1", exact: true }).click();
  await open.click();
  await expect(fields.nth(1)).toHaveValue("Second exit also saves");
});

test("five answers survive restart and save failure; submitted original restores read-only", async ({ page, context }) => {
  const db = await simulateAuthBackend(context);
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const open = page.getByRole("button", { name: "Open saved Guiding Questions" });
  await open.click();
  const fields = page.getByRole("textbox", { name: /^Guiding Question \d:/ });
  await expect(fields).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Submit original baseline" })).toBeDisabled();
  for (let index = 0; index < 5; index++) await fields.nth(index).fill(`My saved answer ${index + 1} 😀`);
  await page.getByRole("button", { name: "Save baseline draft" }).click();
  await expect(page.getByText("Baseline draft saved on this device.", { exact: true })).toBeVisible();
  await page.reload();
  await open.click();
  for (let index = 0; index < 5; index++) await expect(fields.nth(index)).toHaveValue(`My saved answer ${index + 1} 😀`);
  await fields.nth(0).fill("New answer survives a save error");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("baseline-fixture:")) {
        Storage.prototype.setItem = original;
        throw new DOMException("Test save failure", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save baseline draft" }).click();
  await expect(page.getByText(/Could not save your baseline/)).toBeVisible();
  await expect(fields.nth(0)).toHaveValue("New answer survives a save error");
  for (let index = 1; index < 5; index++) await expect(fields.nth(index)).toHaveValue(`My saved answer ${index + 1} 😀`);
  await page.getByRole("button", { name: "Retry baseline save" }).click();
  await expect(page.getByText("Baseline draft saved on this device.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit original baseline" }).click();
  await expect(page.getByText("Original submitted answers. These answers are read-only.", { exact: true })).toBeVisible();
  const frozen = await fields.evaluateAll(inputs => inputs.map(input => input.value));
  await page.reload();
  await open.click();
  for (let index = 0; index < 5; index++) {
    await expect(fields.nth(index)).toHaveValue(frozen[index]);
    await expect(fields.nth(index)).not.toBeEditable();
  }
  await expect(page.getByRole("button", { name: "Submit original baseline" })).toHaveCount(0);
  await expect(page.getByText("Week 2: Locked", { exact: true })).toBeVisible();
  expect(db.progressRequests.filter(request => request.method !== "GET")).toHaveLength(0);
  await page.getByRole("button", { name: "Back to curriculum", exact: true }).click();
  await expect(open).toBeVisible();
  await expect(page.getByRole("radio", { name: "Week 2", exact: true })).toBeEnabled();
  expect(db.errors).toEqual([]);
});
