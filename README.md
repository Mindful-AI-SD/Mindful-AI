# Mindful AI

Mindful AI is a mobile application supporting an eight-week curriculum involving mindfulness, AI literacy, ethics activities, reflections, and student progress.

## Technology

- Mobile application: Expo and React Native
- Language: TypeScript
- Backend: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Server functions: Supabase Edge Functions

## Repository Structure

```text
Mindful-AI/
├── mobile/                 Expo mobile application
│   ├── lib/                Supabase and backend helpers
│   ├── src/app/            Application screens and routes
│   ├── .env.example        Required mobile environment variables
│   └── package.json
└── supabase/
    ├── functions/          Server-side Edge Functions and Deno config
    ├── migrations/         Database schema and RLS policies
    ├── schema/             Shared Zod validation schemas
    ├── tests/              Deno schema and backend tests
    └── config.toml         Supabase local configuration
```

## Requirements

Install the following before starting:

- Git
- A current Node.js LTS release
- Expo Go on a physical phone, or an Android/iOS emulator
- Visual Studio Code or another code editor
- Supabase CLI access for backend developers
- Deno for Supabase Edge Function and schema tests

## Clone and Run the Mobile App

Clone the repository:

```bash
git clone https://github.com/Mindful-AI-SD/Mindful-AI.git
cd Mindful-AI/mobile
```

Install dependencies:

```bash
npm install
```

Create your local environment file.

Windows PowerShell:

```powershell
Copy-Item ".env.example" ".env"
```

macOS or Linux:

```bash
cp .env.example .env
```

Ask the project lead for these two safe frontend values and add them to `mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not commit `.env`.

Start Expo:

```bash
npx expo start -c
```

Open the project with Expo Go or an emulator. A successful setup displays:

```text
Mindful AI
Backend connected
Service: mindful-ai
Version: 0.1.0
```

## TypeScript Check

Before committing frontend code, run:

```bash
cd mobile
npx tsc --noEmit
```

No output means the check passed.

## Backend Setup

Backend developers must be invited to the Supabase project by the project owner.

From the repository root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REFERENCE
```

The project reference is available in the Supabase dashboard project URL and project settings.

Check the current linked project:

```bash
Get-Content "supabase\.temp\project-ref"
```

### Database Changes

Database changes must be stored in migration files rather than made only through the dashboard.

Create a migration:

```bash
npx supabase migration new short_description
```

Migration files are created under:

```text
supabase/migrations/
```

Review a migration before applying it:

```bash
npx supabase db push --dry-run
```

Coordinate with the backend and security team before running a real database push:

```bash
npx supabase db push
```

### Edge Functions

Create a function:

```bash
npx supabase functions new function-name
```

Deploy a function:

```bash
npx supabase functions deploy function-name
```

The existing `health` function is a public endpoint containing only non-sensitive service status information. Future endpoints involving users, student data, or AI calls must require authentication.

### Guided Reflection Validation

The guided-reflection request is validated with the shared Zod schema at:

```text
supabase/schema/guidedReflectionSchema.ts
```

The schema requires `activityId`, `activityContext`, and `userReflection` for requests, and exactly three `intentions` for responses. Unexpected fields are rejected. The endpoint fixture suite sends each case through the authenticated local `guided-reflection` route and compares its HTTP status and complete JSON body. Run it with `npm --prefix mobile run test:endpoint-integration` after starting local Supabase. Empty, too-short, and oversized reflections return a controlled validation error; ordinary inputs receive generic intentions; and clearly concerning text receives supportive, non-clinical intentions. The mock makes no external provider calls and does not diagnose or assess crisis risk.

From the repository root, run all tests with:

```bash
deno task tests
```

The task discovers test files recursively under `supabase/tests/` and `supabase/functions/mindfulness-response/`, using each directory's Deno config. New tests in either directory are included automatically when named with Deno's test-file suffix, such as `feature_test.ts`.

The guided-reflection function uses the same schema before querying Supabase. Keep `deno.lock` committed when dependencies change so the Zod version remains reproducible.

### Mock Provider Adapter

The mock LLM provider adapter lives at:

```text
supabase/functions/_shared/providers/mockProviderAdapter.ts
```

It exposes `generateMockGuidedReflection(activityContext, userReflection, scenario?, timing?)`, which any real provider adapter will later implement behind the same signature. Four scenarios are supported: `success` (default), `delayed`, `timeout`, and `error`. The active scenario is chosen server-side, by the `MOCK_PROVIDER_SCENARIO` environment variable or, only when `MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE=true` is explicitly set, by a `devMockScenario` field on the request body. That field is stripped before schema validation and is never part of the production request contract.

Run the adapter's contract test suite on its own with:

```bash
deno task test:mock-adapter
```

This suite asserts the frozen response contract: exactly three `intentions` on success, `provider: "mock"`, stable `title`/`explanation` field names with no extra keys, and stable `PROVIDER_TIMEOUT`/`PROVIDER_ERROR` error codes on failure. It fails if that contract changes unexpectedly. It also runs as part of `deno task tests`.

### Provider Selection

Which guided-reflection provider runs is chosen server-side by the `GUIDED_REFLECTION_PROVIDER` environment variable, defined in:

```text
supabase/functions/_shared/providers/providerSelector.ts
```

It defaults to `mock`, and an unset or unrecognized value always falls back to `mock` (with a logged warning for the latter) so the endpoint can never be left without a working provider. Every provider — mock included — implements the shared `GuidedReflectionProvider` interface in `supabase/functions/_shared/providers/types.ts`: `(activityContext, userReflection) => Promise<ProviderResponse>`.

`supabase/functions/_shared/providers/futureProviderAdapter.ts` is an unimplemented stub for the next real provider (a candidate is UCF Copilot, pending API access; not yet final). Selecting it via `GUIDED_REFLECTION_PROVIDER=future` fails every call with a `ProviderNotConfiguredError` (HTTP 501) until it's implemented. Because it satisfies the same interface, implementing it later requires no changes to the endpoint, the response schema, or the frontend — only filling in that one file. None of these provider modules are imported anywhere under `mobile/`.

### QA Demo Scenarios

Each of the four mock provider states can be triggered repeatedly during QA by setting **one environment variable on the server** — no source changes and no edits to the app's request body are needed. Set `MOCK_PROVIDER_SCENARIO` to exactly one of:

| `MOCK_PROVIDER_SCENARIO` value | What happens | How to recognize it |
| --- | --- | --- |
| `success` (default) | Resolves immediately | Response `intentions[].title` starts with `[Demo: Normal Success]` |
| `delayed` | Resolves after `MOCK_PROVIDER_DELAY_MS` (default 1500ms) | Response `intentions[].title` starts with `[Demo: Slow Success]` |
| `timeout` | Fails after `MOCK_PROVIDER_TIMEOUT_MS` (default 5000ms) | HTTP 504, `message` starts with `[Demo: Timeout]` |
| `error` | Fails immediately | HTTP 502, `message` starts with `[Demo: Provider Failure]` |

Restart or redeploy the function after changing the variable for it to take effect. This is the supported way to demo/QA all four states; the separate `devMockScenario` request-body override (gated behind `MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE=true`) still exists for automated per-request testing, but is not required for manual QA.

**Production safety:** with no server-side configuration set, the scenario is always `success` and a `devMockScenario` field on the request body has no effect — it's stripped before validation and only ever consulted if `MOCK_PROVIDER_ALLOW_SCENARIO_OVERRIDE=true` was explicitly set on the server. An ordinary client can never reach `delayed`, `timeout`, or `error` on its own. This is covered by `supabase/tests/providers/mockScenarioSecurity_test.ts`.

## Security Rules

- Never commit `.env` files.
- Never place a Supabase service-role key in the mobile app.
- Never place OpenAI, Gemini, or other LLM API keys in the mobile app.
- Store private API keys only as server-side Supabase secrets.
- Enable Row Level Security on every table exposed through Supabase.
- Students must only access their own private reflections and progress.
- Administrative operations must not be available through the mobile client.
- LLM endpoints must require authentication and should have rate limits.
- Do not log student reflections, access tokens, or private AI conversations.

The Supabase publishable key may be used by the mobile app because database access is restricted by Row Level Security.

## Team Responsibilities

### Frontend

- Work primarily in `mobile/src/`.
- Use the shared Supabase client from `mobile/lib/supabase.ts`.
- Do not add secret keys to frontend code.
- Confirm changes in Expo Go or an emulator.
- Run the TypeScript check before opening a pull request.

### Backend

- Store database changes in `supabase/migrations/`.
- Store server logic in `supabase/functions/`.
- Coordinate before pushing migrations to the shared database.
- Keep API responses small and documented.

### LLM Integration

- Make model-provider requests only from Supabase Edge Functions.
- Keep provider API keys in server-side secrets.
- Require an authenticated user for AI endpoints.
- Avoid sending unnecessary identifying or private student information.
- Add input validation, error handling, and rate limits.

### Security

- Review every migration and its Row Level Security policies.
- Test that one student cannot access another student’s data.
- Review authentication requirements for Edge Functions.
- Check pull requests for accidentally committed secrets.
- Document security findings and recommended fixes.

## Git Workflow

Do not write new work directly on `main`.

Start from an updated `main` branch:

```bash
git switch main
git pull --ff-only
git switch -c role/short-description
```

Examples:

```text
frontend/login-screen
backend/reflection-endpoint
llm/guided-reflection
security/rls-tests
docs/team-setup
```

Before committing:

```bash
git status
git diff --check
```

Stage only the intended files:

```bash
git add path/to/file
```

Check the staged changes:

```bash
git diff --cached --check
git status
```

Commit and push:

```bash
git commit -m "Describe the completed change"
git push -u origin your-branch-name
```

Open a pull request into `main`. After review, use **Squash and merge** and delete the remote feature branch.

## Current Foundation

The repository currently includes:

- An Expo application that runs on a phone or emulator
- A configured Supabase mobile client
- A deployed backend health-check function
- An initial PostgreSQL schema
- Row Level Security policies
- Tables for profiles, curriculum weeks, activities, reflections, progress, and AI-session metadata