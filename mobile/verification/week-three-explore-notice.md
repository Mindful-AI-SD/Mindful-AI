# Week 3 Explore and Notice frontend

Verified November 2, 2026, with the local sequential-navigation changes.

The guarded Week 3 dashboard/resume entry now opens the reusable four-beat
overview, then Explore or the saved Notice step. Both screens show recorded
event labels and timestamps, use shared themed response fields, validate
required answers and character limits, save drafts, retain input after errors,
and save before backward navigation or returning to the curriculum.

## Fixture and content boundaries

The recorded event, paused Practice snapshot, progress revision and cached mock
report come from Lucas's MIN-214
`docs/sprint-3/examples/v1/week-three-progress.json` on
`origin/codex/min-214-baseline-week-three-contracts`. Screen service inputs use
the MIN-226 `loadWeekThreeProgress` / `saveWeekThreeDraft` shapes. No unmerged
migration, backend implementation, or logger/player code was imported.

Isa's approved Week 3 question text/required keys could not be located in the
checkout, remote branches, or accessible shared project documents. The two
response fields are explicitly synthetic UI fixtures, supplied through a
replaceable content definition, not invented approved curriculum. The user was
asked for the approved source; no answer was available during implementation.

Default persistence is AsyncStorage scoped to account and canonical activity.
The screens accept an injected service for the eventual backend connection.
This verifies same-device restart recovery, not live Supabase or cross-device
sync. No local fixture answer marks a week complete or unlocks another week.
Explore/Notice saves preserve events, event revision, Practice time/resume,
cached report, unrelated saved answers, status, and completion timestamp.
Completed input is read-only. Final completion remains unavailable pending the
approved policy; no AI endpoint is called and cached mock data is not called
live AI output.

## Executed verification

- Component suite: 111 tests pass, including recorded/empty logs, required
  fields, answer restoration, failed saves, exact retry operations, duplicate
  taps, account/activity isolation, read-only completion and invalid saved data.
- Four focused browser tests pass across sequential navigation and the Week 3
  screen path: restart at Notice, restored answers at both beats, backward
  navigation, failed save with preserved input, load failure/retry, retained tap
  data and Practice time, zero AI requests, and zero legacy completion writes.
- Web export and exported client-security scan pass.
- Full TypeScript checking still reports the previously identified SDK 58
  errors in settings, theme, tabs and accessibility refs. No new Week 3 file
  errors were reported. Physical-device testing was not performed.
