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
