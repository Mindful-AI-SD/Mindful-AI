import { requestSchema, readAssignments } from "./contract.ts";
import { runOnce, type Receipt } from "./run-once.ts";
const id = "00000000-0000-4000-8000-000000000003";
const request = { activityId: id, operationId: id, events: [{ id, topic: "Thinking about a project deadline" }] };
const result = { assignments: [{ eventId: id, category: "planning" }] };
function assert(value: unknown) { if (!value) throw new Error("Assertion failed"); }
Deno.test("contract permits only minimized entries, never baseline or reflections", () => {
  assert(requestSchema.safeParse(request).success);
  assert(!requestSchema.safeParse({ ...request, baseline: "Private" }).success);
  assert(!requestSchema.safeParse({ ...request, events: [{ ...request.events[0], reflection: "Private" }] }).success);
  assert(!requestSchema.safeParse({ ...request, events: [...request.events, ...request.events] }).success);
});
Deno.test("only the handoff categories, exact IDs and no personal conclusions pass", () => {
  assert(readAssignments(request, result).assignments[0].category === "planning");
  for (const invalid of [
    { assignments: [{ eventId: id, category: "thoughts" }] },
    { assignments: [], insight: "A personal inference" },
    { assignments: [{ eventId: "00000000-0000-4000-8000-000000000004", category: "planning" }] },
  ]) {
    let rejected = false; try { readAssignments(request, invalid); } catch { rejected = true; }
    assert(rejected);
  }
});
function ledger() {
  let row: Receipt<typeof result> | null = null;
  const port = {
    async claim() { if (row) return false; row = { input_digest: "digest", status: "processing", result: null, error_status: null }; return true; },
    async read() { return row; },
    async succeed(value: typeof result) { row = { ...row!, status: "succeeded", result: value }; return true; },
    async fail(status: number) { row = { ...row!, status: "failed", error_status: status }; },
  };
  return port;
}
Deno.test("a successful call and lost-response retry spend once and replay the receipt", async () => {
  const store = ledger(); let calls = 0;
  const generate = async () => { calls++; return result; };
  assert((await runOnce("digest", store, generate, () => 502)).status === 200);
  assert((await runOnce("digest", store, generate, () => 502)).result === result);
  assert(calls === 1);
  assert((await runOnce("changed payload", store, generate, () => 502)).status === 409);
  assert(calls === 1);
});
Deno.test("concurrent repeated requests do not launch duplicate provider work", async () => {
  const store = ledger(); let release!: () => void, calls = 0;
  const generate = async () => { calls++; await new Promise<void>(resolve => { release = resolve; }); return result; };
  const first = runOnce("digest", store, generate, () => 502);
  await Promise.resolve(); await Promise.resolve();
  assert((await runOnce("digest", store, generate, () => 502)).status === 409);
  release(); await first; assert(calls === 1);
});
Deno.test("timeout and failure receipts are definitive; the same ID never spends again", async () => {
  for (const status of [408, 502]) {
    const store = ledger(); let calls = 0;
    const generate = async () => { calls++; throw new Error("Private provider error"); };
    assert((await runOnce("digest", store, generate, () => status)).status === status);
    assert((await runOnce("digest", store, generate, () => status)).status === status);
    assert(calls === 1);
  }
});
Deno.test("a lost receipt-store write retains the claim instead of billing again", async () => {
  const store = ledger(); store.succeed = async () => false; let calls = 0;
  const generate = async () => { calls++; return result; };
  assert((await runOnce("digest", store, generate, () => 502)).status === 503);
  assert((await runOnce("digest", store, generate, () => 502)).status === 409);
  assert(calls === 1);
});
