-- Per-student daily cap on model requests (Claude). The workspace spending
-- limit caps the total; this keeps one student from using it up for everyone.
-- Holds counts only: no student text, prompts, or model output.
create table public.ai_request_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_request_counts enable row level security;

-- A student may read their own counts. No one may write them directly, or a
-- student could reset their own limit; only claim_ai_request writes.
create policy "Users read their own AI request counts"
on public.ai_request_counts
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.ai_request_counts from anon, authenticated;
grant select on public.ai_request_counts to authenticated;

-- Atomically counts one model request for the signed-in user against today's
-- UTC total. A refused request is not counted. Security definer is needed to
-- write a table the caller cannot write, so the owner always comes from
-- auth.uid(), never from an argument. A student calling this directly can
-- only add to their own count.
create function public.claim_ai_request(p_daily_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 500 then
    raise exception 'invalid daily limit' using errcode = '22023';
  end if;

  insert into public.ai_request_counts as counts (user_id, usage_date, request_count)
  values (v_user, v_today, 1)
  on conflict (user_id, usage_date) do update
    set request_count = counts.request_count + 1, updated_at = now()
    where counts.request_count < p_daily_limit
  returning request_count into v_count;

  if v_count is null then
    return jsonb_build_object('allowed', false, 'limit', p_daily_limit);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'limit', p_daily_limit
  );
end;
$$;

revoke all on function public.claim_ai_request(integer) from public, anon;
grant execute on function public.claim_ai_request(integer) to authenticated;
