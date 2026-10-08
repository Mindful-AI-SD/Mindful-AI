const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const config = parseEnv(fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8"));
const backend = config.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const activityId = "22222222-2222-4222-8222-222222222222";
const accounts = {
  a: { id: "11111111-1111-4111-8111-111111111111", email: "account-a@example.test" },
  b: { id: "33333333-3333-4333-8333-333333333333", email: "account-b@example.test" },
};
const writingA = "Private writing belonging only to account A. " + "notice ".repeat(143).trim();
const writingB = "Separate writing belonging only to account B.";
const intentionsA = [1, 2, 3].map(i => ({ title: `Account A intention ${i}`, explanation: `Private explanation for account A number ${i}.` }));
const answersA = { arrive_mood: "3", arrive_energy: "4", post_breathing_urge: "no", data_self_portrait_visible: "Account A habits", data_self_portrait_missing: "Account A context", ai_gap_got_right: "Private account A right", ai_gap_missed: "Private account A missed", ai_gap_reveals: "" };

async function simulateAuthBackend(context, step = "writing") {
  let revision = 0;
  const records = new Map(), tokens = new Map(), errors = [], progressRequests = [];
  for (const [name, account] of Object.entries(accounts)) {
    records.set(account.id, {
      user_id: account.id, activity_id: activityId, status: "in_progress",
      current_step: name === "a" ? step : "writing", writing: name === "a" ? writingA : writingB,
      generated_intentions: name === "a" && step !== "writing" ? intentionsA : [],
      reflection_answers: name === "a" ? answersA : { arrive_mood: "2", arrive_energy: "3", post_breathing_urge: "yes" },
      started_at: "2026-10-05T00:00:00.000Z", completed_at: null, updated_at: "2026-10-05T00:00:00.000Z",
    });
  }
  const user = account => ({ ...account, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00.000Z" });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4173") return route.continue();
    const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
    if (!request.url().startsWith(backend + "/")) {
      errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (request.method() === "OPTIONS") return respond({});
    if (url.pathname === "/auth/v1/token") {
      const body = request.postDataJSON();
      const account = Object.values(accounts).find(account => account.email === body.email || body.refresh_token === `refresh-${account.id}`);
      if (!account) return respond({ message: "Invalid test account" }, 400);
      const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: account.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.synthetic-signature`;
      tokens.set(token, account);
      return respond({ access_token: token, refresh_token: `refresh-${account.id}`, expires_in: 86400, token_type: "bearer", user: user(account) });
    }
    const account = tokens.get(request.headers().authorization?.replace(/^Bearer /, ""));
    if (url.pathname === "/auth/v1/user") return account ? respond(user(account)) : respond({ message: "Signed out" }, 401);
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (!account) {
      errors.push(`Signed-out data request: ${url.pathname}`);
      return respond({ message: "Sign in required" }, 401);
    }
    const single = request.headers().accept?.includes("application/vnd.pgrst.object+json");
    const result = value => respond(single ? value : (value ? [value] : []));
    if (url.pathname === "/rest/v1/weeks") return result({ id: 1, week_number: 1, title: "Mindful Attention", theme: "Awareness", description: "Notice your experience." });
    if (url.pathname === "/rest/v1/activities") return respond([{ id: activityId, activity_type: "reflection", title: "Notice and Reflect", content: "Pause and notice.", sequence_number: 1, duration_minutes: 10 }]);
    if (url.pathname === "/rest/v1/progress") {
      const owner = url.searchParams.get("user_id"), body = request.method() === "GET" ? null : request.postDataJSON();
      progressRequests.push({ account: account.id, owner, method: request.method() });
      if ((owner && owner !== `eq.${account.id}`) || (body?.user_id && body.user_id !== account.id)) {
        errors.push("Cross-account progress request");
        return respond({ message: "Wrong owner" }, 403);
      }
      let record = records.get(account.id);
      if (request.method() !== "GET") {
        if (request.method() === "PATCH" && (url.searchParams.get("current_step") !== `eq.${record.current_step}` || url.searchParams.get("updated_at") !== `eq.${record.updated_at}`)) return respond([]);
        record = { ...record, ...body, updated_at: new Date(Date.now() + ++revision).toISOString() };
        records.set(account.id, record);
      }
      return result(record);
    }
    errors.push(`Unexpected backend request: ${url.pathname}`);
    return route.abort();
  });
  return { errors, records, progressRequests };
}

module.exports = { simulateAuthBackend, accounts, activityId, writingA, writingB, intentionsA, answersA };
