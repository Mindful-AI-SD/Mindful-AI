const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts, writingA } = require("./helpers/auth-backend.cjs");

test("instructor preview is signed-in, read-only, and renders only synthetic progress", async ({ page, context }) => {
  const db = await simulateAuthBackend(context);
  await page.goto("/instructor");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Instructor progress", exact: true })).toHaveCount(0);
  expect(db.progressRequests).toHaveLength(0);
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Instructor progress", exact: true })).toBeVisible();
  await expect(page.getByText("Read-only preview · Test data", { exact: true })).toBeVisible();
  await expect(page.getByText("13 of 24 student activities completed", { exact: true })).toBeVisible();
  for (const name of ["Course content", "Roster and progress", "Student 01", "Student 02", "Student 03"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /edit|save|journal|reflection|writing|delete|export/i })).toHaveCount(0);
  await expect(page.getByText(writingA, { exact: true })).toHaveCount(0);
  expect(db.progressRequests).toHaveLength(0);
  expect(db.errors).toEqual([]);

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your curriculum", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Instructor preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Instructor progress", exact: true })).toBeVisible();
});
