const { test, expect } = require("@playwright/test");
const { simulateAuthBackend, accounts } = require("./helpers/auth-backend.cjs");

// One second of silence, created by this test; no sponsor or third-party media.
function silentWav() {
  const bytes = Buffer.alloc(44 + 16000);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(16000, 40); return bytes;
}

async function setup(page, context, weekNumber, media, handleMedia) {
  const db = await simulateAuthBackend(context);
  if (handleMedia) await context.route("https://practice.example.test/**", handleMedia);
  const record = db.records.get(accounts.a.id);
  record.current_step = weekNumber === 1 ? "breathing" : "week_two_practice";
  Object.assign(record.reflection_answers, { arrive_mood: "3", arrive_energy: "4", arrive_body_region: "chest" });
  await context.route("**/rest/v1/weeks*", route => {
    const number = Number(new URL(route.request().url()).searchParams.get("week_number").replace("eq.", ""));
    const module = { weekNumber: number, title: "Test module", contentSource: { kind: "existing-implementation", reference: "Team-owned automated test" },
      beats: ["arrive", "practice", "explore", "notice"].map(id => ({ id, title: id[0].toUpperCase() + id.slice(1), description: "Team test guidance", ...(id === "practice" ? { media } : {}) })) };
    const week = { id: number, week_number: number, title: "Test module", theme: "Test", description: JSON.stringify(module) };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify([week]) });
  });
  async function open() {
    if (weekNumber === 2) await page.getByRole("radio", { name: "Week 2", exact: true }).click();
    await page.getByRole("button", { name: /^Notice and Reflect\./ }).click();
    if (weekNumber === 1) await page.getByRole("button", { name: /^Resume:/ }).click();
  }
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await open();
  return { db, open };
}

test("Week 1 configured audio recovers from failure, restores paused playback, and advances only after ending", async ({ page, context }) => {
  let requests = 0;
  const handleMedia = route => {
    requests++;
    return route.fulfill({ status: requests === 1 ? 503 : 200, contentType: "audio/wav", headers: { "access-control-allow-origin": "*" }, body: requests === 1 ? Buffer.from("") : silentWav() });
  };
  const { open, db } = await setup(page, context, 1, { type: "audio", source: { kind: "url", url: "https://practice.example.test/test.wav" }, durationSeconds: 1,
    transcript: { kind: "inline", text: "Team test transcript" }, alternativeInstructions: "Team test alternative" }, handleMedia);
  await expect(page.getByText(/Playback error/)).toBeVisible();
  await expect(page.getByText("Team test transcript", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to check-in", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry media", exact: true }).click();
  await page.getByRole("button", { name: "Play media", exact: true }).click();
  await page.getByRole("button", { name: "Pause media", exact: true }).click();
  await page.reload(); await open();
  await expect(page.getByRole("button", { name: "Continue to check-in", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Play media", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue to check-in", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Continue to check-in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "After breathing", exact: true })).toBeVisible();
  expect(db.records.get(accounts.a.id).current_step).toBe("post_breathing_check_in");
});

test("Week 2 failed video offers supplied text and restores the interrupted Practice beat", async ({ page, context }) => {
  const { open, db } = await setup(page, context, 2, { type: "video", source: { kind: "url", url: "https://practice.example.test/test.mp4" },
    transcript: { kind: "inline", text: "Team video transcript" }, alternativeInstructions: "Team body-awareness alternative" }, route => route.fulfill({ status: 503, body: "Unavailable" }));
  await expect(page.getByText(/Playback error/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Explore", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Use text alternative", exact: true }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await page.getByRole("button", { name: "Pause practice", exact: true }).click();
  await page.reload(); await open();
  await expect(page.getByRole("heading", { name: "Practice", exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Resume practice", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Explore", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Resume practice", exact: true }).click();
  await page.getByRole("button", { name: "Finish practice", exact: true }).click();
  await page.getByRole("button", { name: "Continue to Explore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore · Sensation Lexicon", exact: true })).toBeVisible();
  expect(db.records.get(accounts.a.id).current_step).toBe("week_two_explore");
});

test("unresolved media without a supplied alternative stays on Practice", async ({ page, context }) => {
  const { db } = await setup(page, context, 2, { type: "video", source: { kind: "reference", id: "pending-approved-asset" } });
  await expect(page.getByText(/configured media is unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use text alternative", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to Explore", exact: true })).toBeDisabled();
  expect(db.records.get(accounts.a.id).current_step).toBe("week_two_practice");
});
