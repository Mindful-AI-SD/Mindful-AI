# Practice beat media integration

Week 1 and Week 2 now render `PracticeBeat` and keep their existing saved-step
and owner checks. The component uses the reusable `usePracticePlayer` controls
from `origin/frontend/week-one-practice-alternatives` and the shared curriculum
metadata types from `origin/codex/min-203-curriculum-media-metadata`.

## Configuration boundary

The current database has text descriptions, not a dedicated media column. A
published `weeks.description` can contain the shared `WeekContent` JSON contract;
the curriculum loader validates its week number and reads `beats[1].media` and
the Practice description. JSON configuration is not displayed as student text.
Plain descriptions remain compatible with the existing Week 1 breathing timer
and Week 2 unguided practice. No media URLs or sponsor assets are seeded.

Audio/video `durationSeconds` describes the file and never substitutes for a
completion timer. Timed, no-media configurations use `duration_minutes`. Inline
transcripts render in the beat; supplied HTTPS transcript links can be opened.
Unresolved media/transcript references remain visibly unavailable/pending.
Only an explicitly supplied `alternativeInstructions` enables text fallback;
the student must start and finish that alternative before continuing.

## Persistence and recovery

Practice snapshots are keyed by signed-in user, activity, and configuration
fingerprint. Timers restore paused, and media resumes from its saved position
after an explicit Play action. Playback/load failures leave the curriculum step
unchanged. Retry retains the position; backgrounding pauses playback. Successful
completion still goes through the existing Week 1/2 service, with a duplicate-tap
guard and retryable progress-save errors. Player state does not enter AI payloads.

## Verification

- `practice-beat.test.js`: loading timeout, playback error, retry position,
  transcript, unavailable media, explicit text alternative, interrupted restore,
  account separation, untouched sessions, timer boundary, and single completion.
- `module-practice.test.js`: correct Week 1/2 configuration, media duration
  semantics, invalid configuration, and cache isolation.
- `practice-media.spec.cjs`: Week 1 plays a team-generated one-second silent WAV
  after a failed request, restores paused playback, then reaches check-in;
  Week 2 video failure restores its supplied text alternative and reaches
  Explore; unresolved media without an alternative cannot advance.
- Existing Week 1/2 and instructor browser paths remain regression coverage.
- TypeScript and iOS, Android, and web JavaScript export pass. Native exports use
  `--no-bytecode` on this Windows environment. Export success is not a physical
  device playback test: native audio/video playback still needs device QA.

The browser tests use synthetic curriculum and team-owned generated audio.
No live sponsor media or production curriculum configuration was changed.

## Final recovery fixes - October 19, 2026

- Retrying media after restoring a session now uses the latest playback position,
  rather than the position saved when the screen first opened.
- A failed transcript link has its own readable error and retry through Open
  transcript. It no longer becomes a storage error that blocks completed Practice.
- Playback errors offer the supplied text alternative only when one exists;
  otherwise they direct the student to Retry media or Back to curriculum.
- Focused component regressions cover all three cases. TypeScript, web export,
  and the client/bundle security checks pass. Browser coverage exercises both
  weeks, configured media, interruptions, unavailable media, and completion.

Physical-device playback remains unverified; browser tests use simulated backend
data and generated test audio.
