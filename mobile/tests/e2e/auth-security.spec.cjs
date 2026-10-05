const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts, activityId, writingA, writingB, intentionsA, answersA } = require("./helpers/auth-backend.cjs");

async function signIn(page, account) {
  await page.getByRole("textbox", { name: "Email address" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your curriculum" })).toBeVisible();
}

test("signed-out deep links and history cannot open protected screens or request progress", async ({ page, context }) => {
  const db = await simulateAuthBackend(context);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const route of ["/", `/breathing-player?activityId=${activityId}`, "/explore", "/?note=" + "%C2".repeat(1000), "/?redirectTo=https%3A%2F%2Fexample.test"]) {
    await page.goto(route);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Breathing Player", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your curriculum", exact: true })).toHaveCount(0);
  }
  expect(db.progressRequests).toHaveLength(0);
  await signIn(page, accounts.a);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Notice and Reflect. In progress", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writingA);
  await page.getByRole("button", { name: "Back to Week 1", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goBack();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(db.errors).toEqual([]);
  expect(errors).toEqual([]);
});

for (const step of ["writing", "intention_mirror", "ai_gap_reflection"]) {
  test(`switching accounts clears the ${step} screen, including other tabs`, async ({ page, context }) => {
    const db = await simulateAuthBackend(context, step);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await signIn(page, accounts.a);
    await page.getByRole("button", { name: "Notice and Reflect. In progress", exact: true }).click();
    if (step === "writing") {
      await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writingA);
    } else {
      for (const intention of intentionsA) await expect(page.getByText(intention.title, { exact: true })).toBeVisible();
      if (step === "ai_gap_reflection") {
        await expect(page.getByRole("textbox", { name: "What did they miss?", exact: true })).toHaveValue(answersA.ai_gap_missed);
      }
    }

    const otherTab = await context.newPage();
    otherTab.on("pageerror", error => errors.push(error.message));
    await otherTab.goto("/");
    await otherTab.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(writingA, { exact: true })).toHaveCount(0);
    for (const intention of intentionsA) await expect(page.getByText(intention.title, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "What did they miss?", exact: true })).toHaveCount(0);

    await signIn(otherTab, accounts.b);
    await expect(page.getByRole("heading", { name: "Your curriculum", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notice and Reflect. In progress", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writingB);
    for (const intention of intentionsA) await expect(page.getByText(intention.title, { exact: true })).toHaveCount(0);
    expect(db.records.get(accounts.a.id).writing).toBe(writingA);
    expect(db.records.get(accounts.a.id).current_step).toBe(step);
    expect(db.records.get(accounts.b.id).writing).toBe(writingB);
    await page.getByRole("textbox", { name: "Your writing", exact: true }).fill("Updated only by account B.");
    await expect.poll(() => db.records.get(accounts.b.id).writing).toBe("Updated only by account B.");
    expect(db.records.get(accounts.a.id).writing).toBe(writingA);

    await otherTab.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await signIn(otherTab, accounts.a);
    await expect(page.getByRole("heading", { name: "Your curriculum", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notice and Reflect. In progress", exact: true }).click();
    if (step === "writing") await expect(page.getByRole("textbox", { name: "Your writing", exact: true })).toHaveValue(writingA);
    else for (const intention of intentionsA) await expect(page.getByText(intention.title, { exact: true })).toBeVisible();
    expect(db.errors).toEqual([]);
    expect(errors).toEqual([]);
  });
}
