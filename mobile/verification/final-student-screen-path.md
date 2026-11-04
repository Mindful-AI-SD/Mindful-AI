# Final student screen checklist

Owner: Christopher. Scheduled: November 10, 2026. Executed: November 4, 2026.

**Result: fixture journeys verified, with remaining defects and release checks
listed below. This is not a live-service or native-mobile release signoff.**

## Candidate and test source

The tested candidate is the local working tree based on `a8c1fec`, including the
uncommitted baseline Back/save and prerequisite-retry fixes from the previous
task. No separate frozen release tag, deployed candidate, or live test accounts
were supplied. Application screens were not changed during this verification.
The [candidate manifest](final-student-path/candidate.json) records source and
exported-file SHA-256 hashes; runtime source fingerprint:
`07cee8808a7f8fda0c73c1c91029acbd725093ca2a22b3dd6ba6d354fc7e53c4`.

Tests ran against the newly exported Expo web application in Microsoft Edge:

- Desktop web: 1280 × 900.
- Mobile web: 390 × 844, touch/mobile emulation. This is not Android/iOS testing.
- Synthetic sign-in identities, published curriculum and completion responses.
  The test server, not the UI, explicitly supplies earlier-week completion to
  verify unlocking. These are not real signup, backend persistence or RLS tests.
- Actual screen-default baseline and Week 3 fixture services, using account-scoped
  browser storage. Baseline definition: `synthetic-five-questions`, version 1;
  Week 3 content: `synthetic-week-3-v1`, MIN-214 synthetic tap log, example fields.
  Source labels say example/fixture, device-only saving, and no AI request.
- Restart means closing a browser context and reopening with the same device's
  saved storage copied in memory. No session/token snapshots were saved to files.

## Executed checklist

“Pass” below applies to synthetic fixture data on the tested local build.

| Check | Desktop web | Mobile web |
| --- | --- | --- |
| Signed-out Week 3 direct link displays sign-in, with no response fields | Pass | Pass |
| Fresh account has five separate, empty, labeled baseline fields | Pass | Pass |
| Partial baseline saves through Back and restores after context restart | Pass | Pass |
| Five answers required; 2,001 characters blocks submission without clearing input | Pass | Pass |
| Original baseline submits, restores all five answers, and remains read-only | Pass | Pass |
| Baseline submission alone does not unlock Week 2 | Pass | Pass |
| Week 2 remains locked before Week 1 completion, then shows its activity card | Pass | Pass |
| Week 3 remains locked before Week 2 completion, then opens its card and Explore | Pass | Pass |
| Explore displays the exact synthetic recorded event and explicit source labels | Pass | Pass |
| Required Explore/Notice responses block continuation/save while empty | Pass | Pass |
| Saved Notice resumes after context restart; Back restores Explore without losing Notice | Pass | Pass |
| Baseline and Week 3 save failures retain answers and have working retry actions | Pass | Pass |
| Failed prerequisite reads stay locked; restored routes cannot bypass stale access | Pass | Pass |
| Week 3 failed access recheck retains unsaved writing until successful retry | Pass | Pass |
| Separate account gets blank baseline and locked Week 3; original account restores Notice | Pass, simulated session reset | Pass, simulated session reset |
| User can sign out through the current dashboard | **Fail: no control** | **Fail: no control** |
| Dashboard hero remains clear of the fixed tab bar | **Fail: partially obscured** | **Fail: partially obscured** |
| Approved live copy, shared backend storage, cross-device return and RLS | Not verified | Not verified |
| Native app restart, keyboard, VoiceOver/TalkBack and device screenshots | Not applicable | **Not run** |

Nine focused browser tests completed successfully: two new full journeys and
seven baseline, sequential-route and Week 3 recovery checks. The new journeys
explicitly record remaining defects in their result files; a passing automation
run does not turn those defects into acceptance passes. All 115 React Native
component tests also pass, as does the exported-bundle client security scan.
The full journeys made zero backend writes and zero provider calls.

## Remaining defects and unverified items

1. **Missing Sign out action.** Reproduction: sign in, finish loading the
   dashboard, inspect its actions. No Sign out button is present. The existing
   `sign-out-button.tsx` is not rendered by the current screens. This prevents
   the normal UI sign-out/sign-in acceptance path. Evidence: screenshot 09 in
   both layouts. To continue isolation checks, the test reopened a context with
   only baseline/Week 3 fixture entries retained and authenticated the second
   account; this is explicitly a synthetic session reset, not a sign-out pass.
2. **Dashboard heading hidden beneath the fixed tab bar.** Reproduction: open
   the dashboard at its initial scroll position after sign-in or week selection.
   The upper part of “A moment for yourself.” sits under the floating Home/Explore
   bar at both widths. Evidence: screenshots 01, 05, 06 and 09. Week selectors,
   prerequisite messages and activity controls remain usable in these runs.
3. **Production content/service gaps remain.** Baseline and Week 3 still use
   labeled local fixtures, approved question copy is unavailable, and Week 3
   completion rules are not connected. The Notice screen accurately says saving
   does not complete the week. No live backend, cross-device persistence,
   live account creation or production prerequisite-policy approval is claimed.
4. **Native and final-candidate checks remain.** No connected Android/iOS device,
   Android SDK/emulator or in-app browser was available. The project Playwright
   runner provided the web screenshots. Repeat the checklist on the actual
   frozen candidate and native devices when available; this early run does not
   certify a later November 10 build.

## Screenshot index

All 20 PNGs are unedited captures of the running app. They contain synthetic
student text only. Mobile captures are explicitly **mobile web**, not native.
Some long forms extend below the captured viewport; the field-count and value
assertions cover all five fields, not just the visible portion of an image.
The unlocked-card images include “Synthetic” and “Test curriculum fixture”
directly in the displayed test curriculum; no live provider output is depicted.

| Current state | Desktop web | Mobile web |
| --- | --- | --- |
| Fresh locked Week 3 route | [01](final-student-path/desktop-web-01-fresh-locked-route.png) | [01](final-student-path/mobile-web-01-fresh-locked-route.png) |
| Empty baseline and example/device-only source notice | [02](final-student-path/desktop-web-02-fresh-baseline-source.png) | [02](final-student-path/mobile-web-02-fresh-baseline-source.png) |
| Over-limit fifth answer retained and validation text | [03](final-student-path/desktop-web-03-baseline-validation.png) | [03](final-student-path/mobile-web-03-baseline-validation.png) |
| Returning original baseline, read-only/source notice | [04](final-student-path/desktop-web-04-returning-original-baseline.png) | [04](final-student-path/mobile-web-04-returning-original-baseline.png) |
| Week 2 available after synthetic Week 1 completion | [05](final-student-path/desktop-web-05-week-two-unlocked-card.png) | [05](final-student-path/mobile-web-05-week-two-unlocked-card.png) |
| Week 3 available after synthetic Week 2 completion | [06](final-student-path/desktop-web-06-week-three-unlocked-card.png) | [06](final-student-path/mobile-web-06-week-three-unlocked-card.png) |
| Explore source notice and exact recorded synthetic log | [07](final-student-path/desktop-web-07-explore-source-and-log.png) | [07](final-student-path/mobile-web-07-explore-source-and-log.png) |
| Returning Notice with restored answer | [08](final-student-path/desktop-web-08-returning-notice-answer.png) | [08](final-student-path/mobile-web-08-returning-notice-answer.png) |
| Loaded dashboard without Sign out; heading overlap | [09](final-student-path/desktop-web-09-dashboard-missing-sign-out.png) | [09](final-student-path/mobile-web-09-dashboard-missing-sign-out.png) |
| Separate account's empty baseline after synthetic session reset | [10](final-student-path/desktop-web-10-other-account-empty-baseline.png) | [10](final-student-path/mobile-web-10-other-account-empty-baseline.png) |

Machine-readable results: [desktop](final-student-path/desktop-web-result.json),
[mobile web](final-student-path/mobile-web-result.json).

## Reproduction commands

Run from `mobile` after exporting the candidate:

```powershell
npm.cmd test
npx.cmd playwright test tests/e2e/final-student-path.spec.cjs tests/e2e/guiding-questions-capture.spec.cjs tests/e2e/sequential-navigation.spec.cjs tests/e2e/week-three-explore-notice.spec.cjs
node scripts/check-client-security.cjs --bundle dist
```

This OneDrive checkout needs the temporary ignored cloud-directory preload
described in [the acceptance repair notes](navigation-form-acceptance.md) to
export with Metro. No application or dependency configuration was changed here.
