# Navigation and form acceptance repairs

Verified November 4, 2026, starting from main `a8c1fec`.

No integrated-review assignment list was present in the checkout or open GitHub
issues. A request for the assigned tickets/reproduction steps is pending. The
following are independently reproduced defects in the requested screens, not
claims that all assigned review tickets have been closed.

## Reproduced defects and fixes

1. Baseline: enter a partial answer, choose Back to curriculum, then reopen.
   Previously the answer disappeared. Both curriculum exit controls now save
   the draft before leaving. A failed save keeps the form open and Retry uses
   the same operation and exits only after successful recovery. Over-limit
   answers remain editable; both exit controls are disabled with readable
   correction text and an accessible save-before-return hint. Submitted
   originals remain read-only and can be exited without another write.
2. Week access: open Week 3, type without saving, background the app, then fail
   the resumed prerequisite read. Previously the check unmounted the form and
   Retry restored an empty field. Transient errors now keep an already allowed
   form mounted but hidden from sight and accessibility until access succeeds.
   Initial loading/errors never mount a protected form; an explicit denied
   result still removes it. Account/week changes reset the gate session.

Both new input-loss tests failed against the previous implementation and passed
after the fixes. No completion is awarded locally and no prerequisite policy,
provider, backend storage, or approved curriculum copy was changed.

## Verification

- All 115 React Native component tests pass (19 suites), including save errors,
  duplicate submissions, required/over-limit fields, immutable originals,
  account isolation, draft remount, failed prerequisite checks and revocation.
- Seven Edge browser checks pass: baseline partial-answer Back/save failure and
  reload at 390px and 1280px, all-five-answer submission and original restoration,
  three sequential/direct-route checks, and the Week 3 path at 390px. Week 3
  checks unsaved input after failed access verification, save/load retries,
  backward navigation and restart. Fixture runs make no AI or completion writes.
- Web export and exported-bundle client security check pass. This OneDrive
  checkout misreports cloud-file directory entries as symbolic links. Export
  used a temporary ignored `.expo/cloud-dirent.cjs` Node preload to classify
  those entries using lstat; no dependency or application configuration changed.
- Full TypeScript checking remains blocked by existing SDK 58 errors in settings,
  accessibility refs, theme and tabs. No changed task file reports a type error.

The browser uses synthetic authenticated HTTP fixtures and account-scoped
same-device storage. Phone-sized browser checks and React Native component
tests are not physical Android/iOS acceptance runs. No device/emulator was
available in this environment; native walkthroughs and the actual assigned
review-ticket checks remain unverified.
