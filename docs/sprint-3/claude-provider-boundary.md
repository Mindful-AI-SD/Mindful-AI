# Claude provider boundary

Status: implemented against a fake Anthropic server. **No live Claude call has
been made yet** (see [Dependencies](#dependencies)). Live results are recorded
in [claude-live-verification.md](claude-live-verification.md).

## The boundary

The app never talks to Claude. It calls the authenticated `ai-activity` Edge
Function, which is the only route to a model:

```text
Expo app -> ai-activity (auth, crisis check, schema, published activity)
         -> runAiActivity -> claudeAdapter -> Anthropic Messages API
```

- `mobile/` holds no key, SDK, or provider import.
  `npm run check:client-security` fails the build if one appears.
- The student comes from the session, never from the request.
- The Week 1 (`intention_mirror`), Week 2 (`sensation_lexicon`), and Week 3
  (`distraction_audit`) response shapes do not change. The app sees only
  `provider: "claude"`, never the model name, usage, or prompt.

## Server settings

Set these as Supabase secrets. None is sent to the app.

| Setting                      | Default             | Bounds and behavior                                                                                |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `GUIDED_REFLECTION_PROVIDER` | `mock`              | Set to `claude` to use this adapter.                                                               |
| `ANTHROPIC_API_KEY`          | none                | Required secret. Missing means HTTP 501, not a fake result.                                        |
| `CLAUDE_MODEL`               | `claude-sonnet-5-5` | Any model supporting structured output and adaptive thinking. A model the account lacks gives 501. |
| `CLAUDE_TIMEOUT_MS`          | `12000`             | 1000 to 14000, covering all attempts. The app stops waiting at 15 seconds.                         |
| `CLAUDE_MAX_RETRIES`         | `1`                 | 0 to 2. Only rate limits, overload, 5xx, and connection failures are retried.                      |
| `CLAUDE_EFFORT`              | `low`               | `low`, `medium`, or `high`. Thinking is adaptive and counts toward output tokens.                  |
| `CLAUDE_MAX_OUTPUT_TOKENS`   | `16000`             | 256 to 16000. A ceiling over the per-activity limits below.                                        |
| `CLAUDE_REFUSAL_FALLBACK`    | `default`           | `default` or `off`. See [Refusals](#refusals).                                                     |

An out-of-range value is ignored in favor of the default, with a logged warning
that names the setting only.

## Bounds

| Activity            | Input limit (enforced before the call)      | Output token limit  |
| ------------------- | ------------------------------------------- | ------------------- |
| `intention_mirror`  | 3 to 2000 characters                        | 2000                |
| `sensation_lexicon` | 3 sensations, 2 to 80 characters each       | 2000                |
| `distraction_audit` | 0 to 300 events, labels up to 40 characters | 1500 + 40 per event |

- **Only student input goes to the model.** The client-written `activityContext`
  is not forwarded; the server uses a fixed description, so a client cannot
  inject instructions through it. Week 3 timestamps are not sent either.
- **One deadline covers every attempt**, including retries and backoff. When it
  passes, the call is cancelled, so it stops spending.
- **Malformed output is not retried.** Each attempt costs money. The student
  gets an error and can retry.
- **Large Week 3 logs may not finish in time.** A 300-event log may need more
  output than the deadline allows, and it would be billed each time it times
  out. Measure this before connecting Week 3 to Claude, and cap the log size or
  split it if needed.

## Response validation

Each response must pass all of these, or it is rejected with 502 and nothing is
shown or saved:

1. `stop_reason` is `end_turn`. `max_tokens` and `refusal` are failures.
2. The text is valid JSON matching the API-enforced output schema.
3. It passes the same Zod schema every provider uses, including the limits the
   API cannot enforce (three intentions, 60 and 160 characters, 24 words).
4. It fits the request: Week 2 suggestions must not repeat the student's words,
   and Week 3 must cover each event exactly once.

Week 2's `original` comes from the request rather than the model, and Week 3's
assignments are put in request order, so a harmless reordering cannot fail a
student's request. The server does all Week 3 arithmetic.

## Failure behavior

| Situation                                           | HTTP | Error code                | App behavior                     |
| --------------------------------------------------- | ---- | ------------------------- | -------------------------------- |
| Key missing; key rejected (401, 403); billing (402) | 501  | `PROVIDER_NOT_CONFIGURED` | Mode unavailable message         |
| Model unavailable to the account (404)              | 501  | `PROVIDER_NOT_CONFIGURED` | Mode unavailable message         |
| Deadline passed                                     | 408  | `PROVIDER_TIMEOUT`        | "Taking too long", retry offered |
| Mode changed after the student read the notice      | 409  | `MODE_CHANGED`            | Notice refreshes, nothing sent   |
| Rate limit, overload, or 5xx after retries          | 502  | `PROVIDER_ERROR`          | Error, retry offered             |
| Refusal, truncated, or invalid output               | 502  | `PROVIDER_ERROR`          | Error, retry offered             |

A failure never switches to the mock or to prewritten content, and never claims
live output. The student's writing is saved before the request, so a failure
cannot lose it. Errors returned to the app are fixed strings with no provider
text in them.

## Refusals

A safety classifier can decline a request with HTTP 200 and
`stop_reason: "refusal"`. By default the adapter sends `fallbacks: "default"` so
Anthropic can re-run a declined request on its recommended model for that
category. This stays inside Claude; it is not a mode switch. The model that
served each call is logged, because a fallback model can bill at a different
rate. Models without fallback support simply stay declined, which the adapter
reports as `PROVIDER_ERROR`. Set `CLAUDE_REFUSAL_FALLBACK=off` to disable this.

## Usage logging

Each call writes one JSON log line (`event: "ai_usage"`, or
`"ai_provider_failure"`) holding only the activity kind, the model requested and
served, token counts, latency, stop reason, prompt version, and Anthropic's
request ID. Student text, model output, prompts, and keys are never logged.

## Dependencies

Live use cannot start until each of these is met. Code is not the blocker.

| Dependency                                      | Who                                   | Status                       |
| ----------------------------------------------- | ------------------------------------- | ---------------------------- |
| Anthropic account and API key                   | Held by a teammate; name not recorded | Not yet available to Frankie |
| Spending limit on that workspace                | Key holder, in the Anthropic Console  | Not confirmed                |
| Key stored as a Supabase secret                 | Project owner                         | Not done                     |
| Approval to deploy to the shared project        | Team                                  | Not given                    |
| IRB decision on sending student text to a model | Dr. Haberlin                          | Open; synthetic text only    |
| Crisis wording approval                         | Dr. Haberlin                          | Open; blocks real students   |

The in-app bounds above limit the cost of one request but not the total number
of requests. **The account's spending limit is the only total cap**, and there
is no per-student rate limit yet. Set the limit before enabling Claude.
