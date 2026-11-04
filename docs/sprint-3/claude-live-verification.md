# Claude live verification

## Status: not verified

No request has reached a live Claude model. Everything to date ran against a fake
Anthropic server, so no live output, latency, or usage figure exists yet.

**Blocker for Jira:** the Anthropic API key is held by a teammate and has not been
provided to this work, and no workspace spending limit has been confirmed.
Deploying to the shared project also needs team approval. Code is not the
blocker: once those exist, the runbook below completes this ticket.

## Runbook

Use synthetic text only. Each request costs money, so set the spending limit first.

1. **Set the limit.** In the Anthropic Console, set a monthly spending limit on the
   workspace that owns the key, and record the amount below.
2. **Set the secrets.** Enter the key at the prompt or in the dashboard, so it never
   lands in shell history or a committed file:

   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY
   npx supabase secrets set GUIDED_REFLECTION_PROVIDER=claude CLAUDE_MODEL=claude-sonnet-5-5
   ```

3. **Deploy**, with the team's approval, since this changes the shared project:

   ```bash
   npx supabase functions deploy ai-activity
   ```

4. **Run the requests** from the repository root, signed in as a synthetic test
   account:

   ```bash
   export VERIFY_SUPABASE_URL=...      # project URL
   export VERIFY_PUBLISHABLE_KEY=...   # sb_publishable_ key
   export VERIFY_EMAIL=...             # synthetic test account
   export VERIFY_PASSWORD=...
   deno task verify:provider           # Week 1 and Week 2 smoke requests
   deno task verify:provider --all     # all matched scenarios
   ```

   The script exits non-zero unless every request returns 200, passes the shared
   schema, matches its request, and reports `provider: "claude"`. A mock or
   prewritten response fails it, so it cannot report a false live result.

5. **Collect usage.** In the dashboard's `ai-activity` logs, filter for `ai_usage`.
   Each line shows the model requested and served, tokens, latency, and request ID.
   Compare the totals with the Console's usage page.
6. **Read the output.** Compare it with rows A1, A2, X1, X2, and X3 of
   `supabase/tests/fixtures/aiPolicyCurriculumTestMatrix.md`. The machine checks only
   catch clear violations.
7. **Record the results** below, then set `GUIDED_REFLECTION_PROVIDER` back to the
   team's chosen default unless Claude should stay on.

## Results

Fill in after a live run.

| Field                                        | Value |
| -------------------------------------------- | ----- |
| Date and person                              |       |
| Project host                                 |       |
| Deployed commit                              |       |
| `CLAUDE_MODEL`, effort, timeout, retries     |       |
| `PROMPT_VERSION`                             |       |
| Workspace spending limit                     |       |
| Week 1: status, latency, input/output tokens |       |
| Week 2: status, latency, input/output tokens |       |
| Model served, if a fallback ran              |       |
| Reviewed against the policy matrix by        |       |
