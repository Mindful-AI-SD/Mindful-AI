# MIN-280 — Backend evidence and design tradeoffs

Review contribution, 16 November 2026. The implemented baseline is main
`ce3b81f8f1b4f0281490ae4a9649b7f847c81f66`. This contribution targets three
additional manuscript pages; actual pagination and the cumulative twenty-page
requirement remain unverified until the team supplies the assembled FDD. The
material supplements, rather than replaces, the accepted architecture and data
dictionary contributions. The editable figures and evidence register accompany
this file. No runtime, schema, policy or deployment changes are introduced.

## 1. Evidence boundaries and the current relational model

MindfulAI's backend separates published curriculum, student-owned learning
records and controlled generation operations. The distinction matters because a
successful screen demonstration does not prove database authorization, and a
database test does not prove a deployed provider configuration. Figure 1 shows
the relevant implemented relations. It deliberately excludes the historical
MIN-110 beat-progress branch, old PR #56's parallel Week 3 tables, and proposed
instructor membership. None is part of this main snapshot. Baseline definitions
are versioned curriculum metadata; baseline records and operation receipts are
private owner data. The audit ledger and request counter serve different
purposes and must not be treated as a general reflection archive. [S1–S4]

**Figure 1. Current persistence relationships.** Editable source:
[backend-persistence.mmd](figures/min-280/backend-persistence.mmd). The figure
is a focused relational projection, not a replacement for the complete ERD. Its
composite keys and relationships are taken from checked-in migrations.

Eleven migration versions exist on main. The original six establish legacy
curriculum, progress and intention operations; the subsequent baseline, audio,
published-definition, audit-ledger and quota migrations extend that model. Their
presence establishes source order, not remote application. The local database
additionally retains historical developer migrations and the separately tested
PR #68 candidate. That local database is therefore not a clean main-only
deployment. Existing compatibility tests verify retained synthetic Week 1/2
records, but cannot establish that an unknown shared project has the same schema
or content. No historical version was reverted or imported into this branch.
[S1, S3–S4, E1–E3]

The current FDD drafts require the same temporal discipline. PRs #57–#59 now
contain current-state addenda while retaining explicitly dated October material.
They remain unmerged review contributions. PR #69 is an incomplete handoff, and
PR #68 is a narrow security candidate, not a deployed guarantee. A final FDD
should integrate the accepted current statements rather than copy the old
prototype descriptions as implemented behavior. [D1–D5]

## 2. Storage, identity and concurrency tradeoffs

A separate baseline model was selected instead of adding more keys to legacy
progress JSON. A baseline record has one authenticated owner, a referenced
definition/version, bounded revision, draft/submitted status and submission
identity. Mutable drafts support interruption recovery; the first successful
submission fixes the original answers. The submitted row itself becomes the
immutable original, rather than creating a second answer copy that could drift.
The cost is a deliberately restricted lifecycle: ordinary client writes cannot
silently correct or replace the original. Any future correction or deletion
policy requires an explicit approved design; it is not inferred from Week 8
comparison needs. [S1, S5]

Figure 2 explains why a database transaction is preferable to a mobile
read-then-write submission sequence. The baseline write path derives identity
from authentication, serializes owner operations, compares the expected revision
and records the receipt with the mutation. A repeated operation with the same
request hash replays its acknowledgement; changed input with the same identifier
conflicts. Separate stale operations cannot overwrite the accepted revision.
Because receipt and record changes share a transaction, an exception rolls them
back together. An uncertain network outcome is resolved by retrying the same
operation or loading current/original state, not by assuming that a timeout
means nothing was saved. A receipt reports the revision it acknowledged; it is
not a promise that no newer draft exists. [S1, S5, E1]

**Figure 2. Baseline write and retry boundary.** Editable source:
[baseline-write.mmd](figures/min-280/baseline-write.mmd). The sequence
represents the merged transaction/receipt design, not the service-only audit
ledger or old PR #56. It contains no student text or source-code listing.

Week 3 currently makes a different tradeoff. The module encodes its versioned
state under `progress.reflection_answers.week_three_module_v1`, retaining the
legacy row and unrelated answer keys. Its service checks the authenticated
session, canonical published activity and prior-week access, then uses saved
timestamp/step comparisons to detect competing updates. This avoids migration of
existing progress into a parallel model, but does not make the JSON envelope a
database-enforced completion contract. The latest saved operation identifier is
also not a durable history of every operation. Baseline receipt guarantees must
not be generalized to this helper or to ordinary last-write-wins progress
updates. Current restore validation rejects incompatible state without replacing
it, and the service refuses edits to completed module records. [S6–S7]

| Choice                                | Benefit                                                       | Cost or remaining boundary                                                                |
| ------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Separate baseline plus restricted RPC | Immutable original and atomic owner retry receipts            | Additional lifecycle/definition constraints; no ordinary replacement of submitted answers |
| Week 3 state inside existing progress | Preserves legacy rows and current module integration          | JSON semantics and latest-operation checks are not a full database receipt history        |
| Service-only audit ledger             | Keeps retry/billing claims outside student write grants       | Server privilege requires explicit authenticated-owner and prerequisite checks            |
| Explicit provider modes               | Failure does not silently become another comparison condition | Configuration, source retention and real provider acceptance need separate evidence       |

## 3. Authorization, provenance and recovery limitations

Student identity is established by Supabase authentication. Baseline owner
selection is internal to its RPC; the restricted database writer role does not
grant students arbitrary mutation rights. Owner RLS and restricted grants
protect private rows independently of screen navigation. In contrast, the
current Week 3 helper and audit endpoint check prior-week completion while
main's generic progress write policies permit a direct REST prerequisite bypass.
PR #68 adds restrictive write policies and terminal-row protection on the
existing relation. Its nine local tests are evidence for that candidate, not
evidence that main already enforces the protection. Even the candidate does not
certify learning from owner-editable prior-week completion or supply MIN-225's
approved final completion predicate. [S1, S6, S8, D4, E2]

The service-only Week 3 audit ledger binds an owner and operation identifier to
an input digest and controlled result. The function validates the signed-in
owner and published activity before using its server credential. Request
counters contain counts rather than prompts and allow owner reads; controlled
claim logic increments usage. These boundaries reduce student write authority,
but a counter alone is not proof of account-wide spending enforcement. The
provider's workspace limit, permission to process student text and live
acceptance remain separate operational responsibilities. No server credential
belongs in the mobile application. [S3–S4, S8–S9]

Provenance is partially implemented. Week 3 retains mode, content version and
summary state, while Claude/prewritten configuration and validation are merged.
However, Week 1's intention-save boundary persists the intention array without
the corresponding provider metadata. Current Week 3 state is not an append-only
archive of historical generations. Thus neither provider support nor Jira
MIN-232's Done status proves complete immutable provenance for all past results.
Future history requirements need an approved retention contract; this document
does not invent new provenance columns or backfill unknown sources. [S6–S7, S10]

The evidence register records the November 16 local runs: 24 baseline cases,
eight existing progress/RLS cases, 187 mobile/service tests and the shared
backend/endpoint suites passed. The baseline cases include owner isolation,
original immutability, retries and preserved legacy fields. These results are
stronger evidence than fixtures alone but remain scoped to synthetic users and
the tested local state. The unchanged-main TypeScript check retains eight
CSS/native-tabs/media diagnostics; clean dependency installation also encounters
the existing lockfile mismatch. Neither defect is repaired or concealed by this
documentation contribution. [E1–E6]

Recovery claims must stop at the tested boundary. Baseline atomic rollback and
same-operation replay are verified locally. Historical intention processing
claims can remain pending after interruption; automatically reclaiming them
could repeat generation. A shared restart, backup restoration or host-loss
recovery has not been established. The current live-verification document
explicitly records no real Claude verification. Fake-server tests demonstrate
controlled parsing and failures, not live quality, cost or deployment readiness.
MIN-244 still requires an approved shared target, applied migration/function
inventory and another teammate's owner-isolation/reload/retry/restart evidence.
Week 8 original retrieval exists; Week 8 UI and production instructor reporting
must remain identified as future work. [S5, S9, S11, D5]

## References and delivery limits

All S references below are pinned to the inspected main commit. D references are
explicitly unmerged draft snapshots. E references are entries in the
[evidence register](backend-evidence-register.json); historical runtime results
were inspected, not rerun for a documentation-only change.

- S1:
  [Baseline schema, lifecycle, RPC and RLS](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261029000000_baseline_persistence.sql).
- S2:
  [Approved baseline definition](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261108000000_publish_week_one_baseline.sql).
- S3:
  [Audit ledger](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261109000000_week_three_audit_requests.sql).
- S4:
  [Usage counter and claim](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/migrations/20261112000000_ai_request_counts.sql).
- S5:
  [Baseline helper and original retrieval](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/mobile/lib/baseline-helpers.ts).
- S6:
  [Week 3 service](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/mobile/lib/week-three-module-service.ts).
- S7:
  [Week 3 contract and gates](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/mobile/lib/week-three-module.ts).
- S8:
  [Authenticated audit endpoint](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/supabase/functions/week-three-audit/index.ts).
- S9:
  [Provider controls and evidence limits](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/docs/sprint-3/claude-tuning-and-usage.md).
- S10:
  [Intention save boundary](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/mobile/lib/progress.ts).
- S11:
  [Live verification remains unexecuted](https://github.com/Mindful-AI-SD/Mindful-AI/blob/ce3b81f8f1b4f0281490ae4a9649b7f847c81f66/docs/sprint-3/claude-live-verification.md).
- D1–D3: FDD drafts [#57](https://github.com/Mindful-AI-SD/Mindful-AI/pull/57),
  [#58](https://github.com/Mindful-AI-SD/Mindful-AI/pull/58),
  [#59](https://github.com/Mindful-AI-SD/Mindful-AI/pull/59), refreshed at
  `27539c1`, `9cfce16`, `6503fb6` respectively.
- D4–D5: Security draft
  [#68](https://github.com/Mindful-AI-SD/Mindful-AI/pull/68), `8e2d1b4`;
  incomplete handoff draft
  [#69](https://github.com/Mindful-AI-SD/Mindful-AI/pull/69), `528a273`.

MIN-280's evidence/tradeoff contribution is prepared for review. Its three-page
target and twenty-page cumulative acceptance must be checked in the editable
assembled FDD, including attribution and figure sizing. MIN-286 requires that
merged document for section-specific corrections; MIN-292 requires the final
accuracy/citation/page-count review. Those signoffs are not supplied here.
