# MIN-244 — Candidate deployment and data handoff

Prepared 2026-11-12 against main `ce3b81f8f1b4f0281490ae4a9649b7f847c81f66`.
**Local candidate preparation, not shared-deployment signoff.** No deployment,
secret change, live model request or Week 8 UI implementation occurred here.
MIN-244 is not complete until another teammate reproduces the approved test
candidate and records the owner-only retrieval/recovery checks below.

## Candidate and migration inventory

The commit above includes PR #55 baseline persistence, PR #61 provider modes,
new Week 3 flow `3895fb87`, and PR #67 daily request controls. The unmerged PR
#56 schema is **not** a prerequisite and must not be applied to this candidate.
Deploy functions from the same approved candidate as the migrations, not mixed
branch heads. Function versions are source commit identities, not claimed remote
deployment version numbers; no remote inventory was supplied or inspected.

| Ordered migration version | Responsibility                                               |
| ------------------------- | ------------------------------------------------------------ |
| `20260918014132`          | Base Auth-linked private tables, curriculum and RLS          |
| `20260918141248`          | Profile trigger and initial curriculum                       |
| `20260925204659`          | Legacy Week 1/2 progress fields                              |
| `20261001000000`          | Intention claims/receipts and atomic finish                  |
| `20261002163000`          | Owner progress deletion policy                               |
| `20261013000000`          | Week 2 entry curriculum                                      |
| `20261029000000`          | Baseline definitions, immutable original and restricted RPCs |
| `20261107000000`          | Week 2 practice audio configuration                          |
| `20261108000000`          | Published five-question baseline definition, version 1       |
| `20261109000000`          | Service-only Week 3 audit-request ledger                     |
| `20261112000000`          | Owner request counts and atomic quota claim                  |

These are **source files**, not an assertion that a shared project has applied
them. Local validation retained three historical versions already in the
developer database: `20261015000000` (MIN-110) and
`20261029010000`/`20261029020000` (old unmerged MIN-226). Their recorded SQL was
staged temporarily solely to let the CLI recognize existing history while
applying pending main migrations. No historical DDL was rerun, no ledger version
was reverted, and no learner rows were reset. The baseline suite used temporary
matching files that were removed in a finally block. The separate candidate
MIN-226 replacement also applies `20261112010000` locally for security
verification; it is not part of the eleven-version main deployment candidate
below. This is not an approved shared-history repair procedure. A clean
candidate uses the eleven source versions above; investigate unexpected versions
before any shared migration operation.

## Function and secret boundary

| Source route           | Responsibility                                          | Configuration/dependency                                                         |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `health`               | Non-sensitive health response                           | No student data                                                                  |
| `guided-reflection`    | Older authenticated shared-validation route             | Keep its actual route contract; do not assume the new mode/persistence semantics |
| `mindfulness-response` | Existing authenticated mock intention persistence       | Intention-submission migration; mock is test data                                |
| `ai-activity`          | Authenticated Claude/prewritten/mock activity interface | Provider selector, shared validation, prompts and daily quota RPC                |
| `week-three-audit`     | Dedicated newer Week 3 category proposal route          | Published Week 3, prior-week checks, quota RPC, server-only audit ledger         |

Mobile receives only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Auth sessions establish owner identity.
Provider keys and Supabase service credentials remain server-only. The newer
Week 3 audit ledger uses the server service credential after authenticated owner
checks; this is not a student service-role API. Do not print status JSON,
tokens, request bodies, baseline answers, event labels or environment values in
handoff logs. The repository's client-security scan remains required.

The existing provider selector supports `mock`, `prewritten`, `claude` and the
unimplemented `future` stub. Invalid configuration is unavailable, not a silent
switch to mock. Explicit server configuration uses `GUIDED_REFLECTION_PROVIDER`.
Claude requires `ANTHROPIC_API_KEY`; model, effort, timeout, retry/output
controls and daily cap are documented in `claude-provider-boundary.md`. No new
key names or secret values are invented here. An account spending limit and
approvals for student text remain separate from the per-student cap.

`claude-live-verification.md` explicitly records **no live verification** and an
unfilled results table. Fake-server validation proves adapter behavior, not
model quality, real spend or deployment. `claude-tuning-and-usage.md` records
the same limitation as of November 12. Prewritten uses a versioned content pack
without a model call; sponsor-review/privacy decisions stated in its source
documents must remain visible. Mode changes require an explicit
notice/acknowledgement where implemented; failures do not authorize automatic
mode switching.

## Prerequisites, stored results and baseline usage

Main's current frontend and Week 3 audit route use this saved-state
prerequisite: for each of Weeks 1 and 2, a published week must exist, contain at
least one published activity, and **every published activity** must have the
signed-in owner's completed progress with a timestamp. No arbitrary completed
row suffices. The route validates a supplied activity UUID against its published
Week 3 parent. Main has no canonical slug alias registry; the old draft's
invented production alias/mapping tables are not silently part of this
deployment. Confirm the candidate's published curriculum with the curriculum
owner before creating any shared data. The migrations do not seed a complete
production Week 3 module.

The current Week 3 state uses existing owner-scoped `progress`, with versioned
JSON in `reflection_answers.week_three_module_v1` and its latest save receipt in
`week_three_module_operation_v1`. It preserves unrelated keys, uses
timestamp/step CAS in the helper, and restores saved drafts. Its newer entries
and confirmed categories differ from the old `{id, at, label}` draft: no old
draft-schema copy is safe. The audit route's server ledger retains a digest,
bounded assignments and processing/result status, not raw input text.

**Reproduced MIN-226 gate:** on unmodified current main, a fresh authenticated
account with no earlier progress received HTTP 201 when inserting Week 3
progress directly through REST. Helper/route prerequisite checks therefore do
not yet cover all database writes. Do not claim complete direct-call
prerequisite protection, terminal-row immutability or MIN-226 acceptance until
the scoped replacement is validated. No final completion predicate is invented
here; MIN-225 remains In Progress. Existing teammate completion behavior must be
reviewed against its approved source, not replaced by an older draft.

Mode/provenance exists in several forms, not one uniform attested history: Week
2 serialized lexicon results retain provider and prewritten content version;
Week 3 state retains mode, content version, summary fingerprint/time and
category choices; server logs record prompt/model/usage metadata. Week 1's
current `saveProgressIntentions` stores only the intentions array, discarding
the response provider at that boundary. These facts do not establish the full
MIN-232 promise that every reloaded result identifies its actual source/version
or that all historical generations are append-only. Confirm that gap before
relying on Jira Done as release evidence. Never relabel an old saved result from
current mode.

For original baseline retrieval, an authenticated public client calls
`load_original_baseline` with no owner argument; the mobile equivalent is
`loadOriginalBaseline()` from `mobile/lib/baseline-helpers.ts`. The result is
`{contractVersion, original, definition}`; both latter values are null before
submission. It returns the immutable original and pinned question metadata,
including after publication withdrawal. A caller cannot select another owner.
The published definition added by main is `aim-ya-week-1-guiding-questions`,
version 1; test fixtures remain synthetic. This is a retrieval capability for a
future Week 8 consumer, not a Week 8 UI or meta-reflection implementation.

## Reproducible local verification

Use the approved candidate checkout, Docker Desktop Linux/WSL integration,
repository Node dependencies, Deno and Supabase CLI. Start local Supabase with
`npx supabase start`; compare migration files with its ledger before applying
pending local migrations. Do not reset a populated project to suppress drift.
The config references a missing `supabase/seed.sql`; local fixture tests do not
require it, and a fresh seed path is not certified. The test suites refuse
remote API URLs. Shared verification must be a separate explicitly approved
procedure, not a remote URL substituted into these local-only tests.

| Command from repository root                                          | Evidence                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `node --test mobile/tests/integration/baseline.test.cjs`              | Two real Auth users, owner RLS, exact originals, retries, CAS and legacy-field retention |
| `node --test mobile/tests/integration/progress-helpers.test.cjs`      | Existing progress ownership and update behavior                                          |
| `node --test mobile/tests/integration/intention-persistence.test.cjs` | Existing intent receipts; requires locally served mindfulness-response                   |
| `npm --prefix mobile run test:endpoint-integration`                   | HTTP routes and local quota suite; includes a real Edge runtime                          |
| `deno task tests`                                                     | Shared/provider schemas and current route regression suites                              |
| `node --test mobile/tests/*.test.cjs`                                 | Existing mobile/service contracts                                                        |
| `npx supabase db lint --local --level warning`                        | Applied local SQL-function checks                                                        |
| `npm --prefix mobile run check:client-security`                       | Client secret/server-import boundary                                                     |

Run suites sharing fixture curriculum and Edge-runtime lifecycle sequentially.
Before reusing an integration environment, read each suite's setup/cleanup and
stop only test-owned processes. Also run focused TypeScript, scoped Deno lint,
formatting and whitespace checks. Record full frontend diagnostics separately
from changed-file checks and compare against the same untouched main commit. Do
not infer native/mobile, screen-reader or shared deployment success from
fixture/browser unit runs.

## Recovery and teammate acceptance record

A lost baseline acknowledgement retries the **same operation UUID and payload**;
its committed receipt replays. Changed payload conflicts; a stale fresh save
requires reload and explicit reconciliation. Submitted originals are not edited
or regenerated. Current Week 3 helper recovery similarly retains data and its
operation identity; CAS failures require reload. Old intention processing claims
and Week 3 audit claims may remain unresolved after interruption. Blindly
reclaiming those claims can duplicate model billing. The daily quota counts
attempted model requests, is not a rollbackable billing receipt and does not cap
total account spend. Account deletion, backup restore and service failure
require separate approved procedures; this document does not certify them.

Another teammate must complete and attach a sanitized shared-candidate record:

- approved project/environment and exact source commit;
- actual applied migration versions and deployed function version identifiers;
- non-secret configuration, published curriculum and prerequisite inventory;
- owner A creates/submits/reads an original; owner B cannot read/write A;
- signed-out and direct-write denials; old Week 1/2 records remain intact;
- saved draft reload, identical retries, completion/retry behavior after an
  actual approved service restart, and retained source/version attribution;
- tester/date, exact test command/results, known failures and recovery
  limitations.

The repository's November 4/9 browser evidence explicitly used synthetic
services or controlled responses, and the newer Week 3 handoff says deployment
was **not executed**. No shared project or deployed recovery record was supplied
to this run. Consequently MIN-238's Done status is not substantiated by these
sources, and MIN-244 remains **prepared but incomplete**. No merge, deployment,
live provider call or automatic Jira status change is authorized by this
document.

## Source traceability

Source paths refer to candidate `ce3b81f8f1b4f0281490ae4a9649b7f847c81f66`:
`supabase/migrations/`, `deno.json`, `mobile/package.json`,
`mobile/lib/baseline-helpers.ts`, `mobile/lib/week-access.ts`,
`mobile/lib/week-three-module-service.ts`, `mobile/lib/week-three-module.ts`,
`mobile/lib/week-two.ts`, `mobile/lib/progress.ts`,
`supabase/functions/week-three-audit/`, `supabase/functions/_shared/providers/`,
`docs/sprint-3/claude-live-verification.md`, `claude-provider-boundary.md`,
`claude-tuning-and-usage.md`, `provider-comparison-and-configuration.md`,
`mobile/verification/week-three-handoff.md` and `final-student-screen-path.md`.
Jira: MIN-220/226/232/238/244 and MIN-225. This source inventory is not a claim
that all referenced behavior has been deployed.

## Local evidence recorded on November 12

- Baseline integration: 24 tests passed before and after the separately prepared
  progress-boundary migration, including two-user denial and immutable
  originals.
- Main shared backend: 432 tests passed; mindfulness endpoint 33 steps, AI
  activity 156 steps, and Week 3 audit 12 tests / 3 steps passed with controlled
  providers.
- Main and replacement mobile/service Node regression: 187 tests passed.
- Existing progress integration: eight tests passed; current quota integration:
  six tests passed. SQL lint, scoped integration-code lint, formatting, syntax,
  whitespace and client-security checks passed.
- Unchanged-main TypeScript: eight diagnostics in CSS, native tabs and media
  types or dependent implicit-any errors; no change caused these.
- Local replacement MIN-226: nine real Auth/REST/RLS tests passed. The original
  main probe returned HTTP 201 with zero prior progress; the replacement denies
  that write. This is separate candidate work, not a deployed guarantee.
- GitHub reports no deployment records, and this checkout has no linked project
  reference. Neither fact proves that no Supabase project exists elsewhere; a
  sanitized approved target/deployment record must be supplied by its owner.

These are local results. No model key, secret values, student records, test-user
identifiers or raw environment/status output are retained in this document.

## Jira evidence reconciliation (no statuses changed)

MIN-220 can justifiably move from In Progress to Done: PR #55 is merged, and the
24-case local suite reverified owner-only originals, immutability, retry races,
rollback/replay and retained legacy fields. MIN-250 can justifiably move from To
Do to Done based on its accepted, merged two-page source-backed contribution in
PR #52; this does not certify assembled FDD pagination or a deployment. MIN-232
has merged mode support but incomplete historical source retention, and MIN-238
has no supporting shared candidate/recovery record among the inspected sources.
Those Done statuses require evidence reconciliation with the team, not a
cosmetic board change. MIN-226 and MIN-244 remain incomplete.

## Shared-candidate execution plan — pending explicit deployment approval

This is a future operator procedure, not an executed deployment. The project
owner first supplies the approved test project reference, target URL and
candidate commit without putting keys in the document. A permitted operator
links that specific checkout using the repository README's
`npx supabase link --project-ref` workflow, compares remote migration history,
and reviews `npx supabase db push
--dry-run` before an approved database push.
Unexpected old draft/local-only versions require investigation, not a forced
reset or fabricated migration file.

After authorization, the owner applies only the reviewed candidate migrations,
sets the documented server secrets in the dashboard without recording values,
and deploys the candidate's functions with the repository's
`npx supabase
functions deploy` workflow. Both the general AI route and
dedicated Week 3 route must use that same candidate and configuration.
Publishing approved curriculum and resolving the MIN-226 write boundary are
separate prerequisites; live Claude also requires spending/privacy approval and
the existing live-verification run.

A second teammate then signs in as synthetic users A and B against that test
project, invokes the existing baseline service to save/submit/read A's five
synthetic answers, and verifies B cannot select or mutate A's private row.
Original retrieval is the existing owner RPC with no user-ID argument. The
teammate records exact command/API outcomes, original timestamp/version,
retries, legacy row retention, draft reload and an authorized service restart.
Local-only integration scripts must not be repointed to a remote project. If the
shared project cannot perform these checks without unreviewed
policy/configuration, MIN-244 stays incomplete. No Week 8 screen is part of this
procedure.

Pinned current sources:
[baseline RPC and RLS](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261029000000_baseline_persistence.sql),
[published definition](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261108000000_publish_week_one_baseline.sql),
[Week 3 storage](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/mobile/lib/week-three-module-service.ts),
[audit endpoint](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/functions/week-three-audit/index.ts),
[server setup](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/README.md),
[unexecuted live verification](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/docs/sprint-3/claude-live-verification.md).
