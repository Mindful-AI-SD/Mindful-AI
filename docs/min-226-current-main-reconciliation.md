# MIN-226 — Reconciliation with current Week 3 implementation

Inspected main `ce3b81f8f1b4f0281490ae4a9649b7f847c81f66`, including `3895fb87`
and provider-controls PR #67, on 2026-11-12. The old draft PR #56 (`68952f19`)
is not a safe implementation base for current Week 3 behavior.

## Disposition of the old draft

| Old PR #56 element                               | Current evidence                                                                                                                                                   | Safest disposition                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity_aliases` and slug resolver             | Main's actual screens/services use canonical published activity UUIDs and `getActivityWeek`; no production alias registry or mapping was supplied                  | Do not introduce an unconfigured second identity system just to merge the old branch. Literal slug mapping remains an explicit contract gap requiring approved identity/configuration decisions |
| Separate `week_three_progress` and draft helpers | Main stores the actual current module in existing progress JSON, with owner checks, saved step/timestamp CAS, field preservation and retry identity                | Superseded for the current module; do not migrate existing JSON into the obsolete schema                                                                                                        |
| Old `{id, at, label}` event envelope             | Newer module has source/day/topic/app/time data, student/live category confirmation and one-decimal summaries                                                      | Retain current module; old contract is not a drop-in substitute                                                                                                                                 |
| Old cached Distraction Audit result              | Dedicated new audit route and ledger serve the module; its schema/categories/percentages differ from the older general `distraction_audit` route                   | Keep the two contracts distinct; do not copy the old draft's validation/arithmetic                                                                                                              |
| Production prerequisite mappings                 | Main helper and audit route require all published activities in each prior week to have owner completion/timestamps                                                | Reuse the implemented saved-state rule; do not seed guessed aliases or explicit target tables                                                                                                   |
| Direct REST write protection                     | Reproduced HTTP 201 for a fresh owner with zero prior progress on untouched main                                                                                   | Still needed; narrow replacement adds restrictive RLS on existing progress                                                                                                                      |
| Completed-state protection                       | Module helper refuses edits, but generic owner REST grants remained mutable/deletable                                                                              | Still needed; replacement protects identity and prevents student terminal update/delete                                                                                                         |
| Completion stub                                  | New teammate module already has completion gates backed by supplied source documents, with some team rules marked pending review; Jira MIN-225 remains In Progress | Do not replace it with the old 503 stub or invent a final predicate. Approval/attestation remains separate                                                                                      |

Recommendation: hold #56 as an archival draft and review this minimal
replacement from latest main. Once the replacement's scope and identity-policy
decision are approved, close/supersede #56 rather than blindly rebasing its
parallel schema. No old PR is retargeted, closed or pushed by this local
preparation. No production alias or completion policy is fabricated. No old
schema/data is deleted.

## Replacement write boundary

`20261112010000_week_three_progress_write_boundary.sql` changes only database
rules for the current `progress` relation. It adds no tables, private-data
copies, new student-visible fields or curriculum seeds. Restrictive
INSERT/UPDATE policies AND with existing owner policies, because adding another
permissive policy would not close the bypass. Their helper derives identity from
`auth.uid()`, resolves the canonical activity's actual parent, and checks the
same published Week 1/2 saved-state prerequisite already used by main.
Missing/empty prior curriculum or an unpublished target fails closed. Other
weeks retain existing behavior.

The small SECURITY DEFINER checks use an empty search path and static SQL; they
accept no owner selector, expose no text, and do not mutate progress. They
inspect only the authenticated owner's completion state. The terminal-row check
also works after curriculum withdrawal. Its scope is necessary because an
invoker query would lose unpublished curriculum metadata under existing SELECT
RLS. Client execution is denied to PUBLIC/anonymous roles. The trigger itself
has no client-callable trigger API.

A trigger rejects identity changes involving Week 3 and returns no updated row
for an already completed Week 3 record before timestamp triggers run. A
restrictive DELETE policy blocks deleting/recreating that owner's terminal
record. Owner reads and draft deletion remain permitted by the existing
policies. Auth-account cleanup and trusted fixture cleanup retain their existing
privileged boundary. Existing rows are not rewritten by migration.

This enforces prerequisites on writes. It does **not** validate the new module's
full JSON completion predicate in SQL, make owner-editable legacy completion
flags independent learning evidence, or introduce serializable coordination with
concurrent administrative curriculum edits. Current terminal rows are preserved,
not retroactively certified against a new sponsor policy. Full MIN-226 cannot be
claimed complete while canonical slug requirements and the final MIN-225 policy
boundary remain unresolved.

## Verification

The new integration suite uses two synthetic real Auth sessions and direct REST,
not only mocked helpers. Before applying the migration it creates synthetic
draft and terminal rows, then checks migration preservation. It covers denial
without prerequisites; forged ownership and canonical-identity changes; eligible
saves, reload and duplicate upserts; a single missing prerequisite; withdrawal;
terminal update/delete denial; cross-account/signed-out denial; and retained
Week 1/2 writes. No provider call or shared deployment is involved.

Run with local Supabase running from this candidate checkout:

```sh
node --test mobile/tests/integration/week-three-progress-boundary.test.cjs
```

The suite reuses existing local helpers. Its CLI migration workspace recognizes
only already-recorded historical developer versions `20261015000000`,
`20261029010000` and `20261029020000`; unknown drift fails. It replays no
historical DDL, resets no database and cleans up only its own fixtures. No
existing test is weakened. A cached CLI may be selected through `SUPABASE_CLI`.

This is local replacement preparation. Commit/push/PR changes require review of
this concrete scope; no merged, deployed or approved completion claim is made.
