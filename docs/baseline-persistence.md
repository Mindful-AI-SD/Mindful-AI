# MIN-220: Definition-driven baseline persistence

Implementation base: main `e89819cef332306a59b14028c3b9c0761c4e98bd`. Contract:
[MIN-214 PR #53](https://github.com/Mindful-AI-SD/Mindful-AI/pull/53),
`sprint3-storage/v1`. This ticket implements generic infrastructure, not
production curriculum seeding. MIN-219 still owns the approved five questions
and their keys. No Week 1/2 progress data, completion rules, instructor access
or Week 8 UI changes.

## Schema and publication

`20261029000000_baseline_persistence.sql` adds only:

- `baseline_definitions`: composite definition ID/version PK, exactly five
  ordered unique question objects (`questionId`, `prompt`, `maxCharacters`),
  publication flag. Question keys/text/version are immutable. Publication alone
  can change.
- `baseline_records`: one row per authenticated user, pinned definition FK,
  string answer map, draft/submitted state, revision and database timestamps.
  Submitted answers, identity and timestamps cannot be edited through the write
  role.
- `baseline_write_receipts`: owner/operation UUID PK, payload hash,
  operation/outcome, accepted revision and original submission timestamp. No
  answer text is duplicated.

A definition is supplied by a trusted migration/operator content process.
Student clients cannot author/publish definitions. Definitions referenced by
originals cannot be deleted; owners can still read their pinned definition after
withdrawal. New creation/edits need published content; identical successful
retries do not. There are **no production definitions in this migration**. The
random synthetic question sets in the integration test are deleted with the test
users.

Answer length uses Unicode code points, a definition-specific maximum and the
20,000-character technical ceiling from MIN-214. All five answers must be
nonblank on submission. Drafts may be partial/empty. The independent legacy Week
1 150-word writing requirement is unchanged, not imposed on each baseline
answer.

## Public helper and RPC surface

`mobile/lib/baseline-helpers.ts` exports typed methods:

- `loadBaseline()`: current draft/submitted record or null.
- `saveBaselineDraft({ operationId, expectedRevision, definitionId,
  definitionVersion, answers })`:
  successful-save receipt.
- `submitBaseline(sameInput)`: immutable-original submission receipt.
- `loadOriginalBaseline()`: `{ contractVersion, original, definition }`; both
  values are null before submission. It never returns draft answers.

The corresponding RPCs are `load_baseline`, `save_baseline_draft`,
`submit_baseline` and `load_original_baseline`. There is no owner argument.
Reads/writes verify the Supabase user; account changes reject delivery of the
earlier account's result. Each RPC is bound to a captured session token verified
with `auth.getUser(token)`, so an account switch during dispatch cannot transfer
earlier form data to the new account. Database ownership comes from that
verified request identity. An account change can be detected after a transaction
commits: the helper rejects its response but cannot undo that transaction.
Callers should also discard form state on account switches, as existing
application flows do.

Write inputs reject protected/unknown fields, invalid UUIDs/revisions/versions,
non-string answers and oversized requests. Caller answer objects are copied
before asynchronous authentication. The database independently validates the
pinned question set, keys, lengths, ownership and lifecycle.
`BaselinePersistenceError.code` exposes controlled conflicts/unavailability;
messages never echo raw database/provider errors. Write RPC wrappers also
normalize unexpected database exceptions.

The latest main adds Christopher's fixture-only `mobile/lib/baseline.ts`
contract. That file and its screens are preserved unchanged. Persistence lives
separately in `baseline-helpers.ts`, reuses its `BaselineWrite` type, and
exports a `baselineService` adapter matching `BaselineService` (void writes and
the shared form error class). The detailed helper methods still return receipts.
No screen is automatically wired to live storage and importing the fixture model
does not import Supabase helpers.

Receipts acknowledge the revision originally saved. A screen reloads current
data after an acknowledgement rather than putting replayed draft text over newer
work. The caller generates one operation UUID for an intentional save/submit and
retains that UUID **and identical payload** when retrying a transport failure.
After a stale revision conflict, the caller reloads and explicitly reconciles
before using a new operation UUID. No silent deep merge or automatic overwrite
is performed.

## Authorization and immutability boundaries

Authenticated students have owner-only SELECT on records/receipts. Anonymous
roles have no baseline grants. Direct student INSERT/UPDATE/DELETE is denied;
the RPCs are the only ordinary write path. Definition reads expose published
metadata or the definition referenced by that owner's saved record. Other users'
drafts, originals and receipts remain unreadable under RLS.

Writes execute as `baseline_writer`, a NOLOGIN/NOINHERIT/NOBYPASSRLS role that
owns functions but not tables. It has only baseline SELECT, record INSERT/UPDATE
and receipt INSERT. It cannot read legacy progress and is not granted to client
roles. Migration checks fail closed for an unsafe pre-existing writer role
configuration. Private helper functions are outside the exposed API schema.
Temporary schema creation privileges used during ownership transfer are revoked.

Supabase's managed `auth` schema does not give the migration role permission to
delegate its schema privileges. A single private identity-only security-definer
function owned by the migration role returns `auth.uid()` with a fixed empty
search path. It accepts no arguments and reads/writes no tables. This lets the
restricted writer evaluate caller identity without inheriting the broad
`authenticated` role or bypassing RLS. Read RPCs are security-invoker functions;
student SELECT policies use `auth.uid()` directly. No service-role client or new
mobile secret is added.

RLS supplies account isolation; ordinary grants restrict mutation entry points;
triggers pin identity/definition, control timestamps and freeze submitted
records; RPC transactions supply CAS and idempotency. Helper checks alone do not
provide these guarantees. Trusted Auth account deletion can cascade through
owned rows; there is no ordinary baseline deletion/reset API or new retention
policy.

## Retry and recovery

A per-owner transaction lock serializes first creation and later mutations. The
operation receipt is checked before publication/revision checks. Its SHA-256
hash covers operation kind and the exact versioned request under JSONB key
ordering. Original string values are not trimmed/replaced. Changed payload/kind
under the same operation ID conflicts. A fresh stale revision conflicts. A fresh
write after submission is immutable, even if it requests another definition
version.

The record and successful receipt commit in one transaction. There is no
provider call or durable pending-claim stage. Interruption before commit rolls
back both; a lost reply after commit replays the stored acknowledgement.
Repeated submissions retain one original and one timestamp. A baseline receipt
is private metadata, not an anonymized analytics record. Receipt
expiration/reclamation is not added.

Recovery consists of loading the current owner record/original and retrying the
same operation if its outcome is uncertain. New IDs must not be used to
circumvent an immutable original. No database reset or deletion of existing
learner data is part of recovery. Shared deployment verification belongs to
MIN-238, not this PR.

## Local verification

With Docker Desktop's Linux engine/WSL integration running, existing mobile
packages installed, and local Supabase started, from the repository root:

```sh
node --test mobile/tests/integration/baseline.test.cjs
node --test mobile/tests/integration/progress-helpers.test.cjs
node --test mobile/tests/*.test.cjs
npx supabase db lint --local --level warning
npm --prefix mobile run check:client-security
git diff --check
(cd mobile && npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --types node \
  --target ES2022 --module preserve --moduleResolution bundler \
  --lib ES2022,DOM lib/baseline-helpers.ts)
```

The baseline suite captures local CLI credentials in memory without printing
them, requires a loopback API URL, creates temporary test users and legacy Week
1/2 rows **before migration**, then compares every legacy column afterward. It
runs actual Auth/REST/RPC requests using the public key and signed-in sessions.
Admin SQL is confined to synthetic fixture setup, migration, narrowly scoped
role/ transaction probes and fixture cleanup; it is not an application
service-role path. SQL lint and existing intention persistence tests require
their ordinary local setup; serve `mindfulness-response` before the existing
intention suite.

The existing local database also contains historical migration `20261015000000`
from MIN-110, which is absent from main. The CLI rejects that history mismatch.
The test recognizes only that specific historical version and stages current
migrations plus its already-recorded SQL in an owned temporary directory. The
CLI then applies only pending MIN-220 SQL. No history entry is marked reverted,
no historical DDL reruns, no `beat_progress` code is imported into this branch,
and no project database/volume is reset. Unexpected additional drift fails for
inspection. On a clean/main-only history this staging is unnecessary. A cached
CLI can be selected using the optional `SUPABASE_CLI` environment variable.

Verified here: 24 new Docker tests including parent; 9 focused helper tests; 8
existing progress and 9 intention-persistence Docker tests; 350 shared backend
tests plus 33 mindfulness-response and 119 ai-activity endpoint cases; 157
mobile Node regression tests including the new helpers. Focused baseline
TypeScript, SQL lint, scoped lint, formatting, whitespace and client-security
checks pass. Full frontend checking has existing CSS/media-dependency errors
reproduced against untouched main; no unrelated frontend changes are included.
The full component run reports 83 passes and one breathing-navigation timeout,
reproduced on untouched main. After integrating e89819c, the new Guiding
Questions suites report 10 passes and one capture timeout; the identical result
reproduces on untouched e89819c. Tests and timeouts are unchanged. These are
local checks, not a shared deployment or live provider certification.
