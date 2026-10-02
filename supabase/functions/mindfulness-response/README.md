# Mindfulness response — MIN-67 / MIN-74

`POST /functions/v1/mindfulness-response` uses the existing
`withSupabase({ auth: "user" }, ...)` authentication and user-scoped Supabase
client. No service-role client is used.

## Request and result

```json
{
  "submissionId": "660e8400-e29b-41d4-a716-446655440000",
  "activityId": "550e8400-e29b-41d4-a716-446655440000",
  "activityContext": "Intention Mirror",
  "userReflection": "I want to pause before reacting."
}
```

The client generates one submission UUID per intentional submit action and keeps
that ID and payload for transport retries. A new ID is a new generation request,
even if its text is identical. Reusing an ID with changed normalized input
returns 409. Never supply a user ID; ownership is derived from authentication in
both the endpoint and database functions.

This endpoint extends the shared request schema with `submissionId` and narrows
`activityId` to a database UUID. There is no slug-to-UUID mapping in the
repository. The activity must be a visible Week 1 activity. Context/reflection
validation and the provider response schema remain shared and unchanged. Context
and reflection are normalized by the shared schema before hashing and
generation.

Success remains exactly
`{ intentions: [{title, explanation}, ...], provider:
"mock" }`, with three
intentions. The response is returned only after the result and
`progress.generated_intentions` have been committed atomically. Existing
writing, answers, step/status, and completion timestamps remain untouched.

## Durable idempotency and persistence

The migration adds `intention_submissions`, keyed by authenticated user and
submission UUID, with RLS and SECURITY INVOKER claim/finish functions. A unique
insert claims the request before the unchanged mock-provider adapter is called.
Only the successful claimant generates. The ledger stores a SHA-256 hash of the
normalized request (not the raw context/reflection), a claim token, state, and
completed response or safe failure status. Treat hashes as private user data.

Completion updates the existing progress table using its
`(user_id, activity_id)` primary key and RLS. A database transaction saves both
progress and the replay result, so they cannot partially commit. The finish
function validates the stored mock result as defense in depth. Per-activity
completion serialization prevents an earlier slow submission from replacing a
later successful submission.

MIN-64's helpers import the Expo client and cannot run inside an Edge Function.
They remain unchanged and continue loading these rows; the integration test uses
`loadWeekOneProgress` to verify reload. Atomic completion needs the specialized
SQL transaction rather than two separate client upserts. No general progress
helper or provider implementation is duplicated.

Replay does not invoke the provider or rewrite progress. Provider failure or
timeout records a failure without touching previous intentions. A failed ID
replays the same safe error; use a new submission ID for an intentional retry.

A processing ID returns 409. It is deliberately not reclaimed automatically:
provider calls have no cancellation/idempotency API, so automatic reclamation
could generate twice. A crash or unresolved persistence error can leave a
pending claim requiring operator investigation. This implements at-most-once
provider invocation per ID, not guaranteed completion after arbitrary process
failure. No ledger retention/deletion job is included. Different submissions
updating the same activity retain the latest successfully completed submission
by claim order.

## Errors

All listed errors contain only `{ error, message }`; internal exceptions, stack
traces, provider messages, and authentication diagnostics are not returned.

| HTTP | Error                   | Meaning                                              |
| ---- | ----------------------- | ---------------------------------------------------- |
| 400  | INVALID_INPUT           | Invalid request or unavailable Week 1 activity       |
| 401  | AUTH_REQUIRED           | Missing/invalid user authentication                  |
| 408  | PROVIDER_TIMEOUT        | Five-second generation deadline or adapter timeout   |
| 409  | SUBMISSION_CONFLICT     | Pending submission or ID reused with different input |
| 502  | PROVIDER_ERROR          | Provider failure or invalid provider response        |
| 503  | PERSISTENCE_UNAVAILABLE | Storage failure; retry the same ID                   |

The provider deadline does not cancel the adapter, and does not cover database
round trips. Late provider results are not saved after a timeout. The separate
`guided-reflection` endpoint remains unchanged (including its 504 timeout).
OPTIONS/CORS remains handled by the auth helper; non-POST requests return 405.

## HTTP endpoint integration coverage (MIN-74)

With Docker running, mobile dependencies installed (`npm ci --prefix mobile`),
and local Supabase started with the merged migrations applied
(`npx supabase
start` and `npx supabase migration up --local`), run this
**single command from the repository root**:

```sh
npm --prefix mobile run test:endpoint-integration
```

Use WSL/Linux for this local Docker suite. Stop any other
`supabase functions
serve` process first, and do not run other HTTP suites
concurrently: this command owns the local Edge runtime while it switches the
existing server-side mock scenario settings. It starts/stops its own CLI process
groups, creates a temporary local authenticated user, and removes that user and
its rows afterward. Its temporary environment file lives in the Git metadata
directory and is removed on completion. No remote project, service-role HTTP
client, or production code is used. The command exits nonzero on assertion/setup
failure; missing Docker, migrations, or dependencies are not skipped.

All requests exercise the real `/functions/v1/mindfulness-response` route,
Supabase user authentication, the merged mock adapter, and MIN-67's database
claim/finish functions. The existing Node test runner and MIN-64 progress reload
harness are reused.

| HTTP scenario                                                                                                | Verified status/contract                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Valid signed-in request; maximum allowed context/reflection lengths                                          | 200; exactly three `{title, explanation}` intentions and `provider: "mock"`; saved progress reloads            |
| Missing or invalid authentication                                                                            | 401 `AUTH_REQUIRED`                                                                                            |
| Empty/malformed JSON, missing/empty fields, whitespace-only reflection, client-supplied ownership/intentions | 400 `INVALID_INPUT`                                                                                            |
| Context over 4000 or reflection over 2000 characters                                                         | 400 `INVALID_INPUT`                                                                                            |
| Identical/normalized duplicate submission                                                                    | 200; same saved result, one ledger row, no progress rewrite; also replays while provider is configured to fail |
| Same submission ID with changed input                                                                        | 409 `SUBMISSION_CONFLICT`                                                                                      |
| Retry while original HTTP request is processing                                                              | 409 `SUBMISSION_CONFLICT`                                                                                      |
| Real adapter timeout or five-second endpoint deadline                                                        | 408 `PROVIDER_TIMEOUT`; failed retry remains 408                                                               |
| Real adapter error                                                                                           | 502 `PROVIDER_ERROR`; failed retry remains 502                                                                 |

Every failure asserts the exact `{error, message}` JSON contract and JSON
content type, rejects credentials/private configuration values and
internal/stack markers, and never prints a failure body in assertion
diagnostics. Provider failures preserve the previous progress, including after a
delayed result arrives. The suite uses the existing `success`, `error`,
`timeout`, and `delayed` server scenarios; it does not inject providers or
manufacture failed ledger rows.

A fresh submission UUID intentionally starts a new generation. Pending IDs are
not automatically reclaimed, matching MIN-67. Restart ordinary local serving
before using the older persistence suite below; this command stops its own
serving process when finished.

## Verification

From the repository root:

```sh
npx --yes --package=deno deno task tests
npx --yes --package=deno deno check --config supabase/functions/mindfulness-response/deno.json supabase/functions/mindfulness-response/index.ts supabase/functions/mindfulness-response/index_test.ts
npx --yes --package=deno deno lint supabase/functions/mindfulness-response mobile/tests/integration/intention-persistence.test.cjs
npx --yes --package=deno deno fmt --check supabase/functions/mindfulness-response mobile/tests/integration/intention-persistence.test.cjs
node --test mobile/tests/*.test.cjs
git diff --check
```

With Docker and mobile dependencies installed, apply the new migration only to
local Supabase and serve the endpoint:

```sh
npx supabase start
npx supabase migration up --local
npx supabase functions serve mindfulness-response
```

In another terminal:

```sh
node --test mobile/tests/integration/*.test.cjs
npx supabase db lint --local
```

The MIN-67 Docker suite uses two temporary local users, HTTP requests, and
MIN-64 reloads. It tests replay, concurrency, payload conflict, ownership,
stored failure replay preserving progress, atomic validation failure, and
out-of-order success. Endpoint unit tests verify provider invocation counts and
exception handling. Fixture users are deleted from local Docker afterward. No
shared project is used. Run `npx tsc --noEmit` and
`npm run check:client-security` inside `mobile`.
