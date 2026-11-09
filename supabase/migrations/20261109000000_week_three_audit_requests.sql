-- A stable operation ID prevents repeated HTTP taps/retries from billing twice.
-- No raw audit text is retained here; only its digest and bounded assignments.
create table public.week_three_audit_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  input_digest text not null,
  status text not null check (status in ('processing', 'succeeded', 'failed')),
  result jsonb,
  error_status integer,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.week_three_audit_requests enable row level security;
-- Only the authenticated Edge Function's server-side client uses this ledger.
revoke all on public.week_three_audit_requests from anon, authenticated;
grant select, insert, update, delete on public.week_three_audit_requests to service_role;
