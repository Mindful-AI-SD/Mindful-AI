# Week 1–2 AI Validation Matrix

Scheduled: 2026-10-14  
Last executed: 2026-10-19

## Run

From the repository root, start local Supabase with Docker (which applies the repository migrations), then run:

```bash
npx supabase start
npm --prefix mobile run test:ai-validation
npm --prefix mobile run test:endpoint-integration
deno task tests
```

The AI validation script runs isolated client/state tests first, followed by the authenticated `guided-reflection` and `ai-activity` HTTP suites one at a time. The endpoint integration script additionally covers `mindfulness-response`. These HTTP tests use the real local Edge runtime, authentication, database activity lookup, and mock provider. They refuse non-loopback Supabase URLs; they do not send requests to a shared or production project. `deno task tests` runs the server-side schema, safety, provider, and function tests.

## Matrix

| Week / path | Input or boundary | Expected result | Automated coverage |
|---|---|---|---|
| Week 1 — `intention_mirror` | Authenticated reflection with leading/trailing whitespace | Trimmed reflection is sent once; receive exactly three typed intentions for the same kind | `tests/ai-activity.test.cjs`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Week 1 — `intention_mirror` | Missing/invalid auth; malformed JSON; unknown kind; wrong/missing fields; reflection under 3 or over 2,000 characters; extra fields | Stable 401 or 400 response; no invalid data presented as a success | `tests/ai-activity.test.cjs`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Week 1 — `intention_mirror` | Empty, whitespace-only, minimum/maximum length, vague, irrelevant, synthetic personal reflection on legacy `guided-reflection` route | Empty/too-short/oversized input is rejected; allowed reflections get the documented generic result | `tests/integration/endpoint/guided-reflection-fixtures.test.cjs`; fixture data: `supabase/tests/fixtures/guidedReflectionEndpointTestCases.json` |
| Week 2 — `sensation_lexicon` | Exactly three sensations, including whitespace and vague text | Each input is trimmed; exactly three result items echo the corresponding input; suggestions are shape-checked | `tests/sensation-lexicon.test.cjs`; `tests/ai-activity.test.cjs`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Week 2 — `sensation_lexicon` | Missing/invalid auth; fewer/more than three sensations; blank/over-limit entries; wrong activity ID; extra fields | Stable 401/400/404; no malformed or mismatched result is accepted | `tests/ai-activity.test.cjs`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Weeks 1–2 — provider/client failure | Offline/network failure, 400/401/408/501/502/503, provider throw, malformed or cross-kind response, timeout, cancellation, late response | Sanitized recoverable error; cancellation/timeout stops the request; retry is explicit and does not mutate saved input or replace a newer result | `tests/ai-activity.test.cjs`; `tests/ai-activity-recovery.test.cjs` |
| Weeks 1–2 — crisis boundary | Crisis language in a reflection or nested activity input; also crisis text that would otherwise fail length validation | Fixed `support` response (including support resources), not an AI result; crisis check takes priority over ordinary validation | `tests/integration/endpoint/ai-activity-http.test.cjs`; `tests/integration/endpoint/guided-reflection-fixtures.test.cjs` |
| Weeks 1–2 — Practice state | Audio, timed, unguided, or video player state attached to a request | Only the defined AI input is sent; unknown server request fields are rejected; valid clean result is unchanged | `tests/ai-activity-practice.test.cjs`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Weeks 1–2 — privacy and persistence | Student text, credentials, provider errors, and client bundle/config boundaries | Client errors do not expose private server diagnostics or student text; provider/service credentials and server-only imports are excluded from client code; `ai-activity` requests do not create rows in the checked tables | `tests/ai-activity.test.cjs`; `npm run check:client-security`; `tests/integration/endpoint/ai-activity-http.test.cjs` |
| Weeks 1–2 — saved progress ownership | Progress reads/writes and account changes | Progress is scoped to the signed-in user/activity; failed writes and ownership/conflict failures do not erase saved answers or advance completion | `tests/gap-reflection.test.cjs`; `tests/week-one.test.cjs`; `tests/week-two.test.cjs` |

## Observed evidence (2026-10-19)

| Test name(s) | Expected result | Observed status |
|---|---|---|
| `intention_mirror: signed-in request uses the one authenticated contract and returns its typed result`; `sensation_lexicon: signed-in request uses the one authenticated contract and returns its typed result` (`tests/ai-activity.test.cjs`) | Send only the typed, authenticated request and accept only the matching typed result | **PASS** — included in the AI validation run (95 passed, 0 failed) |
| `endpoint failures map to stable codes and never expose server text`; `a request that never reaches the server is a NETWORK_ERROR` (`tests/ai-activity.test.cjs`) | Map failures to stable client error codes without exposing server diagnostics | **PASS** — included in the AI validation run |
| `intention_mirror after timed Practice: player state attached to the request never leaves the app`; `sensation_lexicon after timed Practice: player state attached to the request never leaves the app` (`tests/ai-activity-practice.test.cjs`) | Keep player state local and omit it from AI requests | **PASS** — included in the AI validation run |
| `sensation_lexicon: no connection leaves the saved input untouched and the same request retries successfully`; `intention_mirror: a failed request does not change an earlier valid result` (`tests/ai-activity-recovery.test.cjs`) | Preserve saved inputs/results through failures; retry only when requested | **PASS** — included in the AI validation run |
| `check:client-security` (`scripts/check-client-security.cjs`) | Reject server-only credentials/imports and allow only public client configuration | **PASS** — completed in the AI validation pipeline |
| `allows only public client configuration`; `finds secret keys and service-role JWTs without echoing values`; `blocks server environment references, dynamic reads, and backend imports`; `patched router decoder preserves query parameters and handles malformed input without hanging` (`tests/client-security.test.cjs`) | Enforce client security checks and ensure malformed query decoding terminates | **PASS** — standalone run: 4 passed, 0 failed |
| `crisis check: detects …`; `crisis check: does not flag …`; `crisis response: names 988, UCF CAPS, and emergency services`; reflection policy tests for crisis priority and ordinary/invalid input (`supabase/tests/safety/crisisSupport_test.ts`, `supabase/tests/safety/reflectionPolicy_test.ts`) | Detect crisis cases, avoid flagging ordinary text, return the fixed support resources, and prevent provider execution for crisis input | **PASS** — included in `deno task tests` (350 tests passed, 0 failed) |
| `guided-reflection fixtures pass through the authenticated HTTP endpoint` (`tests/integration/endpoint/guided-reflection-fixtures.test.cjs`) | Exercise fixture cases through local authenticated HTTP, including validation and fixed crisis support | **PASS** — 14 passed, 0 failed |
| `ai-activity: Week 1, 2, and 3 mock paths over real HTTP, authentication, and the database` (`tests/integration/endpoint/ai-activity-http.test.cjs`) | Verify real local HTTP/auth/database behavior, crisis response, and no endpoint persistence | **PASS** — 18 passed, 0 failed |
| `MIN-74: actual HTTP authentication, validation, and submission contracts` (`tests/integration/endpoint/endpoint-http.test.cjs`) | Verify authentication, request validation, crisis response without persistence, replay/conflict behavior, and provider failure handling | **PASS** — 14 passed, 0 failed |
| `mindfulness endpoint with real Supabase authentication middleware` (`supabase/functions/mindfulness-response/index_test.ts`) | Validate authenticated submission, storage failures, timeout recovery, and preserving prior saved intentions | **PASS** — 1 test, 33 steps passed, 0 failed |
| `AI activity endpoint with real Supabase authentication middleware` (`supabase/functions/ai-activity/index_test.ts`) | Validate authenticated route behavior, sanitized failures, concurrent requests, and recovery | **PASS** — 1 test, 119 steps passed, 0 failed |

## Privacy boundaries and interpretation

- The unified `ai-activity` route accepts only its typed request fields, requires a user session, and validates that the activity is published. Its HTTP test compares row counts before and after calls across `ai_sessions`, `progress`, `intention_submissions`, and `reflections`; it expects no writes.
- Week 1 and Week 2 progress answers are separately saved as user/activity-scoped progress. The persistence tests verify ownership and failure behavior; this is distinct from persistence by the AI endpoint.
- The compatibility `guided-reflection` route is also covered for Week 1. Its implementation creates an `ai_sessions` metadata row after a normal provider response; it does not insert the reflection text in that row. Crisis handling exits before provider execution and session creation. The route test validates result/error response shapes and the crisis support result.
- Current endpoint integration is against the local mock provider, which makes no external AI-provider calls. These results do not certify the disclosure, retention, or training practices of a future remote provider.
- The privacy checks are regression tests for the behaviors listed above; they are not a legal/privacy-policy review or a guarantee against infrastructure-level logging outside these code paths.

## Latest results

Commands:

```text
npm.cmd --prefix mobile run test:ai-validation
npm.cmd --prefix mobile run test:endpoint-integration
node --test tests/client-security.test.cjs  (from mobile/)
deno task tests
```

Executed: 2026-10-19
Result: **PASS**

- Client/state checks: **95 passed, 0 failed**.
- `npm run check:client-security`: **passed**.
- Standalone client-security tests: **4 passed, 0 failed**; the malformed-query decoder regression noted in the previous run now passes.
- `guided-reflection` authenticated HTTP fixtures: **14 passed, 0 failed**.
- `ai-activity` authenticated HTTP integration: **18 passed, 0 failed**.
- Full endpoint integration: `mindfulness-response` **14 passed**, `guided-reflection` **14 passed**, and `ai-activity` **18 passed**; **0 failures** across the three suites.
- `deno task tests`: **350 passed, 0 failed**; `mindfulness-response` function test **1 passed (33 steps)** and `ai-activity` function test **1 passed (119 steps)**; **0 failures**.
- The HTTP test runner emits Node's `DEP0190` deprecation warning for child-process arguments with `shell: true`; all affected suites pass.
- No live or external AI provider was called.

The prior run's Docker/Deno blockers are cleared. The deprecation warning is non-failing and remains a maintenance item; it does not block the recorded test results.
