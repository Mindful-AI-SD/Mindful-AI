# MIN-64 progress data-access helpers

These helpers follow the app's existing public Supabase client pattern. They
reuse `WeekOneProgress` from `progress.ts` without changing existing callers. No
Edge Function, schema migration, service-role key, or UI integration is added.

```ts
loadWeekOneProgress(activityId: string): Promise<WeekOneProgress | null>
upsertWeekOneProgress(activityId: string, patch: ProgressPatch): Promise<WeekOneProgress>
```

Identity comes from `supabase.auth.getUser()` and is rechecked around database
operations. There is no caller-supplied user ID. Reads filter on both the
verified user ID and the activity ID. A session change discards the result;
existing RLS remains the database security boundary for concurrent session
changes.

The activity must be a visible, published Week 1 activity with a database UUID.
The activity query joins `weeks` and checks `week_number = 1`, using existing
curriculum RLS. This is different from the AI endpoint's activity-slug contract.
Missing progress returns `null`; `upsertWeekOneProgress(activityId, {})` creates
a row with database defaults. The composite primary key `(user_id, activity_id)`
and `onConflict: "user_id,activity_id"` prevent duplicate rows.

Only `status`, `current_step`, `writing`, `generated_intentions`,
`reflection_answers`, `started_at`, and `completed_at` are writable. Unknown
keys, including `user_id`, `activity_id`, and `updated_at`, are rejected at
runtime. Defined own properties are copied into the write payload; undefined
values are omitted. Omitted columns remain unchanged on update; JSON fields are
replaced, not merged. `updated_at` belongs to the existing database trigger.

The typed patch matches the existing model. Existing database constraints check
status/completion consistency and JSON container shapes. The database does not
validate every nested intention/answer or enforce the model's step union. This
helper does not add step gating, completion eligibility, or nested data
validation. Concurrent writes to the same field are last-write-wins; idempotency
here means one row per user/activity, not an unchanged `updated_at` timestamp.

## Verification

From the repository root:

```sh
node --test mobile/tests/progress-helpers.test.cjs
node --test mobile/tests/*.test.cjs
npx --yes --package=deno deno task tests
npx --yes --package=deno deno lint mobile/lib/progress-helpers.ts mobile/tests/progress-helpers.test.cjs mobile/tests/helpers/load-progress-helpers.cjs mobile/tests/integration/progress-helpers.test.cjs
npx --yes --package=deno deno fmt --check mobile/lib/progress-helpers.ts mobile/lib/progress-helpers.md mobile/tests/progress-helpers.test.cjs mobile/tests/helpers/load-progress-helpers.cjs mobile/tests/integration/progress-helpers.test.cjs
git diff --check
```

Run `npx tsc --noEmit` and `npm run check:client-security` inside `mobile`.

For the local Docker-backed test, install mobile dependencies, start local
Supabase, and apply the already-merged migrations locally:

```sh
npx supabase start
npx supabase migration up --local
node --test mobile/tests/integration/progress-helpers.test.cjs
```

The integration test refuses non-loopback Supabase URLs, creates two temporary
local accounts, and calls the real helpers with public-key authenticated
clients. It tests defaults, partial updates, repeated/concurrent upserts,
missing auth, protected fields, and direct cross-user RLS attacks. Finally, it
deletes only its fixture accounts via the local `supabase_db_Mindful-AI`
container; their rows are removed by the existing foreign-key cascades. No
shared project is used.
