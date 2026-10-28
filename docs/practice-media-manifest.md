# Practice Media Manifest and Reusable Player Audit

**Audit date:** 2026-10-28
**Scope:** Received sponsor audio, curriculum mapping, transcripts, and existing Practice playback support.

## 1. Received media inventory

Durations were measured from the received MP3 files. Filenames and durations do not establish sponsor approval or the correct curriculum assignment.

| Received file | Format | Duration | Proposed week/exercise | Status |
|---|---|---:|---|---|
| `00cfbbd8-9565-4134-a7ca-cc0143625a91(1).mp3` | MP3, 128 kbps, 44.1 kHz | 13:08 | Unknown; needs sponsor confirmation | Received; mapping unverified |
| `Week 2 Practice(1).mp3` | MP3, 128 kbps, 44.1 kHz | 15:19 | Week 2 suggested by filename; exercise unverified | Received; mapping unverified |
| `Week 3 Practice.mp3` | MP3, 128 kbps, 44.1 kHz | 12:49 | Week 3 suggested by filename; exercise unverified | Received; mapping unverified |
| `Week 4-Mindful Walking.mp3` | MP3, 128 kbps, 44.1 kHz | 9:54 | Week 4 mindful walking suggested by filename | Received; mapping unverified |

### Asset readiness

- **Received:** Four audio files were supplied outside the repository.
- **Format checked:** All four are readable MP3 files with measured durations.
- **Bundled in the app:** Not found in the inspected `assets`, `src`, or `lib` directories.
- **Playback integration:** Not confirmed. The app needs an approved accessible media source and a curriculum entry that references it.
- **Transcript:** No transcript was supplied or verified for any of the four recordings.
- **Attribution and license:** Not supplied or verified.
- **Text alternative:** Not supplied or verified for these recordings.
- **Approved week/exercise mapping:** Still needs confirmation from the sponsor or authoritative curriculum materials.

The first filename does not identify a week. Do not assign it to Week 1 based on filename order or duration alone.

## 2. Existing Practice implementation

### Media playback

- `src/components/practice-media.tsx` uses `expo-audio` for audio and `expo-video` for video on native platforms.
- `src/components/practice-media.web.tsx` provides browser audio/video playback.
- `src/components/practice-media.types.ts` defines loading, ready, playing, paused, completed, and error media statuses.
- The media components already provide play/pause and restart controls.
- Native playback reports position/status changes and pauses when the app becomes inactive.
- The web player pauses when the app becomes inactive or the document is hidden.

### Practice integration

- `src/components/practice-beat.tsx` connects media playback to the Practice flow.
- It saves media position and practice progress, supports retrying playback, and handles playback errors.
- It can display inline transcript text or open a transcript URL.
- It reports when no transcript was supplied and can present configured alternative instructions.
- A media reference without a resolved asset cannot currently be played directly by the media component.
- Existing legacy breathing behavior remains available through `BreathingPlayer`.

### Curriculum metadata

- `lib/curriculum-media.ts` defines optional audio/video metadata, source, duration in seconds, transcript, attribution, and alternative instructions.
- Sources may be HTTPS URLs or opaque references.
- Metadata validation checks structure and URL syntax; it does not verify the media content, permissions, license, or source authenticity.
- A duration in media metadata describes the recording, not the practice completion timer.
- The inspected Week 1 practice definitions include 4-2-6 Breathing and Mindful Walking. They do not confirm which received sponsor recording belongs to either practice.
- The inspected Week 1/2 module overview does not itself establish sponsor audio mappings.

## 3. Gaps and required follow-up

1. Obtain sponsor confirmation of the correct week and exercise for every recording.
2. Obtain approved, student-accessible media URLs or establish an approved asset-reference resolution path.
3. Confirm transcript availability and obtain the approved transcript for each recording where available.
4. Confirm attribution and licensing requirements.
5. Obtain appropriate alternative instructions where required.
6. Integrate approved media metadata into the authoritative curriculum configuration/loading path. Do not invent a database column or assume that a structurally valid fixture is published content.
7. Test each approved media source on native and web platforms, including playback, restart, saved position, interruption, error recovery, and transcript access.

## 4. Changes intentionally not made

- No existing player controls were recreated.
- No unverified media URL, transcript, attribution, license, or curriculum mapping was invented.
- No audio files were moved into the app bundle.
- No database schema, storage permissions, upload flow, or student write permissions were changed.
- No reusable-player refactor or unrelated local changes were overwritten.

## 5. Completion assessment

The received-file inventory and existing player behavior have been documented. The media audit remains partially blocked on sponsor confirmation, approved media sources, transcript/attribution details, and verified curriculum mappings. The recordings should be treated as received but not yet confirmed as integrated and usable in the student app.
