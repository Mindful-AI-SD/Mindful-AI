# MIN-214 — Baseline and Week 3 storage contracts

Finalized design contract: `sprint3-storage/v1`, reviewed 2026-10-28. Base:
`origin/main` at `7554e6fed509620cddea9f70a266c99b84d398c7`. **Contract only: no
storage, RLS, service, or deployment implementation. Production content and
completion policy are separate upstream inputs.**

## Evidence and external content/policy inputs

The
[Sprint 3 action plan](https://drive.google.com/file/d/1sjlq2GoZenFSeAkl5juxXMzLcvit1XON/view)
and [MIN-214](https://mindfulnessai.atlassian.net/browse/MIN-214) require five
separate baseline answers and original-answer retrieval. The submitted
[PDD](https://drive.google.com/file/d/1GRKV9bP8LfiF-MsQjJTYUN_VcHJMxgVC/view),
Section 13.3, records the October 12 decision to preserve all five answers; it
does not list the five question texts. Section 5 describes the current storage.

| Needed fact                                       | Evidence available                                                               | Resolution                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Exactly five Guiding Questions                    | Jira, action plan, PDD                                                           | Confirmed count; NOT five identifiable question texts                                                |
| Ordered question IDs and exact wording            | No baseline fixture/spec with these found in main or retrieved project documents | MIN-219 / sponsor source required                                                                    |
| Week 1 writing minimum                            | Existing `validWeekOneWriting` and MIN-219                                       | Existing 150-word writing requirement stays unchanged; not silently applied to every baseline answer |
| Week 3 input events                               | `distractionAuditSchema.ts`, provider types, worked example                      | Reuse existing event contract                                                                        |
| Week 3 required answers/completion/time threshold | MIN-225 is To Do; sponsor instructions not retrieved                             | Completion must remain unavailable until approved                                                    |
| Week 2 prerequisite definition                    | Existing completion state exists; MIN-213 explicitly calls out unresolved rules  | Do not redefine existing Week 2 completion                                                           |

The five question slots in the examples are `q1`–`q5`, **synthetic
identifiers**, not sponsor-approved production IDs. MIN-219 supplies the ordered
production keys, exact question text and definition-specific validation
metadata. They are data in a versioned definition, not SQL column names.
Replacing the synthetic definition with an approved definition requires no
storage redesign. A flat Week 1 `writing` value, mood/energy ratings or three
AI-gap answers must not be reinterpreted as the missing five-question baseline.

MIN-225 supplies a versioned completion predicate and its required answer keys,
not the event schema. Until that policy is supplied, Week 3 completion is
unavailable; event/draft/resume contract work remains valid. Docker is not a
dependency for this design review. It is required for later migration/RLS
execution evidence.

No baseline service/schema, Week 3 save/resume service, or canonical activity
slug registry exists on this main. Published curriculum lookup currently
supports weeks 1/2. A mock Distraction Audit provider and HTTP route exist;
there is no Week 3 screen/log persistence on main. Provider selection is `mock`
or an unimplemented `future` stub, not a verified Claude/non-AI comparison mode.

## Current-state inspection and overlap

All six checked-in SQL migrations were reviewed. `progress` is keyed by
`(user_id, activity_id)` and contains status, legacy step, writing, intentions,
flat private reflection answers and timestamps. Its completion check ties
completed status to a non-null timestamp. Week 1 and Week 2 reuse it; they do
not store four independent beat rows. Week 2 saves and Week 1 sensitive
transitions compare saved step/update time; generic MIN-64 upserts replace whole
JSON fields and are last-write-wins. These are distinct guarantees, not a
universal concurrency lock.

Private tables use owner RLS with `auth.uid()`; published activities require a
published parent week. `profiles` has no instructor role. Instructor UI remains
a synthetic completion preview, not permission to read private responses.

Historical `origin/codex/min-110-beat-progress-persistence` (`661ed61`) was read
only. Useful patterns: owner RLS, immutable identity, private JSON,
published-write checks, independent saved state. It does **not** supply
immutable submissions or CAS stale-write protection: its patch helper uses
last-write-wins. Idempotency is better evidenced by main's intention submission
ledger. No old MIN-110 code, migration, or branch history is imported.

Open PR #51 changes only `docs/practice-media-manifest.md`, not these contracts.
No Sprint 3 persistence PR exists at inspection. Jira assigns UI to MIN-215/221,
logger to MIN-228, acceptance fixtures to MIN-218, provider work to
MIN-217/223/235, and curriculum decisions to MIN-219/225/231. The examples here
are backend wire examples, not a replacement acceptance suite, player, screen,
or provider adapter. Recheck remote state before each subsequent implementation
ticket.

## Baseline storage: additive, separate from legacy progress

Propose two separate concepts: an immutable curriculum definition and a
student-owned response. Neither overloads `progress`.

### Definition-driven schema

`baseline_definitions` has composite PK `(definition_id, definition_version)`:
text identifier, positive integer version, `questions` JSON array, publication
flag and database creation timestamp. Each definition contains **exactly five**
ordered objects `{ questionId, prompt, maxCharacters }`. IDs are unique nonblank
strings (1–64 characters), prompts are nonblank, and `maxCharacters` is a
positive integer up to a technical ceiling of 20,000 Unicode code points per
answer. This ceiling is a proposed transport/storage safeguard, not sponsor
curriculum. All five answers are required for submission; drafts may be
incomplete. Definition metadata can choose smaller maxima without changing SQL.
No minimum word count is inferred from Week 1's separate writing task. The
implementation should bound the request body as well as field lengths; 512 KiB
is the proposed transport ceiling.

The array order is authoritative for presentation and retrieval; answer objects
are keyed by `questionId`, so JSON object key order has no semantic meaning.
`definition_id` and version together identify the exact approved question set.
Published definitions are authored/provisioned by a trusted content process,
never by the student mobile client. Definition content and identity are
immutable once inserted; changes create another version. Publication may be
toggled without changing text/keys. A referenced definition cannot be deleted
(FK RESTRICT).

`baseline_records` has one row per authenticated user: PK `user_id`, Auth FK
with account-delete cascade. Definition/version is metadata, **not** part of
this PK; changing configuration cannot permit a second original baseline.

| Field                                      | Type / proposed rule                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `user_id`                                  | UUID; derived from `auth.uid()`; immutable; never a caller argument                                             |
| `contract_version`                         | Text; supported `sprint3-storage/v1` only                                                                       |
| `definition_id`, `definition_version`      | Text + integer composite FK to immutable definition; pinned on first save                                       |
| `answers`                                  | JSON object with a subset of definition question IDs; strings only; no unknown IDs; all five nonblank at submit |
| `status`                                   | `draft` or `submitted`; terminal submitted state                                                                |
| `revision`                                 | Positive bigint CAS version; first save = 1; increments once per accepted mutation                              |
| `submitted_operation_id`                   | UUID, null for draft and set once on submit                                                                     |
| `created_at`, `updated_at`, `submitted_at` | Database timestamptz values; submitted time and operation ID required iff submitted                             |

Once pinned, a draft is not silently rebound when default content changes. A
retired definition blocks fresh edits but preserves load/retrieval. Any future
explicit draft conversion would be a separate product operation; it is not
required for the five-question storage contract. Definition SELECT permits
published rows and the definition referenced by the caller's own baseline, so
unpublishing does not make original question wording unreadable.

`baseline_write_receipts` has PK `(user_id, operation_id)` with Auth-owner FK,
operation kind (`save_draft`/`submit`), request hash, resulting revision,
success outcome, nullable original submission timestamp and database creation
time. The hash covers kind, contract, definition, expected revision and the
exact answer payload under deterministic key ordering. Receipts duplicate no
answer text. They acknowledge a lost-response save even after later saves. Only
successful mutations create receipts; receipt contents are immutable. No
automatic expiry may break the advertised retry window. Hashes are private, not
anonymized data.

### Lifecycle and API

Proposed authenticated service operations (names are not existing exports):

- `loadBaseline()` → current draft/submitted row, or null.
- `saveBaselineDraft({ operationId, expectedRevision, definitionId, definitionVersion, answers })`.
- `submitBaseline({ operationId, expectedRevision, definitionId, definitionVersion, answers })`.
- `loadOriginalBaseline()` → retrieval envelope containing the immutable
  original and pinned definition, both null if no original has been submitted.

No `userId`, timestamps, `status` override or arbitrary owner column is writable
through these APIs. A verified session supplies ownership; account changes must
not deliver the previous account's response into a new screen. The request must
not turn the original into an editable draft.

Save is a whole draft replacement, not a deep merge. Screen callers retain local
input on failure and reload before reconciling a conflict. Submission requires
all five approved answers to be nonblank and within approved bounds; this
validation is independent from the existing Week 1 long-form writing minimum.
Bounds are read from the pinned definition, within the fixed technical envelope.
Draft first-save uses expected revision 0; later writes specify the exact loaded
revision.

Submit validates and freezes the five answers in a single database transaction.
The submitted row itself is the original, avoiding divergent editable/original
copies. Ordinary updates/deletes of submitted rows must be rejected at database
level, even through direct REST, not just hidden by the UI. An intentional new
operation ID cannot replace a terminal baseline. No client deletion API is
proposed; account-erasure policy remains a separate authorized process.

### Idempotency, concurrency and failure order

Within one transaction: authenticate and validate the storage envelope; obtain a
per-user transactional lock (including first insert); inspect the operation
receipt **before** checking publication or expected revision; replay an
identical operation or reject changed input using that ID; for a fresh operation
reject terminal baseline edits, resolve the published definition, enforce CAS,
write record and receipt, then commit atomically. Normalize deterministically
without silently changing original answer text: canonical JSON key order for
hashing, preserve saved text bytes.

A receipt mismatch is `OPERATION_CONFLICT`; a fresh operation with stale
revision is `STALE_REVISION`; draft edit/new submit after submission is
`BASELINE_IMMUTABLE`. An identical retry of the recorded submit returns its
original success revision and `submitted_at`, even if expected revision is now
old. A draft receipt replay acknowledges the original save revision; callers
then load the current record, never replay old draft content over a
newer/submitted record. Simultaneous identical submissions produce one
revision/timestamp/receipt; differing submissions cannot both win. A failed
transaction leaves neither partial record nor success receipt. After a network
loss, retry the SAME operation UUID/payload; after a conflict, reload and
explicitly reconcile under a NEW operation UUID. No automatic overwrite.

There is **no durable pending claim** for baseline writes: no provider/network
call runs between receipt creation and database commit. If the transaction is
interrupted before commit, both record and receipt roll back. If commit succeeds
but the reply is lost, the same operation replays the committed receipt. This
intentionally differs from the existing two-stage intention-generation ledger,
whose pending claims can survive. Never acknowledge a receipt before its
matching record commits. Retrieval after interruption is read-only and returns
the last committed owner record.

| Case                                           | Contract outcome                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Same draft operation ID and identical payload  | Replay acknowledgement; no revision increment; load current data separately |
| Fresh save with stale revision                 | `STALE_REVISION`, no mutation/receipt                                       |
| Simultaneous distinct saves from same revision | One wins; the other conflicts, retaining the winning answers                |
| First valid submit                             | Atomically freeze original, timestamp and receipt                           |
| Same submit ID/payload retry                   | Replay original success, including after definition unpublishing            |
| Same ID with changed payload/kind/version      | `OPERATION_CONFLICT`; never overwrite                                       |
| New submit/edit after original exists          | `BASELINE_IMMUTABLE`, even if answers match                                 |
| Interrupted transaction / lost committed reply | Rollback and safe retry / replay respectively; no pending-claim reclamation |
| Owner reads original                           | Exactly the committed submitted snapshot; no regeneration                   |

Proposed controlled errors: unauthenticated, invalid input/version, unavailable
curriculum, operation conflict, stale revision, immutable baseline, unavailable
storage. An HTTP wrapper would map these to 401/400/404/409/503 as applicable.
No current endpoint behavior is changed here. Return no stack traces, raw SQL,
private answers, hashes or configuration in errors/logs.

### RLS and write boundary

Owner SELECT only for authenticated students; null `auth.uid()` must be
explicitly rejected by read and write service entry points (not misreported as a
missing baseline). At the raw REST layer, anonymous access has no table
privileges; a cross-owner SELECT returns no rows and cross-owner writes are
denied. RLS must use owner predicates for both existing-row selection and
new-row checks.

Only the dedicated authenticated write RPCs may mutate these new relations.
Proposed implementation: narrow NOLOGIN/NOBYPASSRLS function-owner role, not
owner of the tables, with only necessary column/operation privileges and owner
RLS policies using the original `auth.uid()`. Ordinary authenticated roles
receive SELECT and exact RPC EXECUTE, not direct INSERT/UPDATE/DELETE. Revoke
PUBLIC/anonymous function execution, use an empty search path and static
qualified SQL, and validate auth in every entry point. Do not grant the
function-owner role to clients. Database immutability triggers also reject
submitted-row edits by the restricted writer. No service-role key is sent to the
app. Verify effective grants and RLS under real session JWTs; SECURITY DEFINER
alone is not sufficient.

Logs must never contain baseline answers, private Week 3 labels/answers, raw
request bodies, tokens or provider secrets. Safe operation codes and synthetic
test identifiers may be recorded without student text. No instructor access
policy is added by this contract. These are proposed database/RPC guarantees;
helper validation alone cannot enforce them against direct requests.

## Week 8 original retrieval

`loadOriginalBaseline()` reads only the caller's submitted original, includes
the pinned definition ID/version, its ordered question metadata and the original
timestamp, and never reads another user ID. The wire retrieval shape is
`{ contractVersion, original, definition }`; `original` is null before
submission and `definition` is null when no submitted original exists. No draft
answers are returned by the original-only method. Draft-only/absent data sets
`original` to null, never generated or reconstructed answers. Later comparison
answers must live separately and never update this original. Question
wording/version must be recoverable from the immutable definition. No Week 8
screen, synthesis, comparison provider, or new retention promise is implemented
or inferred by this contract.

## Week 3: four distinct persistence concerns

Reuse the EXISTING `DistractionAuditInput` event shape: `id` (trimmed 1–64
chars), `at` (ISO timestamp including timezone), `label` (trimmed 1–40 chars);
maximum 300 unique event IDs per log. Empty logs are valid provider input, **not
proof of Practice completion**. The six provider categories are placeholders,
not approved curriculum choices. Event timestamps/labels are private, not
telemetry or logs.

### 1. Persisted event data

Store the validated event array as one versioned snapshot, with a distinct
`events_revision` that changes only when events change. Do not add sponsor
fields or copy placeholder provider categories into the event schema. Reuse
`distractionAuditInputSchema`, including strict keys, trimming and duplicate
checks. Preserve normalized event IDs and timezone-bearing times; IDs are opaque
within an owner/activity log, not globally unique tracking identifiers.

### 2. Progress and resume

Proposed additive `week_three_progress`, PK `(user_id, activity_id)`:

| Field                                                    | Proposed type / responsibility                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `user_id`, `activity_id`                                 | UUID owner + canonical activity FKs; immutable identity                          |
| `contract_version`, `content_version`                    | Supported storage format + supplied curriculum version; pinned for saved record  |
| `revision`, `events_revision`                            | Positive bigint whole-row CAS version + nonnegative event-snapshot version       |
| `status`, `current_beat`                                 | `not_started`/`in_progress`/`completed`; `arrive`/`practice`/`explore`/`notice`  |
| `events`                                                 | JSON array, validated existing event shape, initially empty                      |
| `answers`                                                | Private JSON string map; policy-provided answer keys, no invented sponsor fields |
| `resume_state`                                           | JSON object: `elapsedActiveMs`, nullable `positionMs`, `state` (`idle`/`paused`) |
| `audit_result`                                           | Nullable versioned cached report described below; not a completion predicate     |
| `completion_policy_version`                              | Nullable text before completion; required with successful completion             |
| `created_at`, `started_at`, `updated_at`, `completed_at` | Database timestamptz lifecycle, completion time iff completed                    |

No write touches legacy `progress`. The canonical activity must resolve to
published Week 3 and pass configured prior-week prerequisites in the backend
transaction. A foreign key, client timer, or direct route is not authorization.
Prior-week activity mapping is explicit module configuration, never “any
completed row in Week 2.” The same owner RLS/restricted-RPC write boundary
applies here.

Resume values are nonnegative safe integer milliseconds; absent position is
null. Restoring always returns paused/idle state and does not add background
time. These are persistence fields compatible with the current PracticeSession
concept, not a replacement player implementation or proof of elapsed-time
authenticity. Required answer keys are supplied separately by content/policy.
Omitted map values are not implicitly deleted; a save request specifies a whole
reconciled snapshot and CAS revision. Reject unknown top-level properties and
unsupported versions.

Repeated saves use an additive `week_three_write_receipts` relation with the
same transactional acknowledgement semantics as baseline receipts, scoped by
`(user_id, activity_id, operation_id)` and tied to that progress identity. A
stale snapshot conflicts rather than dropping another device's taps. Completed
rows are immutable and repeated identical completion operations replay the first
timestamp. Different post-completion writes fail; reopening is outside this
contract.

### 3. Categorized/generated report cache

The existing `DistractionAuditResult` is
`{ totalEvents, categories,
uncategorized, assignments }`. Keep these exact
shapes and use `distractionAuditResultSchema` plus
`distractionAuditMatchesRequest` against the report's original input.
Categories/percentages must match the current server arithmetic, not arbitrary
client arithmetic. The empty-log result has no categories and zero uncategorized
count/percent; nonempty results account for every input.

An optional `audit_result` caches
`{ contractVersion, inputEventsRevision,
inputEvents, provider, data }`, where
`data` is that exact result schema and `inputEvents` is the validated input
snapshot. `contractVersion` identifies the report-cache envelope
(`distraction-audit-cache/v1`). `provider` records the returned source label;
the synthetic example says `mock`, not Claude or non-AI. This owner cache is
**not attested provenance**; acceptance of a structurally valid result must not
be described as proof of which provider generated it. Trusted source/mode
attestation and append-only generation history belong to MIN-232 and its real
provider contracts. No client may use this cache as an authorization fact.

A failed provider request does not replace the last valid cached report. If
events change, retain the previous cache with its old input snapshot/version;
mark it as outdated by comparing `inputEventsRevision` with `events_revision`,
not by relabelling its input or reinterpreting its counts. Repeated saves with
unchanged events keep the event revision. Completed progress including its cache
remains immutable. This is one cached report, not a promise to retain every
intermediate generation.

### 4. External completion policy

MIN-225 supplies a versioned predicate and approved required
answer/configuration keys. `completeWeekThree` is a distinct future backend
operation, not a writable client status/timestamp patch. It evaluates
prerequisites, the pinned policy and current saved data in the same transaction,
then records the policy version and completion timestamp. Without an approved
policy it returns controlled `COMPLETION_POLICY_UNAVAILABLE` (503 if exposed
over HTTP), preserving the draft. Events, cached category counts, current beat,
or timer values alone never satisfy a made-up predicate. The envelope can store
later policy fields in `answers` and policy metadata without altering event
storage. This defers curriculum decisions, not the storage schema. No new Week 2
completion rule is introduced.

## Activity slug resolution

Provider schemas and database IDs are different concepts:
`guidedReflectionSchema` accepts a slug while `ai-activity` resolves an actual
UUID; `activities` currently has **no slug column**. Neither the provider kind
`distraction_audit` nor title is a stable database identity. Never manufacture a
UUID, use array position/first row, or derive a slug from editable title text.

Propose additive `activity_aliases(slug text PRIMARY KEY, activity_id uuid FK)`
with nonblank lower-case hyphenated slugs, 1–100 characters (aligned with the
existing guided-reflection slug validator). Mapping is unique and immutable
after creation; aliases may not be silently repointed after saves. Trusted
provisioning links reviewed aliases to actual canonical activities. No student
insert/update/ delete privileges; published SELECT requires the target activity
and week to be published. Publication/withdrawal lives on existing curriculum
rows.

Resolver contract: `resolveActivity({ slug, expectedWeek })` returns exactly
`{ activityId, weekId, weekNumber, slug }` only when one canonical published
match exists in the expected week. The expected week/kind for a write is taken
from trusted route/module configuration, **not** a client-controlled unlock
override. Persisting services accept a slug, resolve it themselves, and use only
the returned UUID. A returned UUID is data, not a bearer capability. Supplying
arbitrary `activityId`/`userId` to a save is rejected; direct REST writes have
no grants. Re-resolve and enforce publication/prerequisites in the transaction
to prevent a lookup-then-write bypass. This defines MIN-226 work; no resolver is
implemented.

| Condition                                           | Service outcome (proposed HTTP mapping)                             |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Exactly one published alias with expected week/kind | Canonical identity, 200                                             |
| Invalid slug/expected-week envelope                 | `INVALID_INPUT`, 400                                                |
| Missing slug                                        | `ACTIVITY_NOT_AVAILABLE`, 404; no write                             |
| Duplicate/ambiguous alias data                      | `ACTIVITY_LOOKUP_UNAVAILABLE`, 503; fail closed, never choose first |
| Wrong week/kind                                     | `ACTIVITY_NOT_AVAILABLE`, 404; no fallback UUID                     |
| Activity OR parent week unpublished                 | Same unavailable 404; no publication-detail disclosure              |
| Storage/lookup failure                              | Controlled unavailable 503; no internal SQL/stack trace             |

The primary key prevents duplicate slugs in normal storage; the ambiguous case
remains part of the resolver contract for corrupt fixtures, adapters or
deployment drift. Aliases with different slugs may name one activity; they must
return the same canonical UUID and cannot create duplicate progress identities.

Reads of already owned saved/submitted records use ownership and pinned
identity, not current publication, so withdrawals do not erase access to
original answers. New creation/edits require published approved
definitions/curriculum; identical committed-operation replay remains available
after withdrawal. Exact production aliases are provisioning data. Examples use
`example-` slugs and synthetic UUIDs, not deployed identities. No valid alias
UUID is inferred from a title or sequence.

## Fixture independence and versioned examples

`examples/v1/` contains five wire examples plus a manifest. These are synthetic
**design fixtures**, not endpoint responses from a running service. They import
no Supabase, Expo or player code. Wire examples use camelCase service
projections; the proposed database dictionary uses snake_case columns. Owner
UUIDs are intentionally omitted from public service payloads, not supplied by
screens. An eventual common TypeScript interface and validators should be
dependency-free so fixture and database adapters can implement the same service
surface. Screens inject that surface and approved content separately. They must
not require a migration/provider/server merely to render a fixture.

The `sprint3-storage/v1` envelope is finalized independently from definition and
completion-policy versions. MIN-219 can supply production metadata and MIN-225
can supply its predicate without replacing this schema. Breaking envelope
changes require another version; never reinterpret an original using a later
definition. Do not ship a screen labelled with sponsor questions while using
these synthetic slots.

## MIN-220 migration/service plan and verification gate

1. Fetch/recheck main and open PRs. Load MIN-219's approved definition into the
   fixed five-question metadata envelope; version it without guessing seed copy.
   Structural migration/type work can use synthetic definitions, but production
   acceptance requires the approved definition and actual RLS/idempotency tests.
2. Add a new timestamped definition/baseline/receipt migration after current
   migrations. No alteration/backfill of Week 1/2 progress, no imported MIN-110
   migration.
3. Add constraints, terminal-state protection, owner RLS, restricted writer
   grants, and atomic save/submit functions described above; add pure
   types/validators and public-client owner-derived service methods. Alias/Week
   3 migrations belong to MIN-226, not baseline storage unless canonical
   baseline identity requires one.
4. Seed synthetic Week 1/2 drafts/completions BEFORE applying the migration in a
   local Supabase test. Compare full rows including unknown answers and
   timestamps AFTERWARD; preserve old resume and completed-user behavior. Apply
   on a fresh database and re-run with existing data; do not reset a shared
   database.
5. Test draft create/update, submit/retrieve original, identical retry,
   lost-response retry, rolled-back write retry, changed-payload conflict,
   competing submissions, stale draft rejection, immutable original after new
   operation/content config, forged owner, cross-account select/update, direct
   mutation bypass and signed-out calls. Include reload/account switch and
   original availability after unpublishing.
6. Run SQL lint, focused types/lint/formatting, security, legacy regressions and
   actual Docker/RLS suites. Record build/environment, commands and totals
   without private payloads. Only then commit a separately scoped MIN-220
   branch/PR.

MIN-226 must later enforce prerequisites below the client helper: every
applicable write/AI route and direct REST/RPC path must be checked. Existing
permissive owner writes cannot be described as new prerequisite enforcement.
Coordinate changes to `ai-activity` with Frankie's provider PR; neither
duplicate his adapter nor block existing Week 1/2 draft retrieval due to
new-baseline absence.

## Documentation acceptance and later verification

| MIN-214 requirement               | Contract evidence                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Five-question baseline            | Definition PK/version, exactly five ordered stable IDs, private keyed answers           |
| Original-answer retrieval         | Terminal record, retained definition, owner-only `loadOriginalBaseline`                 |
| Week 3 events/progress            | Existing event schema, independent event/CAS revisions, paused resume and report cache  |
| Slug resolution                   | Unique alias → canonical ID, expected-week/publication checks, ambiguity fails closed   |
| Owner-only access                 | Auth-derived owner, RLS + restricted RPC grants + terminal-state constraints            |
| Week 1/2 compatibility            | Additive relations only; no legacy rewriting, new gating or inferred baseline           |
| Versioned examples/migration plan | Seven scoped files: document, five synthetic payloads, manifest                         |
| Fixture independence              | No Supabase/Expo/provider imports; content and persistence adapters injected separately |

MIN-214 is acceptance-complete as a design deliverable for review, not a claim
of runtime correctness. No unresolved structural choice requires missing
question wording or a guessed completion rule. MIN-219 remains the production
content input; MIN-225 remains the completion-policy input. MIN-220 requires
migration/owner/ idempotency execution before implementation acceptance; MIN-226
cannot enable completion without approved policy. MIN-232 requires real
provider/mode contracts. No migration, RPC, TypeScript service or UI is changed
by this ticket.

### Non-destructive environment diagnosis (2026-10-28)

- `command -v docker` finds a Docker Desktop wrapper on the Windows-mounted
  path; `/usr/bin/docker` is a dangling symlink into
  `/mnt/wsl/docker-desktop/cli-tools`.
- `docker version` and `docker info` both report that Docker is unavailable in
  this WSL distro and recommend enabling Docker Desktop WSL integration. No
  Docker Unix socket or mounted integration target was present; daemon
  reachability from this distro therefore cannot be established. This does not
  prove the Windows daemon is stopped.
- Read-only Docker Desktop settings show integration already enabled for Ubuntu
  (`EnableIntegrationWithDefaultWslDistro: true`,
  `IntegratedWslDistros: [Ubuntu]`). Configuration is present, but runtime
  integration is not mounted/usable. A bounded `docker.exe version` probe also
  fails because the Windows `dockerDesktopLinuxEngine` named pipe does not
  exist. The Linux engine API is currently unavailable from both entry points;
  no reinstall or configuration change is justified by this diagnosis alone.
- Cached Supabase CLI 2.121.0 is executable. Its `supabase status` reports
  `StatusDbInspectError: failed to inspect container health`. The repository's
  integration suite begins with `npx --yes supabase status -o json` and later
  invokes `docker exec`; those prerequisites cannot currently succeed here.
- `npx --no-install supabase` additionally refuses the uncached latest package
  2.122.0. No CLI installation/update was performed. No `supabase start`,
  migration, reset, Docker reinstall, system configuration or shared deployment
  was attempted.

Formatting, JSON consistency, whitespace and client-security checks are
appropriate for MIN-214. Docker is a later runtime-verification blocker, **not**
a documentation blocker. The missing source/policy inputs are tracked in Jira
rather than silently replaced with sponsor wording or completion thresholds.
