# MIN-274 — Backend build and operational guidance

**FDD draft for review · 29 October 2026.** This approximately three-page
manuscript contribution covers verified repository/local facts and future-use
risks; final pagination depends on FDD assembly and operational table sizing. It
is not a deployed runbook or completed MIN-238 verification. No configuration,
migration, runtime or secret is changed by this document.

## 1. Build inputs and environment separation

MindfulAI separates the Expo application from Supabase migrations, shared server
validation, Edge Functions and database integration tests. The root README and
mobile package manifest define installation and test entry points; Deno tasks
select the server suites. Reproducibility requires a recorded commit, dependency
lockfiles and compatible tool versions, rather than an undocumented developer
folder. Mobile dependencies are installed in `mobile`, while server functions
use their checked-in Deno configuration and import mappings [S1–S2].

The observed local environment reports Node v24.18.0, Deno 2.9.6, Supabase CLI
2.122.0 and Docker Engine 29.6.2. These are observations, not a prescribed
version matrix or evidence that all earlier tests ran with these exact current
versions. The repository configuration specifies PostgreSQL major version 17 and
the local project identifier `Mindful-AI`. The API uses loopback port 54321, the
database 54322 and Studio 54323. These local endpoints are not production URLs
[S2–S3].

Docker Desktop's Linux engine and WSL integration must be reachable from the
same distribution that runs the CLI. Earlier work reported an absent integration
socket and unavailable engine; the latest read-only checks successfully reached
Docker and local Supabase, so no reinstall, reset or system reconfiguration was
needed. If Docker or authentication is unavailable, operational work stops for
diagnosis. A command shim alone does not establish a working daemon.

A developer distinguishes fixture-only/local mobile development, the local
Supabase database/runtime, a shared test deployment, and future production.
Database state, applied migrations, provider selection, secrets and seed/config
data must be checked separately in each environment. A fixture screen can render
without live storage and does not certify RLS, provider execution or deployed
configuration. Physical mobile devices also have a different loopback interface
from the development host; network access must be configured deliberately
without substituting an invented production URL.

The root README documents local installation, mobile environment setup and
Supabase project linking. Linking selects a shared project target; database
pushes and function deployments change shared state. None is part of this
preparation. An operator must first verify the intended project, approved branch
and permission to perform the shared action. Successful local setup is not
evidence that a candidate project has the same migrations, grants or secrets
[S1].

The existing local workflow installs mobile packages with `npm install` from
`mobile`, supplies the two documented public values in an uncommitted
environment file, and starts the already-configured backend with
`npx supabase start` from the repository root. The endpoint README then
documents local migration application and serving the endpoint.
`npx supabase migration up --local` applies pending local files only after
history has been reconciled; it is not safe to run blindly on a main checkout
whose database includes unmerged versions. The existing intention suite uses
`npx supabase functions serve mindfulness-response`. No shared project link,
database push or deployment is required for these local tests. CLI output must
be inspected without publishing local credential values [S1, S9].

## 2. Migration order and safe test setup

The read-only ledger inspection found the following exact migration sequence.
The first six files exist on current main; the historical MIN-110 version exists
locally but is intentionally absent from the current Sprint 3 branches. The
final three versions are local applications of open PRs, not deployed production
schema.

| Version / migration name                         | Repository tier                                                        | Present in this local ledger |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `20260918014132_initial_schema`                  | Main: base relations, foreign keys and owner RLS                       | Yes                          |
| `20260918141248_vertical_slice_data`             | Main: profile trigger and curriculum data                              | Yes                          |
| `20260925204659_extend_week_one_progress`        | Main: expanded legacy progress fields                                  | Yes                          |
| `20261001000000_intention_submissions`           | Main: claim/finish ledger and RPCs                                     | Yes                          |
| `20261002163000_add_progress_self_delete_policy` | Main: owner delete policy                                              | Yes                          |
| `20261013000000_week_two_arrive`                 | Main: Week 2 curriculum entry                                          | Yes                          |
| `20261015000000_beat_progress`                   | Historical/local-only MIN-110, not main or current Sprint 3 candidates | Yes                          |
| `20261029000000_baseline_persistence`            | Open PR #55, unmerged                                                  | Yes                          |
| `20261029010000_activity_aliases`                | Draft PR #56, unmerged                                                 | Yes                          |
| `20261029020000_week_three_persistence`          | Draft PR #56, unmerged                                                 | Yes                          |

Order protects dependencies: the base Auth/curriculum/progress relations precede
foreign keys and RPCs that use them; expanded legacy columns precede intention
persistence; aliases precede Week 3 canonical lookup. Baseline definitions,
records and receipts have their own lifecycle and do not depend on Week 3
aliases. PR #56 is nevertheless stacked on #55, and its test support comes from
that base. Both additions preserve existing Week 1/2 rows rather than
backfilling or reinterpreting their answers. Schema independence does not mean
that branch/test history can be arbitrarily reordered [S3–S5, S10].

The local database can be ahead of the checked-out branch. This workspace
retains an already-recorded historical MIN-110 migration `20261015000000`,
absent from main, as well as locally tested PR #55/#56 additions. Checkout of a
documentation branch does not undo database migrations. A naive migration
command against main therefore cannot be assumed safe or compatible. Operators
compare candidate migration files and the database ledger before applying
anything; they do not mark historical versions reverted merely to suppress a
mismatch.

The PR #55 test support preserves that one known historical MIN-110 entry by
staging current migration files and the database's already-recorded SQL in an
owned temporary directory. The CLI applies only pending migrations; historical
DDL is not rerun. Unexpected drift fails for inspection. This is a narrowly
bounded developer-test accommodation, not a general shared-deployment repair
procedure or endorsement of importing old MIN-110 wholesale [S4].

Database reset, volume deletion and factory reset are not routine recovery
steps. The `[db.seed]` section in `supabase/config.toml` enables seeding and
sets `sql_paths` to `["./seed.sql"]`. No `supabase/seed.sql` or alternative
Supabase seed file exists in main or any of the 39 inspected fetched remote
refs. This is an unfulfilled reference; whether it is a retained placeholder or
stale configuration requires maintainer confirmation. It is not approved
curriculum that can be invented [S3].

A start command against the existing local stack completed successfully (exit
code zero), and a subsequent status check succeeded without that file. Prior
integration suites create their own synthetic fixtures; they do not depend on
the missing seed. This existing-stack startup check does not exercise initial
database creation or seeding. A clean start/reset-seed path remains unverified;
the maintainer should decide whether to provide a real approved seed or remove
the unused reference in separate scoped work. The missing file was not
fabricated, and migration history/student data were not edited.

The command catalogue below records existing entry points, not execution of new
runtime tests in this documentation task. The MIN-220/226 commands require a
candidate checkout containing the relevant unmerged files and compatible
migration history; they do not exist on current main. Integration suites create
synthetic users and fixture rows through public authenticated clients, with
trusted SQL confined to setup, security probes and cleanup. They must run
sequentially where curriculum fixtures overlap; an existing curriculum week must
never be overwritten to make a test pass [S4–S5].

Verification proceeds in four categories, retaining the candidate commit and
command output. Static checks come first; database suites then use the correct
candidate migration set; endpoints use the local runtime; regressions follow.
The following existing commands are guidance, not new runtime test results from
this documentation task [S2, S9].

| Category                              | Existing entry point from repository root unless noted                     | Purpose / boundary                                                              |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Static: TypeScript                    | In `mobile`: `npx tsc --noEmit`                                            | Full frontend check; retain known baseline failures                             |
| Static: client/code lint              | `npm --prefix mobile run lint`; endpoint README's scoped Deno lint command | Existing Expo script and backend lint, not interchangeable full-project passes  |
| Static: formatting                    | Endpoint README's scoped Deno formatting command                           | Checks only named files; this FDD document is also checked with Deno formatting |
| Static: client boundary               | `npm --prefix mobile run check:client-security`                            | Source/environment scanning; no guarantee about every deployed artifact         |
| Static: whitespace                    | `git diff --check` and `git diff --cached --check`                         | Inspect working and staged diff separately                                      |
| Database: SQL lint                    | `npx supabase db lint --local --level warning`                             | Function lint on the selected local schema                                      |
| Database: legacy progress/RLS         | `node --test mobile/tests/integration/progress-helpers.test.cjs`           | Real local owner isolation and legacy compatibility                             |
| Database: intentions                  | `node --test mobile/tests/integration/intention-persistence.test.cjs`      | Requires its locally served endpoint                                            |
| Database: baseline (PR #55)           | `node --test mobile/tests/integration/baseline.test.cjs`                   | Real local Auth/REST/RPC/RLS, two users and retry tests                         |
| Database: Week 3 lookup (PR #56)      | `node --test mobile/tests/integration/activity-lookup.test.cjs`            | Canonical lookup and alias access                                               |
| Database: Week 3 persistence (PR #56) | `node --test mobile/tests/integration/week-three.test.cjs`                 | Prerequisites, owner drafts, resume and immutable-state guards                  |
| Backend endpoints                     | `npm --prefix mobile run test:endpoint-integration`                        | Real HTTP coverage for mindfulness-response, guided-reflection and ai-activity  |
| Backend regression                    | `deno task tests`                                                          | Shared tests plus mindfulness-response and ai-activity suites                   |
| Mobile/service regression             | `node --test mobile/tests/*.test.cjs`                                      | Node helper/contracts; not native/device certification                          |

The endpoint README's exact scoped invocations use
`npx --yes --package=deno deno lint supabase/functions/mindfulness-response mobile/tests/integration/intention-persistence.test.cjs`
and
`npx --yes --package=deno deno fmt --check supabase/functions/mindfulness-response mobile/tests/integration/intention-persistence.test.cjs`.
They remain scoped commands, not an instruction to weaken tests or conceal
existing whole-project findings [S9].

The existing intention-persistence suite requires its locally served endpoint.
Full frontend type checking remains a separate check; the previously observed
seven CSS/media diagnostics reproduced on untouched main and were not repaired
in backend tickets. Earlier component checks also reproduced a
breathing-navigation timeout and a Guiding Questions capture timeout on
unchanged main. These remain separate baseline limitations, not new Sprint 3
defects. Reporting a focused pass must not conceal those baseline failures or
replace the real test commands [S4–S6].

## 3. Secrets, provider configuration and operational recovery

The mobile configuration allowlists only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The public key identifies the project;
the user's authenticated session and database policies enforce private access.
Provider secrets and service-role credentials must never be placed in Expo
variables, source, fixtures, logs or committed environment files. Local CLI
status can itself contain credentials and should be captured/redacted rather
than pasted wholesale into a report [S1, S6].

Current server provider selection uses `GUIDED_REFLECTION_PROVIDER`, with mock
as the default. Unrecognized configuration falls back to mock with a warning in
the current implementation. Consequently, a successful response alone cannot
prove a live Claude route. The `future` provider stub is not an implemented live
mode. Mock scenario/timing controls support deterministic tests; client scenario
injection is not a production API guarantee. MIN-223, MIN-231 and MIN-235 remain
unavailable, so no new Claude secret names, non-AI mode semantics or provenance
claims are invented here [S7].

Application retry recovery differs by workflow. Baseline and Week 3 draft writes
commit records and acknowledgements atomically; uncertain requests retry the
same operation ID and payload. A stale revision requires reload and explicit
reconciliation, not an automatic overwrite. Baseline originals remain immutable,
and owner reload recovers saved data even after relevant content withdrawal. The
intention-generation ledger instead has a durable processing claim around a
provider call; an interrupted claim may remain processing and cannot be
reclaimed blindly without risking duplicate generation [S4–S5, S8].

Operational monitoring should record safe error codes, request timing and
non-sensitive health signals, not baseline answers, event labels, reflection
text, provider prompts or credentials. Maintenance must preserve private
ownership, restricted RPC role grants, immutable records and pinned content
definitions. Privileged server access can bypass ordinary client boundaries and
is not a substitute for a bounded student or future instructor query.

Shared-deployment verification remains MIN-238 work after the implementation
chain is ready. That future exercise must record the candidate commit, applied
migration order, function/configuration versions and permissions; exercise old
Week 1/2 records, baseline originals, Week 3 drafts, account isolation and
duplicate requests; and document what survives an actual service restart. Until
exercised, none is a shared-deployment result. Backup restore, host-crash
recovery, recovery objectives and a production rollback procedure remain
unverified. Deployment handoff belongs to MIN-244 after that evidence exists
[J1].

### Maintenance risks and mitigations

| Risk                                     | Practical mitigation                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Branch, local and shared migration drift | Compare commit/files with each environment ledger before applying; preserve history and stop on unexpected versions |
| Stacked/unmerged migrations              | Review #55 before #56; retarget #56 only after #55 merges, then rerun its validation                                |
| Missing seed/config data                 | Resolve the seed reference separately and verify a clean approved setup; do not invent production data              |
| Provider configuration drift             | Check the selected provider and actual response source; mock fallback is not proof of live service                  |
| Client secret exposure                   | Keep server secrets out of Expo, redact status output, run the existing security scan and inspect build artifacts   |
| Curriculum or completion policy changes  | Retain immutable definition versions and originals; approve MIN-225 before enabling Week 3 completion               |
| Retry/concurrency regressions            | Preserve operation IDs, atomic receipts and CAS behavior; rerun duplicate/stale/simultaneous-write tests            |
| REST/RPC grant or RLS drift              | Recheck effective privileges and real two-account direct-call denial after schema changes                           |
| Pending retention/instructor decisions   | Keep private data owner-only; do not treat synthetic preview screens as production authority                        |

### Candidate-build checklist — not executed against a shared deployment

1. Record the approved branch/commit, target project and environment; confirm
   explicit authorization before any shared mutation.
2. Compare migration files, versions, order and foreign-key/function
   dependencies with that target's ledger, including seed/configuration data and
   stacked PRs.
3. Confirm required server secrets are present without recording values; verify
   public client configuration, actual provider/mode and approved curriculum
   policy.
4. Run static checks, real database/RLS and endpoint suites, then mobile/service
   regression tests on the intended candidate; retain results and baseline
   failures.
5. Confirm old records, originals, owner isolation and retries remain valid;
   document rollback/reload limitations and any surviving processing claims.
6. Collect actual shared restart/recovery evidence under MIN-238 before final
   deployment/data handoff under MIN-244. No backup or host-loss assurance is
   implied.

The design baseline, ERD/dictionary, authorization analysis and cross-week
design provide complementary review context. Their snapshots remain
current-main, unmerged or proposed as labelled, and this operational
contribution does not silently update those PRs or imply that their diagrams are
deployed schema [S10].

## Sources and evidence status

All repository links pin the inspected commit. PR #55/#56 evidence is unmerged
and locally verified; this draft adds no new runtime certification.

- **S1:**
  [Root build/setup instructions](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/README.md).
- **S2:**
  [Mobile package scripts/dependencies](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/mobile/package.json),
  [Deno tasks](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/deno.json).
- **S3:**
  [Local Supabase configuration](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/supabase/config.toml),
  [main migration directory](https://github.com/Mindful-AI-SD/Mindful-AI/tree/e89819cef332306a59b14028c3b9c0761c4e98bd/supabase/migrations).
- **S4:**
  [PR #55 local test/migration support](https://github.com/Mindful-AI-SD/Mindful-AI/blob/08ad5664ed821f7060b912c0d154b1419a70a8cc/mobile/tests/helpers/local-supabase.cjs),
  [baseline verification/setup notes](https://github.com/Mindful-AI-SD/Mindful-AI/blob/08ad5664ed821f7060b912c0d154b1419a70a8cc/docs/baseline-persistence.md).
- **S5:**
  [PR #56 operational/test boundaries](https://github.com/Mindful-AI-SD/Mindful-AI/blob/68952f19d047e1ed1ac66b053f41fdcefa4fd2b3/docs/activity-lookup-foundation.md),
  [Week 3 integration fixture lifecycle](https://github.com/Mindful-AI-SD/Mindful-AI/blob/68952f19d047e1ed1ac66b053f41fdcefa4fd2b3/mobile/tests/integration/week-three.test.cjs).
- **S6:**
  [Client configuration guard](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/mobile/scripts/check-client-security.cjs),
  [existing endpoint HTTP harness](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/mobile/tests/integration/endpoint/endpoint-http.test.cjs).
- **S7:**
  [Current provider selector](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/supabase/functions/_shared/providers/providerSelector.ts).
- **S8:**
  [Main intention ledger](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/supabase/migrations/20261001000000_intention_submissions.sql).
- **S9:**
  [Existing endpoint setup/static commands](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/supabase/functions/mindfulness-response/README.md),
  [AI validation setup and recorded limitations](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e89819cef332306a59b14028c3b9c0761c4e98bd/mobile/verification/ai-validation-matrix.md).
- **S10 — Related FDD review snapshots:**
  [MIN-250](https://github.com/Mindful-AI-SD/Mindful-AI/blob/c2a1ae2afc2e635cc75882fe47be4c9fdacdc59a/docs/fdd/backend-design-baseline.md),
  [MIN-256](https://github.com/Mindful-AI-SD/Mindful-AI/blob/e0bd19989eea1efbdc324d8e3613f1416e05dc5f/docs/fdd/erd-and-data-dictionary.md),
  [MIN-262](https://github.com/Mindful-AI-SD/Mindful-AI/blob/023c51ce56b06901af5fb08217788adac8fc5c42/docs/fdd/authorization-persistence-recovery.md),
  [MIN-268](https://github.com/Mindful-AI-SD/Mindful-AI/blob/80530cf895615f404ebeb46e2bcff8e6fcbcc83f/docs/fdd/cross-week-instructor-data-design.md).
- **J1:** [MIN-274](https://mindfulnessai.atlassian.net/browse/MIN-274),
  [MIN-238](https://mindfulnessai.atlassian.net/browse/MIN-238),
  [MIN-244](https://mindfulnessai.atlassian.net/browse/MIN-244).
