# Provider comparison and configuration guide

**Live Claude calls have not been verified.** The Claude column below describes
what is built and tested against a fake server. There is no live output,
latency, or usage to report yet, for the reason given in
[claude-live-verification.md](claude-live-verification.md). Do not cite Claude
performance from this guide until that page has results.

## The three modes

|                                 | Claude                                                                    | Prewritten (non-AI)                                                 | Mock                        |
| ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| **What it is**                  | Live model, server side                                                   | Real learning content written in advance                            | Test double                 |
| **Meant for**                   | Students, once approved                                                   | Students, as the comparison path                                    | Developers and QA only      |
| **Calls a model**               | Yes                                                                       | Never                                                               | Never                       |
| **Personalized to the student** | Yes                                                                       | No                                                                  | No                          |
| **Source shown in the app**     | "AI-generated with Claude. These are possibilities, not facts about you." | "Prewritten activity" and "Source: Prewritten content, version 1.0" | "Test data, not AI output." |
| **Response `provider`**         | `claude`                                                                  | `prewritten`                                                        | `mock`                      |
| **Crisis check**                | Yes, before any call                                                      | Yes                                                                 | Yes                         |
| **Needs a key**                 | Yes                                                                       | No                                                                  | No                          |
| **Content owner**               | Prompts: LLM team                                                         | Isa, pending sponsor review                                         | Test fixtures               |

Mock output must never be shown to real students as if it were real. Its Week 1
titles carry a `[Demo: ...]` marker so that it is easy to spot.

## Choosing a mode

The mode is one server setting, and the app cannot change it:

```bash
npx supabase secrets set GUIDED_REFLECTION_PROVIDER=prewritten   # or claude, or mock
```

| Value            | Result                                                    |
| ---------------- | --------------------------------------------------------- |
| `claude`         | Live model. Unavailable (501) until a working key is set  |
| `prewritten`     | Fixed content, no model calls                             |
| `mock`, or unset | Test data. **Set a real mode before students use it**     |
| `future`         | Unimplemented stub; always unavailable (501)              |
| Anything else    | Unavailable (501). A typo cannot silently serve test data |

Redeploy or restart the function after changing it. Claude's other settings are
in [claude-provider-boundary.md](claude-provider-boundary.md).

**Modes never switch on their own.** If Claude fails, the student sees an error
or the unavailable message, never prewritten or mock content. Prewritten work is
saved in its own fields, so changing the mode does not overwrite anything a
student has written.

Requests name the mode the student was told about. If the mode changed while
they were writing, the server refuses the request with 409 and sends nothing, so
a student told "not sent to AI" cannot have their text sent to a model without
first seeing the new notice. Week 1 also requires a new acknowledgement. Week 2
has no acknowledgement step, so there the updated wording and error are the
safeguard.

## How each week differs

| Week  | Claude                                                                                           | Prewritten                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **1** | Three intentions from the student's writing, then questions about what they got right and missed | Ten fixed examples. The student chooses one, adapts it, or writes their own, then answers four fixed prompts |
| **2** | Suggested words for sensations it judges vague                                                   | Six fixed vocabulary groups. The student chooses words; nothing is judged                                    |
| **3** | Sorts each logged item into a category                                                           | The student picks each category; the app only counts                                                         |

**Week 3 in prewritten mode is only partly in the app.** The server returns its
content and the summary calculation is built, but the Week 3 screens still run
on fixtures until their storage (MIN-226) merges.

## Matched scenarios and evidence

Nine synthetic scenarios are in `supabase/scripts/scenarios.ts`, and each mode
runs the same set: `deno task verify:provider --all`.

Results below come from November 4, 2026, on a developer laptop against local
Supabase, with the real Edge runtime and real sign-in. There were three warm
runs per mode, after one discarded cold run.

| Measure                    | Claude           | Prewritten | Mock     |
| -------------------------- | ---------------- | ---------- | -------- |
| Scenarios passing          | **Not verified** | 27 of 27   | 27 of 27 |
| Median response, each week | **Not verified** | 8 to 9 ms  | 8 ms     |
| Slowest response           | **Not verified** | 9 ms       | 11 ms    |
| Model calls                | **Not verified** | 0          | 0        |
| Tokens and model cost      | **Not verified** | None       | None     |

These timings are a local best case with no network or model in the path, and
they say nothing about production. Expect Claude to be far slower: its deadline
is 12 seconds.

Claude's behavior with no key was tested in the same runtime: every request that
needs a model returned 501 with no result, and an empty Week 3 log returned its
zero totals labeled `server`.

### Reliability evidence without a live model

| Failure                                 | Tested how                       | Result                              |
| --------------------------------------- | -------------------------------- | ----------------------------------- |
| Missing or rejected key                 | Real runtime and fake server     | 501, no result                      |
| Rate limit, overload, server error      | Fake server, real SDK retry loop | Retried up to the limit, then 502   |
| Slow response                           | Fake server                      | Cancelled at the deadline, then 408 |
| Malformed, truncated, or refused output | Fake server                      | 502, not retried, nothing shown     |
| Mode typo                               | Real runtime                     | 501, no test data served            |

A fake server shows how this code handles a failure. It does not show how often
Claude fails, which only live use can measure.

### Output examples

Synthetic input, using the Week 1 scenario with about 150 words.

**Prewritten** (actual, fixed output):

> Choose one, adapt it, or write your own. Pause before responding. / Notice
> what is happening in my body. / Name uncertainty without rushing to solve it.
> _(and seven more)_
>
> Source: Prewritten content, version 1.0

**Mock** (actual output, test data only):

> [Demo: Normal Success] Name one sensation: Notice a single physical sensation
> from this activity and describe it without judging it.

**Claude:** no example yet. Add real output here after a live run rather than a
written sample.

## Cost

**Model cost is only one part of the cost of running this app.** Non-AI removes
the model cost, but it does not make the app free.

| Cost                                  | Claude                                                              | Prewritten          | Mock |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------- | ---- |
| Model tokens                          | Yes; see the [estimates](claude-tuning-and-usage.md#cost-estimates) | None                | None |
| Supabase database and auth            | Yes                                                                 | Yes                 | Yes  |
| Edge Function hosting and invocations | Yes                                                                 | Yes                 | Yes  |
| Storing saved student work            | Yes                                                                 | Yes                 | Yes  |
| Media hosting for Practice            | Yes                                                                 | Yes                 | Yes  |
| App store and build services          | Yes                                                                 | Yes                 | Yes  |
| Keeping content reviewed and current  | Prompts and output review                                           | Content pack review | None |

No hosting, storage, or operating figures have been measured, so none are given
here.

## Open before students use this

| Item                                                                | Who                 |
| ------------------------------------------------------------------- | ------------------- |
| Live verification: key, spending limit, approval to deploy          | Key holder and team |
| Sponsor review of the prewritten content (still "Ready for review") | Dr. Haberlin, Isa   |
| IRB decision on sending student text to a model                     | Dr. Haberlin        |
| Crisis wording and resources                                        | Dr. Haberlin        |
| Per-student rate limit for Claude                                   | Team                |

### Questions for Isa about the content pack

1. **The disclosure says the app "does not analyze or interpret your response,"
   but the crisis check scans the text for phrases.** The check stays on for
   safety. Should the wording change to stay accurate?
2. **The unavailable message says "Choose another mode," but students have no
   way to choose one,** since the mode is a server setting. It is used word for
   word for now. Should it change, or should students get a mode choice?
3. **Week 1 completion.** The pack sets no rule for Week 1. All four prompts are
   required for now, matching the three AI gap questions. Is that right?
4. **Week 3 categories differ between modes.** Prewritten uses Planning, Memory,
   Worry, Social comparison, Entertainment, and Other. The AI path uses six
   placeholder categories such as social media and messaging. A fair comparison
   likely needs one list.
5. **Week 3 percentages differ.** The pack shows one decimal (33.3), so its
   figures can total 100.1. The AI path uses whole numbers totaling exactly 100.
