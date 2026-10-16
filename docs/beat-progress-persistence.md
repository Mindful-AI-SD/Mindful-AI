# MIN-110: weekly beat progress

This branch starts at PR #42 head `ad732d7`. It adds persistence helpers and
local integration coverage; it does not wire screens to a new progress path. PR
#42 remains unchanged. Do not open this branch's PR until #42 merges; then
update onto latest main and rerun validation.

## Why week identity

Use `(user_id, week_id, beat_id)`. The schema defines `weeks` as the parent of
`activities`, with multiple ordered child activities allowed per week.
`CurriculumWeek` loads those children as an array. The four-beat `WeekContent`
contract describes the weekly module. Existing Week 1/2 flows happen to receive
an activity UUID for their vertical-slice progress, but no constraint
establishes one activity as a permanent module identity. Reusing that UUID would
create multiple competing sets of four weekly beats if another activity is
added.

Helper `weekId` means **`weeks.id` / `CurriculumWeek.id`**, never `week_number`
(the display ordinal), a `WeekContent.weekNumber`, or an activity UUID. Resolve
the published week through existing curriculum loading, then use its `id`.

## Additive schema and policies

`public.beat_progress` contains:

| Column                                     | Contract                                         |
| ------------------------------------------ | ------------------------------------------------ |
| `user_id`                                  | UUID, defaults to `auth.uid()`, FK to Auth users |
| `week_id`                                  | Bigint FK to `weeks.id`                          |
| `beat_id`                                  | `arrive`, `practice`, `explore`, or `notice`     |
| `status`                                   | `not_started`, `in_progress`, or `completed`     |
| `answers`                                  | JSON object with string values; defaults to `{}` |
| `saved_data`                               | JSON object; defaults to `{}`                    |
| `resume_state`                             | JSON object; defaults to `{}`                    |
| `started_at`, `completed_at`, `updated_at` | Database-managed timestamps                      |

The composite primary key is `(user_id, week_id, beat_id)`. No SQL updates,
backfills, triggers, or foreign keys are added to legacy `progress` rows.
Existing Week 1/2 tables, RLS, loaders, completion checks, and body-map code are
unchanged.

RLS is enabled. Authenticated students can select/delete only rows whose
`user_id = auth.uid()`. Insert/update additionally require the matching week to
be published. Both the existing row and replacement owner are checked on update.
Anonymous clients have no privileges on the table. A trigger rejects identity
changes, so a direct client cannot move an existing row to another owner, week,
or beat. FK cascades follow the existing project pattern for deleted
users/weeks.

The trigger is SECURITY INVOKER with an empty search path, not a privileged
service function. It owns timestamps even for direct public-client writes:

- `not_started`: both lifecycle timestamps are null.
- `in_progress`: a start time is present and completion is null.
- `completed`: both times are present, with completion at or after start.
- Repeated completion retains its timestamp. Reopening retains the start time
  and clears completion. Explicit reset to `not_started` clears both lifecycle
  times.
- Status changes never erase saved JSON. Completion is explicit; neither answers
  nor a resume marker implies completion or changes Week 1 requirements.

Existing owners may still read/delete their rows if a week is later unpublished;
new inserts, updates, and helper upserts are denied. This is intentional: the
published-curriculum policy hides withdrawn content and prevents further work,
while private saved answers remain available to their owner for reading/resume
or deletion. Resume restoration does not grant permission to save or access the
unpublished curriculum. No helper or client uses service-role credentials.

The integration suite separately proves that explicitly supplying another user's
`user_id` on an INSERT fails with RLS error `42501`: `default auth.uid()` is a
convenience, not the security boundary. Direct identity-changing updates to each
of `user_id`, `week_id`, and `beat_id` fail with the immutability trigger's
`P0001` error, and the original row remains unchanged.

## Typed public-client API

`mobile/lib/beat-progress-helpers.ts` imports `BeatId`, `BEAT_IDS`,
`BeatAnswers`, and answer validation from PR #42. It uses the existing public
Supabase singleton and `auth.getUser()` pattern, with account checks before
writes and after reads or writes. Helpers accept no user ID or writable
ownership/timestamp fields.

```ts
loadBeatProgress(weekId, beatId); // BeatProgress | null
listWeekBeatProgress(weekId); // BeatProgress[], canonical order
upsertBeatProgress(weekId, beatId, patch); // BeatProgress
restoreBeatResumeState(weekId, beatId); // BeatResumeState | null
```

`patch` only permits `status`, `answers`, `saved_data`, and `resume_state`.
Undefined fields are omitted. Supplied JSON columns are **replaced as whole
values**; omitted columns survive. Merge draft keys in the caller when needed.
Different beats cannot overwrite each other. Same-field concurrent writes are
last-write-wins; optimistic editing/version conflicts are not implemented.

JSON data must be finite, serializable values in an object; arrays can be nested
inside data. Functions, dates, cyclic objects, undefined JSON values, and
nesting beyond 20 levels are rejected. Answers retain the contract's string-only
format. The database independently checks object shape and string answer values.
Backend diagnostics are replaced with safe helper messages, with no private data
logging. An account change after a request may be detected after that request
commits; the helper then rejects returning the old account's result. RLS applies
to the request's actual authentication throughout.

Resume restoration returns that beat's exact saved status, answers, data, and
position without writing, advancing, or inventing a next allowed beat. An absent
row returns null; listing returns saved rows only. Existing activity gating and
curriculum presentation remain separate concerns.

## Compatibility and exclusions

There is no automatic legacy import or dual write. Old Week 1 screens continue
using existing progress helpers, so old records do not need to become four new
rows. Existing `yellowdig_draft` restore normalization remains in the unchanged
Week 1 code. Completed users remain completed without supplying new beat
answers. Unknown legacy answer keys, writing, intentions, and timestamps are
preserved. New beat writes never update legacy completion or infer its
requirements.

Open teammate PRs #45/#46 add reusable practice types/controls; #47 changes Week
1 practice selection and flow/navigation. Their inspected file lists do not
include this table, migration, or helper. This branch imports none of their
unmerged code and modifies none of their files. Review overlaps again before
opening a PR.

MIN-116 seeding/sponsor wording, MIN-121 body-map storage, instructor queries,
media metadata, UI integration, retention policies, and generic curriculum
completion transactions are outside this change. JSON values are private student
data protected by owner RLS; no analytics/logging/export path is added.

## Local verification

With Docker WSL integration enabled, installed mobile dependencies, and local
Supabase running with the existing Week 1 curriculum:

```sh
node --test mobile/tests/integration/beat-progress.test.cjs
node --test mobile/tests/integration/progress-helpers.test.cjs
node --test mobile/tests/*.test.cjs
npm --prefix mobile test -- --watch=false
npx supabase db lint --local
npm --prefix mobile run check:client-security
git diff --check
```

The beat integration test requires `127.0.0.1`, creates only temporary local
Auth users, saves legacy fixtures **before** running
`npx supabase migration up --local`, and compares them afterward. On repeat runs
the CLI finds no pending migrations. It tests the actual public REST/Auth
interface and database RLS, including reads, updates, deletes, forged
ownership/upserts, invalid direct writes, duplicate upserts, separate weeks,
timestamps, JSON, and unchanged legacy restore rules. The visibility test uses
admin SQL to create, unpublish, and delete one disposable local week; it never
changes visibility on an existing week. One unused `week_number` among 1–8 is
required for this fixture; setup fails explicitly if none is available. Admin
cleanup deletes only that fixture week and the newly created fixture users;
cascades remove their test rows. It never resets the database or uses a
service-role Supabase client. It applies pending repository migrations locally,
including any already merged baseline migrations, so do not run another
migration concurrently.
