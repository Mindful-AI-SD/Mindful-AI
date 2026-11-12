# Claude tuning and usage controls

**Status: offline work and usage controls are done; live tuning and measured
usage are still blocked on the key** (rechecked 2026-11-12: no key is available
to this work). Comparing real output with the rubric and measuring real token
use both need a live key. See the blocker in
[claude-live-verification.md](claude-live-verification.md). Nothing below is a
measured Claude result unless it says so, and no live figure exists yet.

## Rubric

The rubric is `supabase/tests/fixtures/aiPolicyCurriculumTestMatrix.md`. The
matched scenarios in `supabase/scripts/scenarios.ts` cover these rows:

| Row | What it asks                                                     | Scenario                            |
| --- | ---------------------------------------------------------------- | ----------------------------------- |
| A1  | Three distinct intentions, grounded, no flattery or prescribing  | Week 1, about 150 words             |
| A1  | Sparse input stays general, with no invented context             | Week 1, sparse                      |
| A2  | Optional non-clinical words, never the "correct" label           | Week 2, one vague and all vague     |
| A3  | Categories only; the server counts; an empty log invents nothing | Week 3, small log and empty log     |
| X1  | Injection changes nothing and reveals nothing                    | Week 1 and Week 2, prompt injection |
| X3  | No diagnosis or treatment, even when asked                       | Week 1, request for a diagnosis     |

The script's checks only catch clear violations, such as a forbidden word. **A
person still has to read the live output against the matrix**, because whether
an intention is grounded or flattering is a judgment call.

## What is done without a key

- **Prompts** are in one server module, versioned by `PROMPT_VERSION`. Week 1
  starts with the versioned fixture wording, and a test keeps the two in step.
- **Output schemas** use only features the API supports, which a test enforces.
  An unsupported keyword would otherwise fail every production request.
- **Clinical language guard.** Intention text with terms such as "diagnosis" or
  "disorder" is rejected. It is a guardrail on top of the prompt and does not
  replace reading the output.
- **Retry limits** are verified against a fake server: only transient failures
  retry, one deadline covers all attempts, and malformed output is never
  retried.
- **Unavailable state** is verified in the real Edge runtime with no key: HTTP
  501, no result, no provider call.
- **Usage measurement** is verified: one log line per call with tokens, model,
  and latency, and a test confirms it holds no student text or key.

## What to tune once a key exists

1. Run `deno task verify:provider --all` with synthetic text only.
2. Read the output against the rubric, and note any rejected responses in the
   logs.
3. Watch for these, each with a likely adjustment:

   | Signal in `ai_provider_failure` | Likely adjustment                              |
   | ------------------------------- | ---------------------------------------------- |
   | `schema_mismatch` on Week 1     | Tighten length wording; output is over a limit |
   | `truncated`                     | Raise that activity's output limit             |
   | `timeout`                       | Lower effort, or try a faster model            |
   | `clinical_language`             | Strengthen the prompt's non-clinical rules     |
   | `refusal`                       | Read the category; report false positives      |

4. Bump `PROMPT_VERSION` with any prompt change, and rerun the same scenarios.

Keep the established schemas. If output cannot fit them, raise that with the
team rather than loosening a limit quietly.

## Spending controls

| Control                | Where                                    | Limits                                 | Status             |
| ---------------------- | ---------------------------------------- | -------------------------------------- | ------------------ |
| Monthly spending limit | Anthropic Console, on the workspace      | **Total spend**                        | Not confirmed      |
| Output token limit     | Adapter, per activity                    | One response                           | Built              |
| Input limits           | Shared schemas, before any call          | One request                            | Built              |
| Retry cap              | `CLAUDE_MAX_RETRIES`, default 1          | Attempts per request                   | Built              |
| Single deadline        | `CLAUDE_TIMEOUT_MS`, default 12000       | Time, and cancels the call             | Built              |
| Daily cap per student  | `CLAUDE_DAILY_REQUEST_LIMIT`, default 30 | Model requests per student per UTC day | Built (2026-11-12) |

The daily cap covers both Claude routes, `ai-activity` and `week-three-audit`. A
request is counted only when it is about to reach the model: mock, prewritten, a
missing key, a crisis response, an invalid request, a mode change, an empty Week
3 log, and a replayed Week 3 receipt are never counted. A request over the cap
gets HTTP 429 with no model call. If the count cannot be checked, the request
gets 503 and no model call either, so the cap fails closed.

Counts live in `ai_request_counts` (migration `20261112000000`), which holds a
date and a number per student and nothing else. Students can read their own
count but cannot write it; only the `claim_ai_request` database function adds to
it, using the caller's own session. A local integration test confirms that a
student cannot reset, raise, or delete their count.

The default of 30 is a starting point, not a measured figure: a student doing
Weeks 1 to 3 in one sitting makes a handful of requests. Revisit it once live
usage is measured.

## Week 3 audit route

The separate `week-three-audit` route (Christopher's Week 3 screens) now uses
the same controls as `ai-activity`: the crisis check before anything else, its
prompt in `activityPrompts.ts` under `PROMPT_VERSION`, the shared adapter's
deadline and output checks, the daily cap, and the same metadata-only `ai_usage`
log (`kind: "week_three_audit"`). Its output limit is now 1,500 + 40 tokens per
entry instead of a flat 12,000. Its categories, its one-decimal percentages, its
billing ledger, and its screens are unchanged, and SDK retries stay off for it
because its ledger decides when a request may be billed again.

## Cost estimates

These are **estimates from the configured limits, not measurements**. They use
Claude Sonnet 5.5 list prices of $2 input and $10 output per million tokens, and
the input sizes are rough assumptions. Replace them with measured `ai_usage`
figures.

| Activity                              | Assumed input | Output limit | Most one request can cost |
| ------------------------------------- | ------------- | ------------ | ------------------------- |
| Week 1 Intention Mirror               | ~900 tokens   | 2,000        | ~$0.022                   |
| Week 2 Sensation Lexicon              | ~450 tokens   | 2,000        | ~$0.021                   |
| Week 3, 300-event log                 | ~6,000 tokens | 13,500       | ~$0.147                   |
| Week 3 audit route, 300 short entries | ~9,000 tokens | 13,500       | ~$0.153                   |

The audit route accepts entry topics of up to 2,000 characters each, so a
deliberately long 300-entry request could reach roughly 165,000 input tokens,
about $0.47 at most. The daily cap limits how often that can happen; a total
input bound would need a change to Week 3's own limits.

Typical requests should cost less, since few will reach the output limit. A
retried failure can bill again, and a refusal fallback bills at the serving
model's rate.

Prompt caching is not used. These prompts are short and likely below the minimum
cacheable size, so it would add nothing yet. Check again if prompts grow.

## Recording results

Fill this in after a live run. Do not copy student text or model output here.

| Field                                  | Value |
| -------------------------------------- | ----- |
| Date, model, effort, `PROMPT_VERSION`  |       |
| Requests and total input/output tokens |       |
| Average tokens per activity            |       |
| Rejected responses, by failure type    |       |
| Workspace spending limit               |       |
| Output reviewed against the rubric by  |       |
