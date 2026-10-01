# Mindfulness response — MIN-56

`POST /functions/v1/mindfulness-response` requires a Supabase user access token
in `Authorization: Bearer <access_token>`. The existing
`withSupabase({ auth: "user" }, ...)` and `ctx.userClaims?.id` authenticate the
caller. Gateway `verify_jwt = false` delegates verification to this helper.

## Contract

Request:

```json
{
  "activityId": "week-1-intention",
  "activityContext": "Intention Mirror",
  "userReflection": "I want to pause before reacting."
}
```

The shared `guidedReflectionSchema.safeParse` validates and trims the three
fields before any provider call. Activity IDs are lowercase hyphenated slugs
(maximum 100 characters), context is 1–4000 characters, and reflection is 3–2000
characters. Additional fields, including client-generated `intentions` and
`devMockScenario`, are rejected.

Success is HTTP 200 with exactly these fields:

```ts
{
  intentions: [
    { title: string; explanation: string },
    { title: string; explanation: string },
    { title: string; explanation: string }
  ];
  provider: "mock";
}
```

The merged `generateMockGuidedReflection(context, reflection, scenario, timing)`
adapter supplies the intentions. `guidedReflectionResponseSchema.safeParse`
validates exactly three objects and normalizes whitespace before returning them.
Malformed provider output becomes 502. No provider implementation is duplicated.
No database writes, Expo changes, private logs, or external provider calls
occur.

Errors always contain only `{ error: string, message: string }`:

| HTTP | error            | message                                       |
| ---- | ---------------- | --------------------------------------------- |
| 400  | INVALID_INPUT    | The mindfulness request is invalid.           |
| 401  | AUTH_REQUIRED    | Sign in to request intentions.                |
| 408  | PROVIDER_TIMEOUT | The provider timed out. Please try again.     |
| 502  | PROVIDER_ERROR   | Intentions are unavailable. Please try again. |

Provider exceptions, stack traces, validation diagnostics, and authentication
helper diagnostics are never returned. Middleware 401 responses are normalized
while preserving CORS headers. Authenticated non-POST requests return 405 with
`Allow: POST`; the helper handles unsigned OPTIONS preflight.

## Timeout and mock selection

The endpoint enforces a five-second response deadline and maps the adapter's
`ProviderTimeoutError` to 408. The adapter has no cancellation API: after the
response deadline, an already-running adapter operation may finish in the
background. The endpoint clears its own deadline timer on every outcome.

This ticket explicitly uses the mock adapter. It does not enable the future
provider stub through `providerSelector`. Existing server-only
`MOCK_PROVIDER_SCENARIO`, `MOCK_PROVIDER_DELAY_MS`, and
`MOCK_PROVIDER_TIMEOUT_MS` settings support QA scenarios; request fields cannot
select a scenario. Never put private provider settings in Expo.

## Verification

From the repository root:

```sh
npx --yes --package=deno deno task tests
npx --yes --package=deno deno check --config supabase/functions/mindfulness-response/deno.json supabase/functions/mindfulness-response/index.ts supabase/functions/mindfulness-response/index_test.ts
npx --yes --package=deno deno lint supabase/functions/mindfulness-response
npx --yes --package=deno deno fmt --check supabase/functions/mindfulness-response
git diff --check
```

Tests exercise the real authentication helper with temporary signed tokens and
the actual mock adapter's success, delayed, timeout, and failure scenarios.
Server-side injection additionally covers malformed provider output, unexpected
exceptions, normalization, validation-before-invocation, and a never-settling
provider. No real project credentials or database are needed for these tests.

For local HTTP checks, start Docker, run `npx supabase start`, then
`npx supabase functions serve mindfulness-response`. POST the example request to
`http://127.0.0.1:54321/functions/v1/mindfulness-response`: without a user token
expect 401; with a local signed-in user's bearer token expect 200 and three
intentions. With server scenario `timeout` expect 408; with `error` expect 502.

## Differences from other contracts

This replaces the old shell's `activityId/reply/status` placeholder with the
shared schema and existing frontend's `intentions/provider` contract. The
separate `guided-reflection` endpoint uses a UUID activity ID, writes session
metadata, and returns 504 on timeout. It remains unchanged; MIN-56 uses the
shared slug schema and explicitly requires 408. Earlier MIN-52 versions required
intentions in the request; the current merged schema no longer does.
