# MIN-203: curriculum media metadata

This branch starts at PR #42 head `ad732d7` and extends its weekly content
model. It contains no MIN-110 persistence files. It changes no player, screen,
database, storage bucket, client credentials, or student write permissions.

## Contract

Each `ModuleBeat` may have an optional `media: CurriculumMedia`. Existing beats
and Week 1/2 records without it are still valid; metadata is not required on
every beat. Canonical order remains Arrive → Practice → Explore → Notice.

```ts
type MediaSource =
  | { kind: "url"; url: string }
  | { kind: "reference"; id: string };
type MediaTranscript =
  | { kind: "inline"; text: string }
  | { kind: "reference"; source: MediaSource };
type CurriculumMedia = {
  type: "audio" | "video";
  source: MediaSource;
  durationSeconds?: number;
  transcript?: MediaTranscript;
  attribution?: string;
  alternativeInstructions?: string;
};
```

The implementation exports readonly types and guards from
`mobile/lib/curriculum-media.ts`. Metadata type and source are required when a
media object is present. Null, arrays, empty objects, unknown types, unknown
fields, and malformed supplied optional values fail validation. Optional values
may be omitted/undefined; supplied text must be nonblank. A supplied duration
must be finite and greater than zero, with fractional seconds allowed. Unknown
duration is omitted rather than represented by zero or a guessed estimate.

A URL source must be an absolute HTTPS URL without embedded username/password.
An opaque reference requires a nonblank ID and is not interpreted as a URL, file
path, storage bucket, or player input. References are resolved only by a future
approved read path; this ticket introduces no resolver or fetching behavior.
Transcript text and references are alternatives, not two competing fields.
Attribution is a plain credit string, and alternative instructions are plain
text for a future consumer to present when media is unavailable or unsuitable.
No transcript, credit, fallback wording, or duration is fabricated when missing.

## Loading Week 1/2 configurations

`isWeekContent` validates optional media on all four beat positions.
`parseWeekContent(decodedConfig)` accepts decoded JSON/objects, returns the
validated `WeekContent` including media, or throws the fixed error
`The curriculum configuration is invalid.` It never echoes configuration
contents in errors, fetches a source, or writes configuration. It provides a
readonly typed view, not a runtime deep freeze or a publication/authorization
decision.

The original Week 1 content and Week 2 sample remain unchanged. Additional typed
variants in `mobile/__tests__/fixtures/four-beat-weeks.ts` demonstrate Week 1
audio and Week 2 video loaded through that same model parser. They use a
reserved `example.invalid` URL and opaque fixture references. Transcript,
credit, and text alternatives there are **synthetic test fixtures**, never
sponsor wording or app content. The Week 2 missing-sponsor-content marker
remains intact. Structural validity does not make either fixture
approved/publishable curriculum.

The existing Supabase `getPublishedWeek` loader has week/activity rows and no
beat-media column. This ticket does not invent such a column, change its
queries, or seed metadata. Future approved configurations can use the parser
boundary; persisting or publishing them requires a separate source-backed
integration.

## Teammate overlap and units

Inspected open PRs #45–#47 and repository media references before
implementation:

- #45 defines player state/config/session callbacks with guided `audioUrl` and
  runtime `durationMs`.
- #46 builds reusable player controls/hooks; #47 integrates Week 1 practices and
  navigation, also using `durationMs`.
- The current curriculum activity model/database already uses `duration_minutes`
  for an activity estimate. Practice-player fixtures also contain audio/video
  session examples but are not curriculum source/transcript metadata.

None supplies the complete curriculum metadata contract requested by MIN-203.
This change imports no unmerged teammate code, edits none of their player/UI
files, and duplicates none of their timer, state, or callback definitions.
`durationSeconds` describes the media file; it never changes an activity
estimate, a completion timer, or persisted practice session. A later adapter may
convert units after an approved integration; no adapter is introduced here.

## Security and content gaps

This is a read-only configuration contract. It exposes no upload, delete,
administrative client, storage-management API, signed-write URL generation, or
permissions changes. Unknown fields such as upload URLs/authorization headers
are rejected by the media guard. The helper imports no Supabase client and makes
no network calls. Existing student curriculum reads and RLS remain unchanged.

URL validation checks syntax and transport only, not content authenticity,
authorization, license, host approval, or HTTP-method permissions. HTTPS alone
does not make an arbitrary URL trustworthy. Do not embed service keys, upload
capabilities, authorization headers, or sensitive query tokens in student-facing
metadata. Private access, host approval, reference resolution, and
access-boundary finalization remain separate work (including MIN-206); no claim
of solving those boundaries is made here. Text is metadata, not executable HTML.

No sponsor media URL, verified duration, transcript, credit/license, or
alternative instructions were supplied. Those gaps must be resolved from
approved sources; MIN-116 sponsor seeding remains excluded. Player UI/playback,
uploads, instructor screens, storage buckets, MIN-110, and unrelated frontend
fixes remain excluded.

## Verification

From the repository root, with installed mobile dependencies:

```sh
npm --prefix mobile test -- --watch=false --runTestsByPath __tests__/curriculum-media.test.js __tests__/four-beat-curriculum.test.js __tests__/four-beat-module-shell.test.js
node --test mobile/tests/*.test.cjs
npm --prefix mobile run check:client-security
git diff --check
```

Focused tests load original and media-bearing Week 1/2 samples through the same
parser, retain canonical order, verify audio/video, omitted and provided
optional fields, inline/reference transcripts, alternatives, malformed metadata,
and invalid transport/credential-shaped sources. Type checking includes all new
types and typed sample records. No test downloads, plays, or uploads media.
