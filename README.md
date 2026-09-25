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

The schema requires `activityId`, `activityContext`, `userReflection`, and exactly three `intentions`. Unexpected fields are rejected. The schema tests cover valid data, empty reflection text, oversized reflection text, missing intentions, and unexpected fields.

From the repository root, run the schema tests with:

```bash
deno test \
    --config supabase/functions/guided-reflection/deno.json \
    supabase/tests/schema/guidedReflectionSchema.tests.ts
```

If you are already inside the `supabase` directory, use:

```bash
deno test \
    --config functions/guided-reflection/deno.json \
    tests/schema/guidedReflectionSchema.tests.ts
```

The guided-reflection function uses the same schema before querying Supabase. Keep `deno.lock` committed when dependencies change so the Zod version remains reproducible.

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