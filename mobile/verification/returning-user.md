# Returning-user verification

## Repair 1: saved step and completion

The existing screens saved writing and answers but never changed `current_step`
or completion status. Added a user-scoped progress service that saves step
transitions and answers together, detects conflicting writes, restores legacy
drafts, and records completion only after the final step.

Verification: `node --test tests/week-one.test.cjs` covers normal progression,
restoration at writing/results, failed or conflicting saves, account isolation,
and completion data. These checks use a simulated database, not live Supabase.
