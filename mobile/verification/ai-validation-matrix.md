# Week 1–2 AI Validation Matrix

Scheduled: 2026-10-14  
Last executed: 2026-10-15

## Run

From the repository root, start local Supabase with Docker (which applies the repository migrations), then run:

```bash
npx supabase start
npm --prefix mobile run test:ai-validation
```

The script runs isolated client/state tests first, followed by the authenticated `guided-reflection` and `ai-activity` HTTP suites one at a time. The HTTP tests use the real local Edge runtime, authentication, database activity lookup, and mock provider. They refuse non-loopback Supabase URLs; they do not send requests to a shared or production project.

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

## Privacy boundaries and interpretation

- The unified `ai-activity` route accepts only its typed request fields, requires a user session, and validates that the activity is published. Its HTTP test compares row counts before and after calls across `ai_sessions`, `progress`, `intention_submissions`, and `reflections`; it expects no writes.
- Week 1 and Week 2 progress answers are separately saved as user/activity-scoped progress. The persistence tests verify ownership and failure behavior; this is distinct from persistence by the AI endpoint.
- The compatibility `guided-reflection` route is also covered for Week 1. Its implementation creates an `ai_sessions` metadata row after a normal provider response; it does not insert the reflection text in that row. Crisis handling exits before provider execution and session creation. The route test validates result/error response shapes and the crisis support result.
- Current endpoint integration is against the local mock provider, which makes no external AI-provider calls. These results do not certify the disclosure, retention, or training practices of a future remote provider.
- The privacy checks are regression tests for the behaviors listed above; they are not a legal/privacy-policy review or a guarantee against infrastructure-level logging outside these code paths.

## Latest results

Command: `npm --prefix mobile run test:ai-validation`  
Executed: 2026-10-15  
Result: **PARTIAL / BLOCKED**

- Client/state checks: **95 passed, 0 failed**.
- `npm run check:client-security`: **passed**.
- `guided-reflection` HTTP integration: **not started**; `npx supabase status` could not connect to `//./pipe/dockerDesktopLinuxEngine` because the Docker engine was unavailable.
- `ai-activity` HTTP integration: **not run**; the script stops at the preceding failed HTTP suite.
- No live or external AI provider was called.

To complete the HTTP results, start Docker Desktop, run the command above again, and replace this result section with the resulting test counts.

Out-of-scope regression noticed during the initial broad test run: `tests/client-security.test.cjs` has a failing malformed-query decoder stress test (`RangeError: Maximum call stack size exceeded` at 12,000 malformed `%C2` sequences). The focused matrix uses the passing client-security scanner instead; this separate router-decoder issue is not included in the Week 1–2 AI result.
