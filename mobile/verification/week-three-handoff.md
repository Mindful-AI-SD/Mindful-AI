# Week 3 completion handoff implementation

Implemented November 9, 2026, against main `58d803b`.

Sources supplied by the user: Isa's **Week 3 Completion and AI Comparison
Script**, November 2, and **True Non AI Exercise Content**, version 1.0,
November 4. This replaces the normal route's earlier synthetic Explore/Notice
preview. The old injected preview remains available for regression tests; old
device-only preview answers are retained and can be opened read-only.

## Behavior

- Arrive saves a required scattered-to-focused integer from 1–5. Practice uses
  the configured sponsor recording or its supplied text alternative. Optional
  planning/memory/worry/other practice labels are saved separately.
- Explore saves three distinct relative day records, editable/deletable raw
  entries, source, topic, relevant app/content type, optional whole minutes and
  timestamps. Each day needs an entry or explicit No distraction noticed.
  Empty days cannot also contain entries. The closed category list and minimal
  day rule remain labeled team implementation rules pending sponsor review.
- Prewritten mode makes no model or function requests. Students select categories;
  live mode gets bounded proposals from the server, then requires confirmation
  or correction. Both modes use the same deterministic one-decimal percentage
  calculation from confirmed entry counts. The six handoff events produce
  Entertainment 33.3%, four categories 16.7% each, and Other 0.0%.
- Raw text is preserved as entered, independently of both modes' categories.
  A changed entry invalidates its summary and subsequent ethics/sit gate. Mode
  switching retains raw entries and both sets of category choices; it never
  silently falls back to another mode.
- A valid summary leads to the exact ethics card and a two-minute active sit.
  The existing player saves its position and pauses in the background. A new
  summary gets its own sit identity so an earlier unfinished timer cannot count
  toward it. The supplied Practice alternative is available; no new, unapproved
  alternative for the two-minute sit has been invented.
- Notice uses “What patterns surprised you? What felt chosen, and what felt
  designed?” A saved nonblank answer is required, with no added minimum word
  count. Completion is shown only after the progress write succeeds. Completed
  data is read-only and the dashboard displays the saved status.

## Persistence and provider boundary

The authenticated service uses the existing owner-scoped `progress` record,
storing versioned state in `reflection_answers.week_three_module_v1` and the
latest save receipt in `week_three_module_operation_v1`. It preserves unrelated
answers, baseline data, writing and intentions. Updates compare `updated_at`
and the saved step; lost-response retries replay the same operation, while
stale sessions must explicitly reload. Partial form edits are debounced; step
transitions and entry saves flush immediately. Failed saves retain screen data.

The new `week-three-audit` function is separate from the older `distraction_audit`
contract, whose different categories and integer percentages remain unchanged.
It verifies authentication, a published Week 3 activity, and saved completion
of published Week 1/2 activities. Only entry IDs, topics and relevant app/content
types are sent to Claude. Baseline and reflection text are never included.
Output accepts only the six allowed categories for the exact ordered event IDs.
Logs contain token/latency metadata, not raw student text or provider responses.

The migration creates a service-only request ledger containing an input digest,
bounded result and processing/failure state, not raw audit entries. Claiming the
owner/operation pair before calling Claude prevents concurrent taps, a replay,
or a lost acknowledgement from repeating the same billable operation. Unknown
outcomes retain the operation ID. A definitive failed attempt can be retried
as a new deliberate request. SDK automatic provider retries are disabled.

## Verification and limits

- 169 React Native component tests pass, including the handoff's exact counts,
  day gates, concise reflection, saved-step restoration, failures, idempotent
  saves, owner/CAS protection, explicit mode changes and duplicate taps.
- Nine focused browser checks pass at 390px and 1280px across the current
  student path, sequential locks, save/access recovery and the handoff. The
  full prewritten runs enter all six events, restart after Day 2, resume a
  half-finished sit, reject completion before 120 active seconds, recover a
  failed completion write, and restore completed work. The AI comparison uses
  a controlled HTTP response and checks delay, timeout, retry, student review,
  matching percentages, minimized request fields and preserved raw data.
- Six Deno tests pass for minimized input, strict category output, concurrent
  requests, receipt replay, timeout/provider failures and a lost receipt write.
  The new server function type-checks.
- Web export and exported-bundle client security scan pass. The checkout's
  existing ignored OneDrive directory-entry preload is still needed for export.
- Full frontend TypeScript checking still reports pre-existing SDK 58 errors
  in settings, accessibility refs, tabs and theme. Changed Week 3 files report
  no type errors. Physical Android/iOS and screen-reader runs were not available.

Tests use synthetic authentication and HTTP data; sit time is advanced using
the test clock. They do not prove deployed SQL/RLS, real recordings, live model
quality/cost or native-device behavior. Existing baseline browser tests that
inject local-storage failures predate main's RPC integration; the updated
student-path tests use RPC fixtures. Historical November 4 screenshots and
their checklist describe the earlier candidate, not this replacement screen.

## Deployment handoff (not executed)

Apply `20261109000000_week_three_audit_requests.sql` and deploy
`supabase/functions/week-three-audit` before enabling live comparison. The
function uses the existing server-only Claude configuration plus Supabase's
server service credential. None is bundled into the client. Without the new
function/credentials, the UI reports live mode as unavailable and the student
may explicitly choose prewritten mode. No production migration, function
deployment, provider call or Jira update was performed in this task.
