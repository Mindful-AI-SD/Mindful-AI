# Week 1 screen audit

Christopher — October 8, 2026

## Reference and status

The revised four-beat Week 1 row is unavailable. The supplied September 23–
October 6 team schedule describes the older flow and explicitly includes
YellowDig. It does not name four beats. This audit therefore records the
current implementation, provisional reuse decisions, and the confirmed
requirement to exclude Yellowdig from the target flow. Assignment to specific
beats, final ordering, and revised prompts remain unconfirmed.

## Every current Week 1 step

The curriculum/activity list is the entry screen. It loads Week 1, shows
activity progress, and opens the saved activity. There is no separate Week 1
introduction screen in the connected flow; privacy acknowledgement appears
inside the writing screen.

The eight saved steps, in current order, are:

| Step | Current screen and behavior | Audit decision | Four-beat comparison |
| --- | --- | --- | --- |
| 1. `breathing` | Ten-minute breathing player with start, pause, resume, restart, exit, and continue. | Retain provisionally. | Beat placement and revised duration/instructions require the row. |
| 2. `post_breathing_check_in` | Required Yes/No phone-urge check-in and optional note. | Retain provisionally; confirm the question. | Keep with the practice if the revised row includes this check-in; a separate beat is unconfirmed. |
| 3. `writing` | Intention Mirror instructions, multiline editor, word count, autosave, privacy acknowledgement, and deliberate submit. | Retain provisionally; review prompt and length rule. | Current validation is 3–2,000 trimmed characters. The older schedule says 300 words; the revised requirement is unknown. |
| 4. `intention_mirror` | Three saved mock intentions, loading/error recovery, editing, and continue to data self-portrait. | Retain provisionally; change navigation after placement is confirmed. | Writing and results already share one component; whether they belong in one beat requires the row. |
| 5. `data_self_portrait` | Two saved answers: what data could show and what it would leave out. | Retain provisionally; evaluate move or merge. | Its position after intention results is an old-flow assumption; no revised position can be confirmed. |
| 6. `ai_gap_reflection` | Saved intentions above three questions about what AI got right, missed, and what the gap reveals. | Change the Yellowdig continue action; retain the form provisionally. | Compare these AI-specific questions with the revised reflection prompt before deciding whether to move, merge, or rewrite them. |
| 7. `yellowdig_draft` | Required local discussion draft shown after gap reflection. It does not post to Yellowdig. | Remove from the target flow. | Explicitly excluded by this assignment. It cannot remain a required screen, answer, or completion gate. |
| 8. `completed` | Completion confirmation and saved Yellowdig draft display. | Retain and change. | Show completion after the four revised beats pass their own requirements, with no Yellowdig prerequisite or draft display. |

Entry screen decision: retain curriculum/progress loading; change its Week 1
presentation to the four confirmed beats once the row is supplied. No move
between numbered beats is confirmed yet.

## Target flow: no Yellowdig dependency

The target is: curriculum entry → four revised Week 1 beats → completion.
The four beat names and their internal screens remain pending. Yellowdig is
excluded from both required and optional actions in this target flow.

The implementation work identified by this audit is:

1. Remove `yellowdig_draft` from the active step sequence in
   [progress.ts](../lib/progress.ts).
2. Remove its form, transitions, required draft input, and completion-page
   draft display from [week-one-flow.tsx](../src/components/week-one-flow.tsx).
3. Replace “Continue to Yellowdig draft” in
   [ai-gap-reflection-screen.tsx](../src/components/ai-gap-reflection-screen.tsx)
   with the next action defined by the revised row.
4. Update [week-one.ts](../lib/week-one.ts): completion validation,
   next-allowed-step restoration, required-answer rules, and the final-step
   completion branch currently depend on `yellowdig_draft`. Completion must
   require only the revised beats' answers and acknowledgements.
5. Handle existing records saved at `yellowdig_draft` according to the revised
   completion rules. Keep historical answers intact; users must not be sent
   back to a removed discussion screen or required to supply that old answer.
6. Update the progression/completion/gating tests and returning-user browser
   path. Verify that a user can finish and restore Week 1 with no
   `yellowdig_draft` answer present.

The current app has no live Yellowdig integration. Its dependency is the local
required draft and the progress/completion rules listed above. Removing the
screen alone would leave those rules blocking completion.

## Remaining information

Obtain the actual four-beat Week 1 row from the assignment's source document
or its owner. That row is needed to finalize retain/move/change/remove
decisions for the other screens and specify the exact new order and prompts.

This is an audit only. The application still runs the existing flow; the
Yellowdig-free flow above is the documented target, not an implemented change.
