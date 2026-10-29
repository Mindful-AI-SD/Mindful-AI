# MIN-226: canonical lookup, Week 3 drafts and prerequisites

This branch is stacked on MIN-220 / PR #55. It should be rebased or retargeted
to `main` after PR #55 merges. The implementation is verified locally, not
deployed. The final Week 3 completion transition remains blocked on MIN-225. No
production alias, prerequisite mapping, answer key or sponsor content is seeded.

## Canonical identity

The additive `activity_aliases` table has a unique slug primary key, restricted
activity UUID foreign key and immutable mapping. Existing activities/progress
are unchanged. Trusted curriculum maintenance supplies reviewed aliases; tests
use synthetic aliases only. Multiple aliases may name one canonical record. A
slug cannot identify multiple records. Trusted maintenance must retain
referenced aliases rather than deleting/recreating them to retarget saved state.

`resolve_curriculum_activity({slug, expectedWeek})` is a SECURITY INVOKER read
RPC with an empty search path. It checks authentication, exact input shape,
expected week and publication of activity and week under curriculum RLS.
Authenticated students can read published aliases but cannot insert, update or
delete them. No owner ID or caller-selected activity UUID is accepted. It
returns only `{slug, activityId, weekId, weekNumber}` and reads no private
student data. Invalid input returns 400, signed-out access is denied with 401,
and missing, wrong-week or unpublished activity returns 404. The primary key
prevents ambiguity; a non-single result fails closed with 503. Unexpected errors
are normalized without database diagnostics.

**A resolved UUID is not a write authorization capability.** Week 3 saves
resolve the slug again inside the database transaction. Their expected week is
fixed to 3 and activity kind to the existing `ai_lab` kind; a client cannot
override either.

## Trusted prerequisite configuration

`week_three_modules` contains the target canonical activity UUID, content
version, explicit required activity UUIDs, allowed answer keys and enablement
flag. No student/client role can administer this configuration. The restricted
RPC role can read it but cannot mutate it. Configuration has no default
production values.

Before a fresh save, the backend checks the target activity/week publication,
enabled configuration and each explicitly configured prior activity. Required
activities must be published, belong to Weeks 1/2, cover both weeks, and have
`progress.status = completed` plus a non-null completion timestamp for the
**current authenticated owner**. Another student's completion cannot satisfy it.
Missing configuration returns 503; unmet prerequisites return 403. It never
chooses an arbitrary completed row or derives identities from editable titles.
This mechanism is reusable across configured Week 3 activities.

These checks use current main's stored completion signal; they do not invent or
strengthen the unresolved Week 2 curricular completion rule. Legacy progress
remains owner-editable under existing policies, so the signal is not independent
attestation of student participation. Trusted production prerequisite mappings
still require curriculum review. Completion/configuration reads use the
transaction's MVCC snapshot; no claim of serializable coordination with legacy
progress edits or administrator publication changes is made.

## Private Week 3 storage

`week_three_progress` is keyed by `(user_id, activity_id)` with a canonical
module foreign key. It stores the MIN-214 `sprint3-storage/v1` envelope: pinned
content version, whole-row revision, event revision, status, canonical current
beat, events, answers, resume state, optional report cache, lifecycle timestamps
and nullable completion-policy version. No legacy Week 1/2 row is rewritten.

Events use the checked-in Distraction Audit shape `{id, at, label}`: at most
300, unique normalized IDs (1–64 characters), timezone-bearing ISO timestamps
and nonblank normalized labels (1–40 characters). SQL checks protect direct RPC
calls; integration fixtures and parity cases also run the actual existing
`distractionAuditInputSchema`. Raw non-normalized event strings are rejected;
callers supply the normalized schema output. No new curriculum fields are added.

Resume is `{elapsedActiveMs, positionMs, state}` with nonnegative safe integer
milliseconds, nullable position, and `idle`/`paused` state. Restoration adds no
background time and does not attest timer authenticity. Answers are private
string maps restricted to configured keys; no production keys are guessed.

The optional `distraction-audit-cache/v1` report preserves input
events/revision, source label and the existing
`{totalEvents, categories, uncategorized,
assignments}` result. Database
validation checks assignment coverage/order and the existing largest-remainder
arithmetic. Tests reuse the actual result schema and
`distractionAuditMatchesRequest`. A report is accepted only for the current
event snapshot; later event edits retain that older report, identifiable as
outdated by its revision. A save cannot clear the last valid report with null. A
failed provider request performs no save. This is an owner cache, **not attested
provider provenance** or append-only generation history; MIN-232 remains
separate.

## Write, retry and recovery boundary

`save_week_three_draft` accepts exactly
`{contractVersion, slug, operationId,
expectedRevision, contentVersion, patch}`.
Allowed patch fields are `events`, `currentBeat`, `answers`, `resumeState`, and
`auditResult`. Omitted fields retain their values; supplied arrays/maps replace
their complete field values. Identity, status, timestamps and completion policy
cannot be supplied as patches.

Ownership comes from authenticated Supabase identity. Ordinary authenticated
roles have owner-only SELECT under RLS and no direct mutation grants. A separate
NOLOGIN/NOINHERIT/NOBYPASSRLS `week_three_writer`, not a table owner, executes
the restricted write RPC with owner RLS for both existing rows and new values.
It has only owner-filtered completion columns on legacy progress, no private
legacy writing/answers, no configuration mutation and no membership granted to
clients. The private identity bridge reads `auth.uid()` only. No service-role
key reaches mobile. Errors/logs do not include student text or raw diagnostics.

An advisory transaction lock serializes writes for one owner/activity. Atomic
`week_three_write_receipts` acknowledge the original successful revision. Same
operation/payload replays; changed payload conflicts; a fresh stale revision
conflicts. Two simultaneous updates from one revision have one winner. A rolled
back transaction leaves neither changed progress nor receipt; a lost committed
response is retried with the same UUID/payload. No durable pending claim exists.
Receipts acknowledge revisions, never overwrite newer draft data on replay.

Publication is checked before receipt lookup: replay after target withdrawal
returns unavailable; owner load still recovers the last committed state. Fresh
writes also recheck prerequisites. A prior successful receipt replay does not
perform a new mutation or recheck changed prerequisite configuration.

`load_week_three_progress({slug})` returns the owner's camelCase projection or
null, including after withdrawal; it never accepts/returns an owner ID. The
mobile helpers `saveWeekThreeDraft`, `loadWeekThreeProgress`, and
`restoreWeekThreeResume` pin the verified session token and reject an account
change before returning data. The helpers are injectable infrastructure; fixture
screens and current main's UI are unchanged.

## Completion boundary

Only in-progress writes are implemented. `complete_week_three` explicitly
returns `COMPLETION_POLICY_UNAVAILABLE` (503) for authenticated, well-formed
requests. MIN-225 must supply its versioned predicate before that transition is
enabled. A previously valid, policy-stamped completed record remains readable
and cannot be downgraded or edited, even through the restricted writer. Tests
seed a clearly synthetic terminal record with trusted SQL solely to verify this
guard.

MIN-226 must remain In Progress until the remaining approved policy/integration
requirements are satisfied. No production configuration, fixture-backed UI
connection, route guard or new AI provider is claimed here. Direct database
writes to the new private relations cannot bypass the backend checks. Existing
legacy progress APIs are unchanged and do not acquire new prerequisite
guarantees.

## Verification

With local Supabase running, from the repository root:

```sh
node --test mobile/tests/activity-lookup.test.cjs mobile/tests/week-three-helpers.test.cjs
node --test mobile/tests/integration/activity-lookup.test.cjs
node --test mobile/tests/integration/week-three.test.cjs
```

Run the integration commands sequentially: each owns temporary synthetic
curriculum fixtures. The Week 3 suite requires an unused Week 3; the lookup
suite requires an unused week in 3–8. They fail rather than overwrite existing
curriculum. Setup applies pending migrations without resetting the database;
cleanup deletes only the suite's synthetic users/configuration/curriculum.
`SUPABASE_CLI` may identify a preinstalled CLI. The shared migration helper
preserves the already-recorded historical local MIN-110 migration without
importing that model into this branch.
