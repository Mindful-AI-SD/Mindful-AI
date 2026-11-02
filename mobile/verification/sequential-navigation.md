# Sequential frontend navigation verification

November 2, 2026. Base: main at `2ba5a7c`.

The shared `getWeekAccess` frontend reader checks authenticated owner progress
for the canonical published activities in earlier weeks. Every activity must
have saved `completed` status and a valid non-null completion timestamp. It
does not infer completion from local answers, baseline fixtures, or timer state,
and never writes completion. Empty/unavailable curriculum fails closed.

Week 2 requires Week 1; Week 3 requires Weeks 1 and 2. Dashboard status,
entry checks, query-string resume links (`/?week=2&activityId=...`), and the
standalone breathing route use the same result. Direct activity links resolve
the published parent week. A wrong-week link cannot run Week 1 controls.
Entry rechecks saved state even when an earlier card showed Available.
Background/focus return invalidates and reloads access; failed checks expose
retry and keep activity controls inaccessible. Existing form state remains
mounted during a pending recheck.

## Executed checks

- All component suites: 104 tests passed. Focused coverage includes partial or
  missing completion, empty curriculum, unrelated records, account changes,
  unresolved links, loading, stale access, retries, and wrong-week routing.
- Browser suite `sequential-navigation.spec.cjs`: 3 tests passed; verifies Week 2/3 locks and
  unlocks, exact Week 2 saved answers after reload, Week 3 entry after reload,
  revoked/stale completion, direct player links, failed reads, and mismatched
  activity/week URLs. Test backend rejects every write; navigation sends none.
- Web export and exported client-security scan passed.

## Scope and existing blockers

These are frontend guards using simulated authenticated HTTP responses in
browser tests. They do not deploy or verify Lucas's unmerged backend RPC/RLS
changes. The main branch has no dashboard prerequisite-result API, so the
shared reader uses existing published curriculum and owner-scoped progress.
No existing activity completion predicate or saved record is rewritten.

Week 3 navigation leads to an explicit unavailable-screen entry, not a Week 1
flow or an invented Week 3 exercise. Week 3 student screens and their saved
beat service are not connected on main and remain outside this navigation task.
Physical-device navigation was not exercised.

Full TypeScript checking remains blocked by unchanged settings/theme/tab and
accessibility ref errors exposed by main's SDK 58 dependency update. A plain
`npm ci` rejects main's lockfile peer resolution; `npm ci --legacy-peer-deps`
installs the locked packages but its existing postinstall fails on an obsolete
query-string patch whose target is no longer installed. No dependency files or
unrelated SDK migration files were changed for this task.
