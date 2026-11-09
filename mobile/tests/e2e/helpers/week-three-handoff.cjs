const { simulateAuthBackend, accounts } = require("./auth-backend.cjs");
const ids = { 1: "22222222-2222-4222-8222-222222222222", 2: "44444444-4444-4444-8444-444444444444", 3: "55555555-5555-4555-8555-555555555555" };
const scenario = [
  { day: 1, topic: "Thinking about a project deadline", category: "Planning" },
  { day: 1, topic: "Opened short videos after a notification", app: "Short-video feed", minutes: "25", category: "Entertainment" },
  { day: 2, topic: "Replaying an awkward conversation", category: "Memory" },
  { day: 2, topic: "Compared an internship update with classmates", app: "Social feed", minutes: "15", category: "Social comparison" },
  { day: 3, topic: "Worried about an upcoming exam", category: "Worry" },
  { day: 3, topic: "Read gaming clips instead of starting homework", app: "Video feed", minutes: "20", category: "Entertainment" },
];
function savedAudit() {
  const time = "2026-11-09T08:00:00Z";
  return { version: "week3-handoff/1", content_version: "1.0.0", step: "explore", arrival_focus: 3, practice_started_at: time, practice_completed_at: time,
    practice_labels: [], audit_start_date: time, current_audit_day: 3, days: [1, 2, 3].map(day => ({ day, day_complete: true, no_distraction_noticed: false })),
    entries: scenario.map((item, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, audit_day: item.day,
      source: item.app ? "daily_technology" : "practice", topic_trigger: item.topic, app_content_type: item.app ?? "", duration_minutes: item.minutes ? Number(item.minutes) : null, occurred_at: time,
      student_category: null, ai_category: null, ai_confirmed: false })),
    entry_draft: { id: null, source: "practice", topic: "", app: "", minutes: "" }, mode: null, summary: null, ethics_card_seen_at: null,
    sit_elapsed_ms: 0, two_minute_sit_completed_at: null, notice_reflection: "", completed_at: null, ai_request_id: null, ai_proposal_digest: null };
}
async function install(context) {
  const auth = await simulateAuthBackend(context);
  const state = { records: new Map(), writes: [], ai: [], failSave: false, failAi: false, delayAi: null, failAccess: false,
    completed: new Map(Object.values(accounts).map(account => [account.id, new Set([1, 2])])), baselines: new Map(), baselineReceipts: new Map() };
  let revision = 0;
  await context.route("**/storage/v1/object/public/practice-media/**", route => route.fulfill({ status: 404, body: "Test missing media" }));
  await context.route("**/functions/v1/week-three-audit", async route => {
    if (route.request().method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ available: true }) });
    const body = route.request().postDataJSON(); state.ai.push(body);
    if (state.delayAi) await state.delayAi;
    if (state.failAi) return route.fulfill({ status: 408, contentType: "application/json", body: JSON.stringify({ message: "Test timeout" }) });
    const key = name => name.toLowerCase().replace(/ /g, "_");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "claude", assignments: body.events.map(event => ({ eventId: event.id, category: key(scenario.find(item => item.topic === event.topic)?.category ?? "Other") })) }) });
  });
  await context.route("**/rest/v1/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const one = value => respond(single ? value : value ? [value] : []);
    if (url.pathname.includes("/rpc/")) {
      const token = request.headers().authorization?.split(".")[1];
      const owner = token ? JSON.parse(Buffer.from(token, "base64url").toString()).sub : null;
      if (!Object.values(accounts).some(account => account.id === owner)) return respond({ message: "AUTH_REQUIRED" }, 401);
      const name = url.pathname.split("/").at(-1), original = state.baselines.get(owner) ?? null;
      if (name === "load_baseline") return respond(original);
      if (name === "load_original_baseline") return respond({ contractVersion: "sprint3-storage/v1", original: null, definition: null });
      if (name === "save_baseline_draft") {
        const input = request.postDataJSON().p_request;
        const receiptKey = `${owner}:${input.operationId}`;
        if (state.baselineReceipts.has(receiptKey)) return respond({ ...state.baselineReceipts.get(receiptKey), replayed: true });
        if (input.expectedRevision !== (original?.revision ?? 0)) return respond({ message: "STALE_REVISION" }, 400);
        const now = new Date().toISOString();
        const record = { contractVersion: "sprint3-storage/v1", definitionId: input.definitionId, definitionVersion: input.definitionVersion, answers: input.answers,
          status: "draft", revision: input.expectedRevision + 1, submittedAt: null, submittedOperationId: null, createdAt: original?.createdAt ?? now, updatedAt: now };
        state.baselines.set(owner, record);
        const receipt = { contractVersion: "sprint3-storage/v1", outcome: "draft_saved", revision: record.revision, submittedAt: null, replayed: false };
        state.baselineReceipts.set(receiptKey, receipt); return respond(receipt);
      }
      return route.fallback();
    }
    if (url.pathname.endsWith("/weeks")) { const n = Number(url.searchParams.get("week_number")?.slice(3)); return one({ id: n, week_number: n, title: `Week ${n} handoff test`, theme: "Synthetic curriculum", description: null }); }
    if (url.pathname.endsWith("/activities")) {
      const target = url.searchParams.get("id")?.slice(3);
      if (target) { const n = Number(Object.keys(ids).find(n => ids[n] === target)); return one(n ? { id: target, weeks: { week_number: n, is_published: true } } : null); }
      const n = Number(url.searchParams.get("week_id")?.slice(3));
      return respond([{ id: ids[n], title: `Week ${n} activity`, activity_type: "reflection", content: null, sequence_number: 1, duration_minutes: null }]);
    }
    if (url.pathname.endsWith("/progress")) {
      const token = request.headers().authorization?.split(".")[1];
      const owner = token ? JSON.parse(Buffer.from(token, "base64url").toString()).sub : null;
      const queryOwner = url.searchParams.get("user_id")?.slice(3);
      if (!Object.values(accounts).some(account => account.id === owner) || queryOwner && queryOwner !== owner) return respond({ message: "Wrong owner" }, 403);
      const body = request.method() === "GET" ? null : request.postDataJSON();
      if (body?.user_id && body.user_id !== owner) return respond({ message: "Wrong owner" }, 403);
      if (body) {
        state.writes.push(body);
        if (state.failSave) { state.failSave = false; return respond({ message: "Test save failure" }, 400); }
        const previous = state.records.get(owner);
        if (request.method() === "PATCH" && url.searchParams.get("updated_at") !== `eq.${previous?.updated_at}`) return respond([]);
        const saved = { ...previous, ...body, activity_id: ids[3], updated_at: new Date(Date.now() + ++revision).toISOString() };
        state.records.set(owner, saved); return one(saved);
      }
      if (state.failAccess) return respond({ message: "Test unavailable" }, 400);
      const target = url.searchParams.get("activity_id");
      if (target === `eq.${ids[3]}`) return one(state.records.get(owner) ?? null);
      const rows = [1, 2].filter(n => target?.includes(ids[n]) && state.completed.get(owner)?.has(n)).map(n => ({ activity_id: ids[n], status: "completed", current_step: "completed", completed_at: "2026-11-09T08:00:00Z", started_at: "2026-11-09T07:00:00Z" }));
      if (target?.includes(ids[3]) && state.records.has(owner)) rows.push(state.records.get(owner));
      return respond(single ? rows[0] ?? null : rows);
    }
    return route.fallback();
  });
  return { state, auth };
}
async function signIn(page) {
  await page.goto(`/?week=3&activityId=${ids[3]}`);
  await page.getByRole("textbox", { name: "Email address" }).fill(accounts.a.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
module.exports = { ids, scenario, savedAudit, install, signIn, accounts };
