-- Durable request claims and atomic intention persistence; all access stays under RLS.
create table public.intention_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  claim_token uuid not null,
  sequence bigint generated always as identity,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  response jsonb,
  failure_status integer check (failure_status in (408, 502)),
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id),
  check ((status = 'processing' and response is null and failure_status is null)
    or (status = 'completed' and response is not null and failure_status is null)
    or (status = 'failed' and response is null and failure_status is not null))
);
alter table public.intention_submissions enable row level security;
create policy "Users read their own submissions" on public.intention_submissions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own submissions" on public.intention_submissions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own submissions" on public.intention_submissions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.intention_submissions to authenticated;
grant usage on sequence public.intention_submissions_sequence_seq to authenticated;

create function public.claim_intention_submission(
  p_submission_id uuid, p_activity_id uuid, p_request_hash text, p_claim_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.intention_submissions; inserted integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.activities a join public.weeks w on w.id = a.week_id
    where a.id = p_activity_id and w.week_number = 1) then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.intention_submissions(user_id, submission_id, activity_id, request_hash, claim_token)
    values(auth.uid(), p_submission_id, p_activity_id, p_request_hash, p_claim_token)
    on conflict (user_id, submission_id) do nothing;
  get diagnostics inserted = row_count;
  select * into strict r from public.intention_submissions
    where user_id = auth.uid() and submission_id = p_submission_id for update;
  if r.request_hash <> p_request_hash or r.activity_id <> p_activity_id then
    return jsonb_build_object('status', 'conflict');
  end if;
  return jsonb_build_object('status', case when inserted = 1 then 'claimed' else r.status end,
    'response', r.response, 'failureStatus', r.failure_status);
end $$;

create function public.finish_intention_submission(
  p_submission_id uuid, p_claim_token uuid, p_response jsonb default null, p_failure_status integer default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare r public.intention_submissions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into strict r from public.intention_submissions
    where user_id = auth.uid() and submission_id = p_submission_id and claim_token = p_claim_token for update;
  if r.status <> 'processing' then return; end if;
  if p_failure_status is not null then
    if p_failure_status not in (408, 502) or p_response is not null then raise exception 'Invalid result'; end if;
    update public.intention_submissions set status = 'failed', failure_status = p_failure_status
      where user_id = auth.uid() and submission_id = p_submission_id;
    return;
  end if;
  if p_response is null or jsonb_typeof(p_response) <> 'object'
    or p_response->>'provider' is distinct from 'mock'
    or (p_response - 'provider' - 'intentions') <> '{}'::jsonb
    or jsonb_typeof(p_response->'intentions') is distinct from 'array' then raise exception 'Invalid result'; end if;
  if jsonb_array_length(p_response->'intentions') <> 3 then raise exception 'Invalid result'; end if;
  if exists (select 1 from jsonb_array_elements(p_response->'intentions') i
    where jsonb_typeof(i) <> 'object' or (i - 'title' - 'explanation') <> '{}'::jsonb
      or jsonb_typeof(i->'title') is distinct from 'string'
      or jsonb_typeof(i->'explanation') is distinct from 'string'
      or char_length(btrim(i->>'title')) not between 1 and 120
      or char_length(btrim(i->>'explanation')) not between 1 and 1000) then raise exception 'Invalid result'; end if;
  -- Serialize completion for this activity; an older slow result must not replace a newer success.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || r.activity_id::text, 0));
  if not exists (select 1 from public.intention_submissions s where s.user_id = auth.uid()
    and s.activity_id = r.activity_id and s.status = 'completed' and s.sequence > r.sequence) then
    insert into public.progress(user_id, activity_id, generated_intentions)
      values(auth.uid(), r.activity_id, p_response->'intentions')
      on conflict (user_id, activity_id) do update set generated_intentions = excluded.generated_intentions;
  end if;
  update public.intention_submissions set status = 'completed', response = p_response
    where user_id = auth.uid() and submission_id = p_submission_id;
end $$;
revoke all on function public.claim_intention_submission(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.finish_intention_submission(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.claim_intention_submission(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.finish_intention_submission(uuid, uuid, jsonb, integer) to authenticated;
