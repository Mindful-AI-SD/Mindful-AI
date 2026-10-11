# AI activity provider contracts

Maps each of the eight weekly Explore labs to the request it sends, the output
it must get back, and what happens when the model cannot give a valid answer.
Everything marked **proposed** is a starting point for review, not a decision.
Weeks 1, 2, and 3 are built; the other seven contracts are designs.

Sources: _AIM-YA App Content Spec (v5.0 draft)_, _AIM-YA Four Beats Weekly Map_,
and `supabase/tests/fixtures/aiPolicyCurriculumTestMatrix.md` (rows A1–A8,
X1–X8). The curriculum is still draft v5.0, so these shapes can change with it.

## Summary

Eight labs need **ten** model contracts, because Weeks 5 and 6 each contain two
separate AI interactions. Three of the ten are built, all against the mock
provider only, and all are served by one general endpoint.

| Week | Contract `kind`              | Student supplies                 | Model returns                                 | Status                             |
| ---- | ---------------------------- | -------------------------------- | --------------------------------------------- | ---------------------------------- |
| 1    | `intention_mirror`           | One reflection                   | Exactly 3 intentions                          | Built (mock only)                  |
| 2    | `sensation_lexicon`          | 3 sensations                     | Optional word choices per sensation           | Built (mock only); no screen       |
| 3    | `distraction_audit`          | A log of time-stamped taps       | A category per event; server does the math    | Built (mock only); no screen       |
| 4    | `trigger_sensation_reaction` | One stressful tech event         | 3 parts (each found or unknown) + 3 questions | Not built                          |
| 5a   | `decentering_shift`          | 3 beliefs                        | 3 reframes                                    | Not built                          |
| 5b   | `hallucination_check`        | One factual question             | An answer split into checkable claims         | Not built; may hand off to Copilot |
| 6a   | `compassionate_voice`        | A letter to self                 | One rewritten letter                          | Not built                          |
| 6b   | `bias_test`                  | A choice of server-held prompt   | 2 outputs, same prompt, name changed          | Blocked: sample prompts not given  |
| 7    | `contextual_designer`        | A schedule                       | Up to 3 gaps + up to 3 habitual-use moments   | Not built                          |
| 8    | `meta_reflection`            | Nothing (server reads 7 entries) | Up to 5 themes, growth, avoidance, with cites | Blocked: Weeks 2–7 are not stored  |

## How routing works today

One authenticated endpoint, `POST /functions/v1/ai-activity`, serves every
contract that is built. The request names its `kind`; routing in
`providerSelector.ts` maps the kind to its implementation for the selected
provider, with the mock as the default. Weeks 1, 2, and 3 are routed; each
further lab is a new kind added to `types.ts`, both adapters, the routing table,
and `supabase/schema/aiActivitySchema.ts`.

The older Week 1 pieces still exist beside it and still carry their limits:

- `GuidedReflectionProvider`, `guided-reflection`, and `mindfulness-response`
  only know the three-intentions shape.
- **`provider` is the literal `"mock"`** in `guidedReflectionResponseSchema`,
  the `finish_intention_submission` SQL, and `isResponse` in
  `mobile/lib/intention.ts`. The general contract accepts any provider name, but
  those three still fail a real provider.
- Only `mindfulness-response` saves anything. The general endpoint is stateless.

## Shared envelope

Request, as built:

```ts
{
  kind: string; // which contract, e.g. "sensation_lexicon"
  activityId: string; // UUID of a published activity
  activityContext: string;
  input: /* per contract, below */ ;
}
```

- The user comes from the session, never from the body.
- Unknown properties are rejected (strict schemas), including a client-supplied
  provider, user ID, or result.
- `kind` comes from the client, because the `activities` table has no column
  that says which lab an activity is. Each kind validates its own input, so a
  wrong kind is rejected rather than misrouted. **Proposed:** store the kind on
  the activity so the server derives it from `activityId`.
- `activityContext` is client-supplied. **Proposed:** the server looks it up
  from `activityId`, so a client cannot inject instructions through it.
- No `submissionId` yet, so a retry generates again. **Proposed:** add it when
  results are saved.

Response, as built:

```ts
| { kind; provider: string; result /* per contract */ }
| { outcome: "support"; message: string; resources: Resource[] } // fixed text, no model call
```

**Proposed, not built:** an explicit
`{ kind; provider; outcome: "insufficient_input"; reason }` answer for labs that
can have too little to analyze (Weeks 3, 4, 7, 8). It is a real, valid answer
("there is not enough here to analyze"), not a way to hide a model failure.
Neither built contract needs it.

## Safe fallback behavior (all contracts)

Applied in this order. The first rule that matches ends the request.

| # | Condition                                                             | Behavior                                                                                                 | Provider called |
| - | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| 1 | Bad JSON, wrong types, unknown field, empty / too short / over limit  | 400 with the standard error body                                                                         | No              |
| 2 | Missing or unpublished activity                                       | 404                                                                                                      | No              |
| 3 | Crisis language in any free-text input                                | `outcome: "support"`: fixed, non-generated message with 988 and UCF CAPS. Normal flow does not continue. | No              |
| 4 | Input is valid but too thin to analyze (empty log, no schedule, etc.) | `outcome: "insufficient_input"`                                                                          | No              |
| 5 | Provider not configured / error / timeout                             | 501 / 502 / timeout error. Nothing saved.                                                                | Yes             |
| 6 | Model output fails the contract's schema or grounding checks          | 502. Nothing saved, nothing shown.                                                                       | Yes             |

Rules that hold for every contract:

- **No canned stand-in.** On rules 5 and 6 the app shows an error with a retry.
  It never shows prewritten content presented as the AI's answer.
- **Student text is never lost.** Whatever the student typed stays saved and
  editable after any failure.
- **Retry reuses `submissionId`.** A completed submission returns the saved
  result; it is never regenerated.
- **Nothing private in logs.** Log IDs, the `kind`, and error codes only.
- **Prompt injection (X1) changes nothing.** Student text is data. It cannot
  change the output shape, so an injected instruction either yields a valid
  result or fails rule 6.

Rule 3 is built in `../crisisSupport.ts` and used by all three existing
endpoints. It runs first in practice, ahead of rule 1, so a student in crisis
gets the support response even when the text would fail validation. Its wording
is a placeholder awaiting sponsor approval, and its detection is a phrase list.
Rule 6 exists for the Week 1, 2, and 3 shapes only.

## Contracts

Length limits below are **proposed** unless they cite an existing source.

### 1. `intention_mirror` (Week 1, matrix A1) — built

```ts
input: {
  reflection: string;
} // 3–2000 chars at the endpoint; the UI asks for 150 words
result: {
  intentions: [Intention, Intention, Intention];
}
type Intention = { title: string; explanation: string };
```

- Output checks: exactly 3, distinct, no extra fields. The prompt fixture caps
  titles at 60 chars and explanations at 160 chars / 24 words; the schema
  currently allows 120 / 1000. The tighter limits are the policy.
- Sparse reflection: still 3 intentions, kept general. Not `insufficient_input`.
- Fallback: the student can retry. Whether they may continue to the gap
  reflection without intentions is a curriculum question (see Open questions);
  today the flow blocks.

### 2. `sensation_lexicon` (Week 2, A2) — built against the mock, no screen yet

```ts
input: {
  sensations: [string, string, string];
} // each 2–80 chars
result: {
  items: [Item, Item, Item];
}
type Item = {
  original: string; // must equal the student's text exactly, same order
  isVague: boolean;
  suggestions: string[]; // 1–5 words when isVague is true; empty when it is false
};
```

- In code: types in `types.ts`, mock `generateMockSensationLexicon`, stub
  `generateFutureSensationLexicon`, selector `getSensationLexiconProvider`, and
  schemas in `supabase/schema/sensationLexiconSchema.ts`. The built shape is
  `{ items, provider }`; the shared envelope above is still only proposed.
- Endpoint: the general `POST /functions/v1/ai-activity` with
  `kind: "sensation_lexicon"`. App service: `getSensationWords` in
  `mobile/lib/sensation-lexicon.ts`. Nothing is stored yet, and there is no
  `submissionId`, so a retry generates again.
- Output checks: `original` values match the input verbatim; no suggestion
  repeats the original; no clinical or diagnostic terms; no explanation field
  exists, so the model cannot state a cause or a "correct" label.
- No vague terms: valid `ok` result with every `suggestions` empty.
- The re-description step is the student's own writing and is not a model call.
- Fallback: on error the student can still re-describe in their own words.

### 3. `distraction_audit` (Week 3, A3) — built against the mock, no screen or log storage yet

```ts
input: {
  events: Event[]; // 0–300, unique ids
}
type Event = {
  id: string; // 1–64 chars
  at: string; // ISO 8601 timestamp with a time zone
  label: string; // 1–40 chars: what the student tapped or typed
};
result: {
  totalEvents: number; // the denominator: every logged event
  categories: { category: Category; count: number; percent: number }[];
  uncategorized: { count: number; percent: number };
  assignments: { eventId: string; category: Category | null }[];
}
type Category =
  | "social_media"
  | "messaging"
  | "entertainment"
  | "news_and_browsing"
  | "work_and_school"
  | "thoughts";
```

- **The provider never does arithmetic.** It returns only `assignments`: one
  category per event, or `null` when none fits. `summarizeDistractionAudit` in
  `distractionAudit.ts` computes everything else, so a real model cannot produce
  numbers that disagree with the log.
- **Rules for the numbers:**
  - The denominator is every logged event, including uncategorized ones.
  - Category counts plus the uncategorized count equal `totalEvents`.
  - Percentages are whole numbers that total exactly 100. Each share is rounded
    down, and the leftover points go to the shares that lost the most, earliest
    entry first on a tie.
  - Categories are ordered by count, highest first. Ties keep the order of the
    category list above. Categories with no events are left out.
- Output checks: the endpoint recomputes the audit from the request's events and
  the result's own assignments and rejects any difference. An invented, dropped,
  reordered, or mislabeled event is a 502.
- Empty log: answered without calling a provider, with `totalEvents: 0`, no
  categories, and all percentages 0. This is what Week 3 uses in place of the
  proposed `insufficient_input` answer.
- Labels and timestamps are never copied into the result.
- The six categories are a **placeholder** list, and the mock assigns them by
  keyword. Both need the sponsor's input (see Open questions).
- Fallback: on error, the app can still show the raw taps it already has.
- In code: types and `DISTRACTION_CATEGORIES` in `types.ts`, mock
  `generateMockDistractionAudit`, stub `generateFutureDistractionAudit`, schema
  in `supabase/schema/distractionAuditSchema.ts`, served by `ai-activity` with
  `kind: "distraction_audit"`. The mobile client does not know this kind yet.

**Worked example** (also the test fixture
`supabase/tests/fixtures/distractionAuditExample.ts`). A three-day log of eight
taps:

| id | at                        | label         | mock assigns  |
| -- | ------------------------- | ------------- | ------------- |
| e1 | 2026-10-12T09:15:00-04:00 | Instagram     | social_media  |
| e2 | 2026-10-12T13:40:00-04:00 | group chat    | messaging     |
| e3 | 2026-10-12T21:05:00-04:00 | TikTok        | social_media  |
| e4 | 2026-10-13T10:30:00-04:00 | YouTube       | entertainment |
| e5 | 2026-10-13T16:20:00-04:00 | text from mom | messaging     |
| e6 | 2026-10-13T22:45:00-04:00 | zoned out     | none          |
| e7 | 2026-10-14T08:50:00-04:00 | Instagram     | social_media  |
| e8 | 2026-10-14T15:10:00-04:00 | email         | messaging     |

The result:

| Share         | Count | Exact share | Rounded down | Final percent |
| ------------- | ----- | ----------- | ------------ | ------------- |
| social_media  | 3     | 37.5        | 37           | 38            |
| messaging     | 3     | 37.5        | 37           | 38            |
| entertainment | 1     | 12.5        | 12           | 12            |
| uncategorized | 1     | 12.5        | 12           | 12            |
| **Total**     | 8     | 100         | 98           | 100           |

Rounding down leaves 2 points. All four shares lost the same half point, so the
two points go to the first two entries. `social_media` is listed before
`messaging` because it comes first in the category list.

### 4. `trigger_sensation_reaction` (Week 4, A4)

```ts
input: {
  event: string;
} // 20–2000 chars
result: {
  trigger: Part;
  sensation: Part;
  reaction: Part;
  inquiryQuestions: [string, string, string];
}
type Part = { status: "found"; quote: string } | { status: "unknown" };
```

- Output checks: each `quote` is text taken from the student's input, so a part
  cannot be invented; exactly 3 questions, each a question, none a diagnosis or
  advice.
- Missing parts are `unknown`. All three unknown is still a valid result.
- Stress disclosure is expected here. The UCF CAPS link is static UI on the
  screen and must show in every state, including errors. It is not part of the
  model response.

### 5a. `decentering_shift` (Week 5, A5)

```ts
input: {
  beliefs: [string, string, string];
} // each 3–300 chars
result: {
  reframes: [Reframe, Reframe, Reframe];
}
type Reframe = { original: string; reframe: string };
```

- Output checks: `original` matches the input verbatim and in order; `reframe`
  starts with "I notice I'm having the thought that"; it restates the belief and
  does not argue the opposite.
- Highest crisis-language risk of the ten ("heavy beliefs"). Rule 3 must be in
  place before this ships.

### 5b. `hallucination_check` (Week 5, A5)

```ts
input: {
  question: string;
} // 10–300 chars
result: {
  answer: string;
  claims: {
    id: string;
    text: string;
  }
  []; // 1–5 statements the student can check
}
```

- The result has no source, citation, or confidence field, so the model has
  nowhere to put a fabricated reference.
- The student picks one claim and records their own check (`supported` /
  `contradicted` / `could not verify`). That is student data, not a model call.
- This is the only open-domain contract: the student can ask anything. It needs
  its own policy for off-topic and harmful questions, and the spec has not
  decided whether it runs in-app or hands off to Copilot.

### 6a. `compassionate_voice` (Week 6, A6)

```ts
input: {
  letter: string;
} // 20–2000 chars
result: {
  rewrite: string;
} // at most 2000 chars
```

- Output checks are mostly policy, not shape: no flattery, no new facts about
  the student, no pressure to forgive or feel better. These need prompt tests
  like the Week 1 fixture, since a schema cannot catch them.
- Personal-struggle disclosure is expected. Same CAPS link rule as Week 4.
- The original letter is never replaced; the rewrite is shown beside it.

### 6b. `bias_test` (Week 6, A6)

```ts
input: {
  promptPairId: string;
} // picks a server-held prompt pair
result: {
  runs: [Run, Run];
}
type Run = { name: string; output: string };
```

- The client never sends prompt text or names. Both come from a versioned server
  fixture, so no one can run extra demographic probes.
- Two provider calls with the same prompt, only the name changed.
- No verdict field. The student compares the two outputs; the app never claims
  the model is or is not biased from one test.
- Fallback: if either run fails, the whole request fails. A single output is
  never shown alone.
- **Blocked:** the sample prompts and names have not been provided.

### 7. `contextual_designer` (Week 7, A7)

```ts
input:  { schedule: Entry[] }                // 1–40 entries
type Entry = { start: string; end: string; label: string } // HH:MM, label 1–80 chars
result: {
  checkInGaps: { start: string; end: string }[];              // 0–3
  habitualUseMoments: { entryIndex: number; note: string }[]; // 0–3
}
```

- Output checks: gaps fall between entries and do not overlap any; every
  `entryIndex` exists in the input. "Up to three" is a ceiling, never a quota.
- Fewer than 3 found: return what is supported. None found: empty arrays are
  valid. Too little schedule to analyze: `insufficient_input`.
- No field can create a reminder. Check-in nudges are a separate, explicit
  opt-in outside this contract.
- Schedule text is personal data. Whether it is stored at all is undecided.

### 8. `meta_reflection` (Week 8, A8)

```ts
input:  {}                                   // server compiles the 7 stored reflections
result: {
  coverage: { weeksIncluded: number[]; weeksMissing: number[] }; // computed by the server
  themes: Finding[];                         // 0–5
  growth: Finding[];                         // 0–3
  avoidance: Finding[];                      // 0–3
}
type Finding = {
  text: string;
  basis: "observation" | "interpretation";
  evidence: { week: number; quote: string }[]; // at least 1
}
```

- The client sends no reflection text, so it cannot substitute someone else's.
- Output checks: every evidence `week` is in `weeksIncluded`; every `quote` is
  text from that week's stored reflection. A theme with no evidence is invalid.
- Missing or sparse weeks: `coverage` discloses them and fewer than 5 themes is
  valid. Too few reflections to compare: `insufficient_input`.
- The side-by-side Guiding Questions view is a plain data read, not a model
  call.
- **Blocked:** only Week 1 answers are stored today (in
  `progress.reflection_answers`). The `reflections` table exists but nothing
  reads or writes it.

## Open questions

Product and curriculum (sponsor):

1. When a lab's AI step fails, can the student continue to "Notice the gap"
   without it, or does the session stop until a retry works?
2. Week 3: do quick-taps record a preset category or free text? Preset means no
   model is needed.
3. Week 5b: in-app, or hand off to Copilot? If in-app, which questions are out
   of bounds?
4. Week 6b: the sample prompt pairs and names.
5. Week 7: does the student type a schedule, pick from a form, or import one? Is
   the schedule stored after the lab?
6. Week 8: how many missing weeks is too many to run the Meta-Reflection?
7. Crisis response wording and the resource list (already required before any of
   this ships).
8. IRB data handling for letters, schedules, and reflections sent to a model:
   where processed, what is kept, who can see it.

Engineering (team):

1. Timeout status differs between the two existing endpoints (504 in
   `guided-reflection`, 408 in `mindfulness-response`). Pick one before adding
   contracts.
2. One endpoint for all kinds, or one per lab?
3. Where each lab's saved result lives (`progress.generated_intentions` only
   fits Week 1).
4. Where weekly reflections are stored so Week 8 can compile them.
