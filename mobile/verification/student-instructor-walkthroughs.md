# Student and instructor UI walkthroughs

Run date: October 19, 2026.

Executed the freshly exported web app in Microsoft Edge using Playwright and
synthetic test accounts (`account-a@example.test` and `account-b@example.test`).
Authentication, progress storage, and AI responses were simulated at the HTTP
boundary; these are actual browser results, not live Supabase/provider results.

| Walkthrough | Actual result | Evidence |
| --- | --- | --- |
| Week 1: Arrive, Practice, Explore, Notice the gap, completion | PASS: completed normally with writing, three intentions, and reflection answers retained. | `tests/e2e/returning-user.spec.cjs` |
| Week 1: restart after writing and generation | PASS: restored the correct step and saved answers; completion survived another reload. | `tests/e2e/returning-user.spec.cjs` |
| Week 2: all four beats and completion | PASS: revised body location, three sensations, generated results, ethics answer, and closing reflection restored after reload. | `tests/e2e/week-two-arrive.spec.cjs` |
| Week 2: failed saves and AI timeout | PASS: answers remained intact; retry recovered; failed completion stayed in progress until a successful retry. | `tests/e2e/week-two-arrive.spec.cjs` |
| Practice interruptions and media recovery | PASS: Week 1 audio retry and paused-position restore; Week 2 text-alternative restore; unavailable media without an alternative could not advance. | `tests/e2e/practice-media.spec.cjs` |
| Instructor preview and navigation | PASS: course content, roster, and 13/24 completed activity total rendered; Home and Instructor preview links worked. No journal controls, editable fields, private writing, or progress requests appeared. | `tests/e2e/instructor-preview.spec.cjs` |
| Signed-out access and account switching | PASS: protected routes required sign-in; switching accounts cleared writing, intentions, and gap reflections, including across tabs. | `tests/e2e/auth-security.spec.cjs` |

Commands and outcomes:

- `npm.cmd run export -- --platform web`: PASS, including client/bundle security checks.
- `npx.cmd playwright test`: PASS, 11/11 browser tests (23.3 seconds).
- `npm.cmd test`: PASS, 51/51 component tests.

Critical navigation defects found in this run: none. No navigation code changes
were needed.

Live instructor verification remains blocked by the existing preview-only
implementation: it has synthetic roster/status data and no connected instructor
role or live progress service. This run does not establish live instructor role
authorization, database isolation, or live roster totals. Native device behavior
and production media were not exercised by these browser walkthroughs.
