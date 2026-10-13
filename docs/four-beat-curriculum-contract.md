# Four-beat curriculum contract (MIN-99 / MIN-104)

Sources: [MIN-99](https://mindfulnessai.atlassian.net/browse/MIN-99),
[MIN-104](https://mindfulnessai.atlassian.net/browse/MIN-104), and the
implementation merged through PR #39 (`0cc96cd`). The Jira descriptions name
Lucas as owner; the assignee fields are currently empty. This change does not
update Jira.

## Model and content provenance

`mobile/lib/four-beat-curriculum.ts` owns `BeatId`, canonical labels, the
ordered `FourBeats` tuple, `WeekContent`, `BeatAnswers`, and `WeekBeatAnswers`.
It has no React, Expo, or database dependency. `FourBeatModuleShell` consumes
this contract and retains its existing navigation, resume callback, and
compatibility type exports. Overview navigation still does not save or advance
activity progress.

The IDs and order are **arrive → practice → explore → notice**, with titles
**Arrive → Practice → Explore → Notice**. The tuple enforces the order at
compile time; `isWeekContent` also checks authored/sample JSON at runtime. Week
numbers are curriculum ordinals 1–8, matching `weeks.week_number`; they are not
`weeks.id`, activity UUIDs, or per-user progress identifiers.

A week has `weekNumber`, `title`, `beats`, and `contentSource`. Existing
implementation or sponsor descriptions require a source reference and nonempty
text. A sponsor reference must point to the actual supplied source; validation
checks structure, not source authenticity. A missing-sponsor-content sample
requires an explicit reason and empty descriptions for all four beats. Such a
sample validates structurally but is **not publishable curriculum**.
Mixed/partially sourced weeks and sponsor publication rules are intentionally
deferred until actual content is available.

`WEEK_ONE_CONTENT` reuses the existing four overview descriptions; only the
fourth ID/title becomes `notice`/`Notice`. These descriptions are implementation
text, not a claim of exact sponsor wording. The typed Week 1/2 samples live
under `mobile/__tests__/fixtures/four-beat-weeks.ts`. Week 2 has no invented
instructions and is never loaded into the app or database. Existing Sensation
Lexicon contracts in PR #39 describe an AI activity, not a complete
source-backed Week 2 four-beat curriculum; they are left unchanged.

## Saved-answer contract and legacy compatibility

`BeatAnswers` maps stable question IDs to string values. `WeekBeatAnswers` is a
partial map keyed only by the four canonical beat IDs. For example:

```json
{
  "arrive": { "arrive_mood": "3", "arrive_energy": "4" },
  "notice": { "ai_gap_missed": "" }
}
```

This is a logical payload within a known week, not a database row or write API.
Ownership must continue to come from authentication. Absent beats have no saved
answers; empty strings are valid drafts. Neither implies completion. Ratings
remain strings as in existing Week 1 data; per-question validation still belongs
to the activity. `isWeekBeatAnswers` rejects unknown beat IDs, nested/non-string
answers, and blank question IDs. It must **not** validate or replace existing
flat `reflection_answers`: legacy/unknown keys in those records remain intact.
Writing and generated intentions retain their existing dedicated columns and
contracts. No conversion or persistence function is introduced here.

`WEEK_ONE_STEP_BEATS` exhaustively projects every `WeekOneStep` onto an overview
beat without renaming persisted steps:

| Existing `current_step`   | Overview beat |
| ------------------------- | ------------- |
| `breathing`               | `practice`    |
| `post_breathing_check_in` | `practice`    |
| `writing`                 | `explore`     |
| `intention_mirror`        | `explore`     |
| `data_self_portrait`      | `notice`      |
| `ai_gap_reflection`       | `notice`      |
| `yellowdig_draft`         | `notice`      |
| `completed`               | `notice`      |

The existing Arrive override remains: an unfinished record with missing mood or
energy ratings displays Arrive while retaining its original saved activity step.
Completed records stay completed even if they predate those ratings. The
`completed` mapping selects the final overview beat; it does not mark a separate
beat complete. `reflection` was an overview ID, not a `WeekOneStep`. Do not
rename `ai_gap_reflection`, the `reflection` activity type, answer keys, or
database data. Existing `deriveNextAllowedStep`, `startWeekOne`, and completion
logic remain the source of truth for gating/resume. Reading the overview never
rewrites records.

## Backward-compatible migration plan — design only

The current schema has published `weeks` and `activities`, with progress keyed
by `(user_id, activity_id)`. Progress has one `current_step`, flat string
answers in `reflection_answers`, writing, generated intentions, and timestamps;
there is no per-beat table. Existing RLS enforces authenticated ownership. No
migration, backfill, dual write, or change to those constraints is included
here.

For [MIN-110](https://mindfulnessai.atlassian.net/browse/MIN-110):

1. Decide how published curriculum activities resolve to week/beat identities
   before changing storage. A week number alone is not an activity UUID.
2. Add separate, versioned beat storage with an owner/week/beat uniqueness rule,
   canonical-ID constraint, and authenticated-owner RLS. Final SQL and identity
   choices belong to that ticket; retain the old progress rows and columns.
3. Read new beat records where present and otherwise use an explicit legacy
   adapter. Preserve all unrecognized legacy answer keys and original writing,
   intentions, steps, completion state, and timestamps. Do not infer beat
   completion from nonempty answers or the overview mapping.
4. Test owner isolation, partial saves, independent beat resume, concurrent
   writes, old completed rows, and interrupted upgrades. If backfill becomes
   necessary, make it additive/idempotent and verify old/new reads before
   enabling writes. Rollback should disable the new path without removing legacy
   data.

For [MIN-116](https://mindfulnessai.atlassian.net/browse/MIN-116): obtain the
exact sponsor map/slide wording, resolve content gaps and activity bindings,
then seed and load the approved Week 1/2 records. Do not publish the Week 2 test
sample. Instructor access, media metadata, AI/provider changes, and generic
progress writes are outside these two foundation tickets.

## Verification

From the repository root after `npm ci --prefix mobile`:

```sh
npm --prefix mobile test -- --watch=false
node --test mobile/tests/*.test.cjs
cd mobile && npx tsc --noEmit
```

The contract tests cover canonical IDs/order, typed Week 1/2 samples, invalid
records, saved-answer shape, every legacy mapping, and the Arrive override. The
existing shell tests verify Notice navigation and old saved-step resume. The
Week 1 tests verify every saved step remains readable without a rewrite, legacy
completed records remain complete, and existing save/gating/completion behavior.
