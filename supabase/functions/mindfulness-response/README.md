# Mindfulness response shell (Sept. 24)

`POST /functions/v1/mindfulness-response` requires a signed-in user's access
token in `Authorization: Bearer <access_token>`. Authentication uses the same
`withSupabase({ auth: "user" }, ...)` helper and `ctx.userClaims?.id` as the
existing guided-reflection function.

Request (all three fields are strings):

```json
{
  "activityId": "week-1-intention",
  "activityContext": "Intention Mirror",
  "userReflection": "I want to pause before reacting."
}
```

Temporary HTTP 200 response:

```json
{
  "activityId": "week-1-intention",
  "reply": "Your reflection has been received. Mindfulness responses are coming soon.",
  "status": "placeholder"
}
```

The exported TypeScript request/response types describe this shell contract.
Only basic JSON/field-type validation is included. There are no provider calls,
activity lookups, database writes, or reflection logs. Provider integration,
domain validation, and progress persistence belong to later tickets.

Missing or invalid user tokens receive JSON 401 from the auth helper. A
defensive missing-user check also returns 401. Authenticated non-POST requests
receive 405 with `Allow: POST`; invalid JSON or field types receive 400. The
helper handles OPTIONS and CORS. `verify_jwt = false` delegates JWT verification
to this helper; it does not make POST public. No provider or service-role
secrets are required by the shell, and no Expo files or environment variables
were changed.

## Automated checks

From the repository root (Node/npm required; Deno is fetched if needed):

```sh
npx --yes --package=deno deno test --config supabase/functions/mindfulness-response/deno.json --allow-env supabase/functions/mindfulness-response/index_test.ts
npx --yes --package=deno deno lint supabase/functions/mindfulness-response
npx --yes --package=deno deno fmt --check supabase/functions/mindfulness-response
git diff --check
```

The test invokes the exported endpoint through the real authentication helper,
using ephemeral ES256 keys and signed tokens. It checks 200, missing/malformed/
expired/wrong-signature token 401s, invalid-body 400s, GET 405, and unsigned
preflight. Test execution has no network permission and needs no project
secrets, Supabase login, or running database. This verifies handler/middleware
behavior; it does not substitute for a deployed-environment test.

## Local HTTP verification

With Docker running, start the local stack and serve the function:

```sh
npx supabase start
npx supabase functions serve mindfulness-response
```

In another terminal, an unsigned request should return JSON 401:

```sh
curl -i http://127.0.0.1:54321/functions/v1/mindfulness-response \
  -H 'Content-Type: application/json' \
  -d '{"activityId":"week-1-intention","activityContext":"Intention Mirror","userReflection":"I want to pause before reacting."}'
```

Sign into a local test account through Supabase Auth and set `ACCESS_TOKEN` to
its session access token. A publishable/anon key is not a user access token.
Then:

```sh
curl -i http://127.0.0.1:54321/functions/v1/mindfulness-response \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"activityId":"week-1-intention","activityContext":"Intention Mirror","userReflection":"I want to pause before reacting."}'
```

Expect the HTTP 200 placeholder above. No shared deployment is needed for these
checks. Never place access tokens or private keys in committed files.
