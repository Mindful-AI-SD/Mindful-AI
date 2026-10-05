# Returning-user verification

## Repair 1: saved step and completion

The existing screens saved writing and answers but never changed `current_step`
or completion status. Added a user-scoped progress service that saves step
transitions and answers together, detects conflicting writes, restores legacy
drafts, and records completion only after the final step.

Verification: `node --test tests/week-one.test.cjs` covers normal progression,
restoration at writing/results, failed or conflicting saves, account isolation,
and completion data. These checks use a simulated database, not live Supabase.

## Repair 2: connected screens and restart restoration

Connected breathing, post-breathing check-in, writing, saved mock results,
data self-portrait, gap reflection, Yellowdig draft, and completion. The home
screen now restores progress. Saved results open without another generation
request, and submission waits for writing to save before generating intentions.

Verification: TypeScript and the 45 focused tests pass. Added real-browser tests
for the normal path and restarts after writing and mock generation. The first
browser run reached writing on both paths but found that the web checkbox did
not expose its checked state. That separate accessibility repair is recorded
below; this run was not counted as a completed end-to-end pass.

Browser setup: `npm run export -- --platform web`, then
`npm run test:returning-user`. Uses installed Edge by default; set
`PLAYWRIGHT_CHANNEL=chrome` to use Chrome. The tests operate the actual exported
frontend, simulate Supabase HTTP responses, and advance the browser clock for
the ten-minute breathing timer. They do not contact live Supabase or Yellowdig.

## Repair 3: web checkbox state

The privacy checkbox displayed a checkmark but React Native Web did not expose
`accessibilityState.checked` as `aria-checked`. Added explicit ARIA checked and
disabled values, keeping native accessibility state intact.

Verification on October 1, 2026:

- `npm run export -- --platform web`: passed, including client security scan.
- `npm run test:returning-user`: both browser tests passed in installed Edge.
- Normal run: breathing → check-in → writing → mock intentions → data
  self-portrait → gap reflection → Yellowdig draft → completion.
- Restart run: full page reload after saved writing restores the writing step
  and exact text; reload after mock generation restores the intention step and
  all three saved intentions. Both runs restore completion after another reload.
- Both runs retain the writing, all three intentions, all seven answer fields,
  completed status, and completion timestamp, with no page errors or unexpected
  network requests. The browser uses synthetic users and simulated Supabase
  HTTP responses. No live-backend or physical-device verification is claimed.
- `node --test tests/*.test.cjs`: 45 focused tests passed, including checkbox
  checked-state assertions. `npx tsc --noEmit`: passed.

## Repair 4: current submission and progress test fixtures

On October 5, 2026, the focused tests still omitted the required
`onIntentionsReady` callback and used the old free-text check-in field. This
made successful submissions look like failures and gave the progress service
inconsistent saved records. Updated the screen props, the Yes/No check-in
fixtures, per-step answer submissions, and the completion query mock.

Verification: `node --test tests/*.test.cjs` passes all 52 tests, including
successful submission, timeout/provider recovery, duplicate submission
prevention, exact draft preservation, saved-step restoration, and completion.
These tests use isolated service and persistence mocks.

## Repair 5: accessible check-in selection and complete returning-user runs

The browser reproduced a check-in accessibility defect: selecting No changed
the button styling, but the radio had no `aria-checked` value. Added explicit
checked/disabled values, a named radio group, and readable selected-answer text.
Native accessibility state remains covered by the screen test.

Updated the browser path for the current curriculum activity button and
Yes/No check-in. After a restart, the test opens the saved activity from the
curriculum and verifies the restored screen. It checks all three intention
titles and explanations and compares every saved answer with the entered text.

Verification on October 5, 2026:

- Before the repair, both browser paths failed the checked-radio assertion.
- `npm run export -- --platform web`: passed, including the bundle security check.
- `npm run test:returning-user -- --timeout=30000`: both Edge browser paths
  passed. The normal run completed every Week 1 step. The restart run reloaded
  after saved writing and after mock generation, restored the writing and
  intention steps respectively, and then reached completion.
- Both runs preserved the exact writing, three intentions, and all eight
  reflection fields (including the Yes/No check-in and optional note). Both
  restored completed status and the completion screen after a final reload,
  with no page errors or unexpected requests.
- `npm test -- --watch=false`: 24 tests passed across five suites.
- `node --test tests/*.test.cjs`: 52 tests passed.
- `npx tsc --noEmit`: passed.

The browser operates the exported frontend with synthetic authentication and
simulated Supabase HTTP responses. A full page reload restarts frontend state.
These runs do not claim live Supabase or physical-device verification.
