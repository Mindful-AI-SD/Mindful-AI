-- MIN-226: additive Week 3 drafts; final completion policy remains external.
create schema week_three_private;
revoke all on schema week_three_private from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='week_three_writer') then
    create role week_three_writer nologin noinherit nobypassrls;
  end if;
  if exists(select 1 from pg_roles where rolname='week_three_writer' and
    (rolcanlogin or rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb))
    or pg_has_role('authenticated','week_three_writer','member')
    or pg_has_role('anon','week_three_writer','member') then
    raise exception 'Unsafe week_three_writer role';
  end if;
end $$;
grant week_three_writer to postgres;
grant usage, create on schema public, week_three_private to week_three_writer;
create function week_three_private.owner_id() returns uuid
language sql stable security definer set search_path='' as $$ select auth.uid(); $$;

-- Trusted provisioning only: no guessed production mappings or answer keys.
create table public.week_three_modules (
  activity_id uuid primary key references public.activities(id) on delete restrict,
  content_version text not null check(length(content_version) between 1 and 100),
  required_activity_ids uuid[] not null check(cardinality(required_activity_ids)>0),
  allowed_answer_keys text[] not null default '{}',
  is_enabled boolean not null default false
);
create table public.week_three_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.week_three_modules(activity_id) on delete restrict,
  contract_version text not null default 'sprint3-storage/v1' check(contract_version='sprint3-storage/v1'),
  content_version text not null,
  revision bigint not null check(revision between 1 and 9007199254740991),
  events_revision bigint not null default 0 check(events_revision between 0 and 9007199254740991),
  status text not null default 'in_progress' check(status in ('not_started','in_progress','completed')),
  current_beat text not null default 'arrive' check(current_beat in ('arrive','practice','explore','notice')),
  events jsonb not null default '[]',
  answers jsonb not null default '{}',
  resume_state jsonb not null default '{"elapsedActiveMs":0,"positionMs":null,"state":"idle"}',
  audit_result jsonb,
  completion_policy_version text,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(user_id,activity_id),
  check((status='completed')=(completed_at is not null)),
  check((status='completed')=(completion_policy_version is not null))
);
create table public.week_three_write_receipts (
  user_id uuid not null,
  activity_id uuid not null,
  operation_id uuid not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  resulting_revision bigint not null check(resulting_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  primary key(user_id,activity_id,operation_id),
  foreign key(user_id,activity_id) references public.week_three_progress on delete cascade
);

create function week_three_private.valid_events(events jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare e jsonb; stamp text; normalized text[]:='{}'::text[];
begin
  if jsonb_typeof(events) is distinct from 'array' then return false; end if;
  if jsonb_array_length(events)>300 then return false; end if;
  for e in select value from jsonb_array_elements(events) loop
    if jsonb_typeof(e) is distinct from 'object' or
      (e-'id'-'at'-'label')<>'{}'::jsonb or
      jsonb_typeof(e->'id') is distinct from 'string' or
      jsonb_typeof(e->'at') is distinct from 'string' or
      jsonb_typeof(e->'label') is distinct from 'string' then return false; end if;
    -- Persist normalized strings; helper/endpoint uses the existing Zod schema.
    if length(e->>'id') not between 1 and 64 or length(e->>'label') not between 1 and 40
      or (e->>'id') !~ '[^[:space:]]' or (e->>'label') !~ '[^[:space:]]'
      or (e->>'id') <> btrim(e->>'id', E' \t\n\r\f'||chr(11))
      or (e->>'label') <> btrim(e->>'label', E' \t\n\r\f'||chr(11)) then return false; end if;
    if (e->>'id')=any(normalized) then return false; end if;
    normalized:=array_append(normalized,e->>'id');
    stamp:=e->>'at';
    if stamp !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then return false; end if;
    perform stamp::timestamptz;
    if substring(stamp,12,2)::int>23 or substring(stamp,15,2)::int>59
      or (substring(stamp,17,1)=':' and substring(stamp,18,2)::int>59) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
create function week_three_private.valid_resume(r jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return jsonb_typeof(r)='object' and (r-'elapsedActiveMs'-'positionMs'-'state')='{}'::jsonb
    and r ?& array['elapsedActiveMs','positionMs','state'] and r->>'state' in ('idle','paused')
    and jsonb_typeof(r->'state')='string'
    and jsonb_typeof(r->'elapsedActiveMs')='number'
    and (r->>'elapsedActiveMs')::numeric between 0 and 9007199254740991
    and trunc((r->>'elapsedActiveMs')::numeric)=(r->>'elapsedActiveMs')::numeric
    and (r->'positionMs'='null'::jsonb or (jsonb_typeof(r->'positionMs')='number'
      and (r->>'positionMs')::numeric between 0 and 9007199254740991
      and trunc((r->>'positionMs')::numeric)=(r->>'positionMs')::numeric));
exception when others then return false;
end $$;

-- Same assignment ordering and largest-remainder arithmetic as summarizeDistractionAudit.
create function week_three_private.valid_cache(c jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare d jsonb; es jsonb; assignments jsonb; a jsonb;
  cats text[]:=array['social_media','messaging','entertainment','news_and_browsing','work_and_school','thoughts'];
  counts int[]; shares int[]; ordering text[]; n int; unc int; best int;
  left_over int; expected jsonb:='[]'::jsonb;
begin
  if c='null'::jsonb or c is null then return true; end if;
  if jsonb_typeof(c) is distinct from 'object' or
    (c-'contractVersion'-'inputEventsRevision'-'inputEvents'-'provider'-'data')<>'{}'::jsonb
    or c->>'contractVersion' is distinct from 'distraction-audit-cache/v1'
    or jsonb_typeof(c->'inputEventsRevision') is distinct from 'number'
    or jsonb_typeof(c->'provider') is distinct from 'string'
    or length(c->>'provider') not between 1 and 64
    or (c->>'provider') !~ '^[a-z0-9_-]+$'
    or not week_three_private.valid_events(c->'inputEvents') then return false; end if;
  if (c->>'inputEventsRevision')::numeric not between 0 and 9007199254740991
    or trunc((c->>'inputEventsRevision')::numeric)<>(c->>'inputEventsRevision')::numeric then return false; end if;
  d:=c->'data'; es:=c->'inputEvents'; n:=jsonb_array_length(es); assignments:=d->'assignments';
  if jsonb_typeof(d) is distinct from 'object' or (d-'totalEvents'-'categories'-'uncategorized'-'assignments')<>'{}'::jsonb
    or jsonb_typeof(assignments) is distinct from 'array' then return false; end if;
  if jsonb_array_length(assignments)<>n then return false; end if;
  for i in 0..n-1 loop
    a:=assignments->i;
    if jsonb_typeof(a) is distinct from 'object' or (a-'eventId'-'category')<>'{}'::jsonb
      or a->'eventId' is distinct from es->i->'id' or not(a ? 'category')
      or (a->'category'<>'null'::jsonb and not(coalesce(a->>'category','')=any(cats))) then return false; end if;
  end loop;
  select coalesce(array_agg(category order by cnt desc,ord),'{}'), coalesce(array_agg(cnt order by cnt desc,ord),'{}')
    into ordering, counts from (select cat category,ord,count(*)::int cnt from unnest(cats) with ordinality u(cat,ord)
      join jsonb_array_elements(assignments) x on x->>'category'=cat group by cat,ord) q;
  select count(*) into unc from jsonb_array_elements(assignments) x where x->'category'='null'::jsonb;
  counts:=array_append(counts,unc); shares:='{}';
  for i in 1..cardinality(counts) loop shares:=array_append(shares,case when n=0 then 0 else counts[i]*100/n end); end loop;
  if n>0 then
    left_over:=100-(select sum(x) from unnest(shares) x);
    -- Choose each remainder once, preserving category/count order for ties.
    for j in 1..left_over loop
      best:=null;
      for i in 1..cardinality(counts) loop
        if shares[i]=counts[i]*100/n and (best is null or (counts[i]*100)%n>(counts[best]*100)%n) then best:=i; end if;
      end loop;
      shares[best]:=shares[best]+1;
    end loop;
  end if;
  for i in 1..cardinality(ordering) loop
    expected:=expected||jsonb_build_array(jsonb_build_object('category',ordering[i],'count',counts[i],'percent',shares[i]));
  end loop;
  return d=jsonb_build_object('totalEvents',n,'categories',expected,
    'uncategorized',jsonb_build_object('count',unc,'percent',shares[cardinality(shares)]),'assignments',assignments);
exception when others then return false;
end $$;

alter table public.week_three_progress add constraint valid_week_three_events check(week_three_private.valid_events(events));
alter table public.week_three_progress add constraint valid_week_three_resume check(week_three_private.valid_resume(resume_state) is true);
alter table public.week_three_progress add constraint valid_week_three_cache check(week_three_private.valid_cache(audit_result));
alter table public.week_three_progress add constraint valid_week_three_answers check(jsonb_typeof(answers)='object');

alter table public.week_three_modules enable row level security;
alter table public.week_three_progress enable row level security;
alter table public.week_three_write_receipts enable row level security;
revoke all on public.week_three_modules,public.week_three_progress,public.week_three_write_receipts from public,anon,authenticated,week_three_writer;
grant select on public.week_three_progress,public.week_three_write_receipts to authenticated,week_three_writer;
grant insert,update on public.week_three_progress to week_three_writer;
grant insert on public.week_three_write_receipts to week_three_writer;
grant select on public.week_three_modules,public.activity_aliases,public.activities,public.weeks to week_three_writer;
grant select(user_id,activity_id,status,completed_at) on public.progress to week_three_writer;
create policy week_three_progress_owner on public.week_three_progress for select to authenticated using(user_id=(select auth.uid()));
create policy week_three_receipt_owner on public.week_three_write_receipts for select to authenticated using(user_id=(select auth.uid()));
create policy week_three_writer_read on public.week_three_progress for select to week_three_writer using(user_id=(select week_three_private.owner_id()));
create policy week_three_writer_insert on public.week_three_progress for insert to week_three_writer with check(user_id=(select week_three_private.owner_id()));
create policy week_three_writer_update on public.week_three_progress for update to week_three_writer using(user_id=(select week_three_private.owner_id())) with check(user_id=(select week_three_private.owner_id()));
create policy week_three_receipt_writer_read on public.week_three_write_receipts for select to week_three_writer using(user_id=(select week_three_private.owner_id()));
create policy week_three_receipt_writer_insert on public.week_three_write_receipts for insert to week_three_writer with check(user_id=(select week_three_private.owner_id()));
create policy week_three_module_writer on public.week_three_modules for select to week_three_writer using(true);
create policy week_three_alias_writer on public.activity_aliases for select to week_three_writer using(true);
create policy week_three_activity_writer on public.activities for select to week_three_writer using(true);
create policy week_three_week_writer on public.weeks for select to week_three_writer using(true);
create policy week_three_prior_owner on public.progress for select to week_three_writer using(user_id=(select week_three_private.owner_id()));

create function week_three_private.guard_row() returns trigger language plpgsql set search_path='' as $$
declare keys text[];
begin
  if tg_op='UPDATE' then
    if old.status='completed' then raise exception 'WEEK_THREE_IMMUTABLE'; end if;
    if (new.user_id,new.activity_id,new.contract_version,new.content_version,new.created_at,new.started_at)
      is distinct from (old.user_id,old.activity_id,old.contract_version,old.content_version,old.created_at,old.started_at)
      or new.revision<>old.revision+1 then raise exception 'INVALID_INPUT'; end if;
    if new.events_revision <> old.events_revision+(case when new.events=old.events then 0 else 1 end) then raise exception 'INVALID_INPUT'; end if;
  else
    if new.revision<>1 or new.events_revision<>(case when new.events='[]'::jsonb then 0 else 1 end) then raise exception 'INVALID_INPUT'; end if;
    new.created_at:=now(); new.started_at:=now();
  end if;
  -- No student completion transition exists until MIN-225 supplies the predicate.
  if current_user='week_three_writer' and (new.status<>'in_progress' or new.completed_at is not null
    or new.completion_policy_version is not null) then raise exception 'COMPLETION_POLICY_UNAVAILABLE'; end if;
  select m.allowed_answer_keys into keys from public.week_three_modules m where m.activity_id=new.activity_id;
  if exists(select 1 from jsonb_each(new.answers) where not(key=any(keys)) or jsonb_typeof(value)<>'string'
    or length(value #>> '{}')>20000) then raise exception 'INVALID_INPUT'; end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger week_three_record_guard before insert or update on public.week_three_progress
for each row execute function week_three_private.guard_row();
create function week_three_private.immutable_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'OPERATION_CONFLICT'; end $$;
create trigger week_three_receipt_guard before update on public.week_three_write_receipts
for each row execute function week_three_private.immutable_receipt();

create function week_three_private.resolve_target(slug text) returns uuid
language plpgsql stable set search_path='' as $$
declare target uuid;
begin
  select a.id into target from public.activity_aliases x join public.activities a on a.id=x.activity_id
    join public.weeks w on w.id=a.week_id where x.slug=resolve_target.slug
    and w.week_number=3 and a.activity_type='ai_lab' and a.is_published and w.is_published;
  if target is null then raise exception 'ACTIVITY_NOT_AVAILABLE'; end if;
  return target;
end $$;
create function week_three_private.require_prior(target uuid) returns text
language plpgsql set search_path='' as $$
declare m public.week_three_modules; req uuid; week_no int; found_weeks int[]:='{}'::int[];
begin
  select * into m from public.week_three_modules where activity_id=target and is_enabled;
  if not found then raise exception 'PREREQUISITE_CONFIGURATION_UNAVAILABLE'; end if;
  foreach req in array m.required_activity_ids loop
    select w.week_number into week_no from public.activities a join public.weeks w on w.id=a.week_id
      where a.id=req and a.is_published and w.is_published and w.week_number in (1,2);
    if week_no is null then raise exception 'PREREQUISITE_CONFIGURATION_UNAVAILABLE'; end if;
    found_weeks:=array_append(found_weeks,week_no);
    if not exists(select 1 from public.progress p where p.user_id=week_three_private.owner_id()
      and p.activity_id=req and p.status='completed' and p.completed_at is not null) then
      raise exception 'PREREQUISITE_NOT_MET';
    end if;
  end loop;
  if not (1=any(found_weeks) and 2=any(found_weeks)) then raise exception 'PREREQUISITE_CONFIGURATION_UNAVAILABLE'; end if;
  return m.content_version;
end $$;

create function week_three_private.save(request jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare owner_id uuid:=week_three_private.owner_id(); target uuid; op uuid; expected bigint;
  existing public.week_three_progress; receipt public.week_three_write_receipts; patch jsonb; fingerprint text;
  cv text; ev jsonb; er bigint; result_revision bigint; report jsonb;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(request) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if octet_length(request::text)>524288 or
    (request-'contractVersion'-'slug'-'operationId'-'expectedRevision'-'contentVersion'-'patch')<>'{}'::jsonb
    or request->>'contractVersion' is distinct from 'sprint3-storage/v1'
    or jsonb_typeof(request->'slug') is distinct from 'string'
    or length(request->>'slug') not between 1 and 100 or request->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or jsonb_typeof(request->'operationId') is distinct from 'string'
    or request->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(request->'expectedRevision') is distinct from 'number'
    or jsonb_typeof(request->'contentVersion') is distinct from 'string'
    or jsonb_typeof(request->'patch') is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if (request->>'expectedRevision')::numeric not between 0 and 9007199254740990
    or trunc((request->>'expectedRevision')::numeric)<>(request->>'expectedRevision')::numeric then raise exception 'INVALID_INPUT'; end if;
  patch:=request->'patch';
  if patch='{}'::jsonb or (patch-'events'-'currentBeat'-'answers'-'resumeState'-'auditResult')<>'{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
  if (patch ? 'events' and not week_three_private.valid_events(patch->'events'))
    or (patch ? 'resumeState' and week_three_private.valid_resume(patch->'resumeState') is distinct from true)
    or (patch ? 'answers' and jsonb_typeof(patch->'answers') is distinct from 'object')
    or (patch ? 'currentBeat' and (jsonb_typeof(patch->'currentBeat') is distinct from 'string'
      or patch->>'currentBeat' not in ('arrive','practice','explore','notice')))
    or (patch ? 'auditResult' and (patch->'auditResult'='null'::jsonb or not week_three_private.valid_cache(patch->'auditResult'))) then raise exception 'INVALID_INPUT'; end if;
  target:=week_three_private.resolve_target(request->>'slug'); op:=(request->>'operationId')::uuid;
  expected:=(request->>'expectedRevision')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('week3:'||owner_id::text||':'||target::text,0));
  fingerprint:=encode(sha256(convert_to(request::text,'UTF8')),'hex');
  select * into receipt from public.week_three_write_receipts r where r.user_id=owner_id and r.activity_id=target and r.operation_id=op;
  if found then
    if receipt.request_hash<>fingerprint then raise exception 'OPERATION_CONFLICT'; end if;
    return jsonb_build_object('revision',receipt.resulting_revision,'replayed',true,'contractVersion','sprint3-storage/v1');
  end if;
  select * into existing from public.week_three_progress p where p.user_id=owner_id and p.activity_id=target;
  if existing.status='completed' then raise exception 'WEEK_THREE_IMMUTABLE'; end if;
  cv:=week_three_private.require_prior(target);
  if request->>'contentVersion'<>cv or (existing.user_id is not null and existing.content_version<>cv) then raise exception 'CONTENT_VERSION_CONFLICT'; end if;
  if coalesce(existing.revision,0)<>expected then raise exception 'STALE_REVISION'; end if;
  ev:=coalesce(patch->'events',existing.events,'[]'::jsonb);
  er:=coalesce(existing.events_revision,0)+case when ev=coalesce(existing.events,'[]'::jsonb) then 0 else 1 end;
  report:=case when patch ? 'auditResult' then patch->'auditResult' else existing.audit_result end;
  if patch ? 'auditResult' and ((report->>'inputEventsRevision')::bigint<>er or report->'inputEvents'<>ev) then raise exception 'INVALID_INPUT'; end if;
  result_revision:=expected+1;
  if existing.user_id is null then
    insert into public.week_three_progress(user_id,activity_id,content_version,revision,events_revision,events,current_beat,answers,resume_state,audit_result)
      values(owner_id,target,cv,result_revision,er,ev,coalesce(patch->>'currentBeat','arrive'),
        coalesce(patch->'answers','{}'::jsonb),
        coalesce(patch->'resumeState','{"elapsedActiveMs":0,"positionMs":null,"state":"idle"}'::jsonb),report);
  else
    update public.week_three_progress set revision=result_revision,events_revision=er,events=ev,
      current_beat=coalesce(patch->>'currentBeat',existing.current_beat),
      answers=coalesce(patch->'answers',existing.answers),
      resume_state=coalesce(patch->'resumeState',existing.resume_state),audit_result=report
      where user_id=owner_id and activity_id=target;
  end if;
  insert into public.week_three_write_receipts(user_id,activity_id,operation_id,request_hash,resulting_revision)
    values(owner_id,target,op,fingerprint,result_revision);
  return jsonb_build_object('revision',result_revision,'replayed',false,'contractVersion','sprint3-storage/v1');
end $$;

create function public.save_week_three_draft(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return week_three_private.save(p_request);
exception when others then
  if sqlerrm=any(array['AUTH_REQUIRED','INVALID_INPUT','ACTIVITY_NOT_AVAILABLE','PREREQUISITE_CONFIGURATION_UNAVAILABLE',
    'PREREQUISITE_NOT_MET','CONTENT_VERSION_CONFLICT','STALE_REVISION','OPERATION_CONFLICT','WEEK_THREE_IMMUTABLE']) then
    raise exception using message=sqlerrm,errcode=case
      when sqlerrm='AUTH_REQUIRED' then 'PT401' when sqlerrm='INVALID_INPUT' then 'PT400'
      when sqlerrm='ACTIVITY_NOT_AVAILABLE' then 'PT404' when sqlerrm='PREREQUISITE_NOT_MET' then 'PT403'
      when sqlerrm='PREREQUISITE_CONFIGURATION_UNAVAILABLE' then 'PT503' else 'PT409' end;
  end if;
  raise exception using message='WEEK_THREE_UNAVAILABLE',errcode='PT503';
end $$;
create function public.load_week_three_progress(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
  if week_three_private.owner_id() is null then raise exception using message='AUTH_REQUIRED',errcode='PT401'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' then raise exception using message='INVALID_INPUT',errcode='PT400'; end if;
  if (p_request-'slug')<>'{}'::jsonb or jsonb_typeof(p_request->'slug') is distinct from 'string'
    or length(p_request->>'slug') not between 1 and 100 or p_request->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using message='INVALID_INPUT',errcode='PT400'; end if;
  -- Owner restoration also works after withdrawal; new writes still require publication.
  select a.id into target from public.activity_aliases x join public.activities a on a.id=x.activity_id
    join public.weeks w on w.id=a.week_id where x.slug=p_request->>'slug' and w.week_number=3 and a.activity_type='ai_lab';
  if target is null then raise exception using message='ACTIVITY_NOT_AVAILABLE',errcode='PT404'; end if;
  select jsonb_build_object('activityId',p.activity_id,'contractVersion',p.contract_version,
    'contentVersion',p.content_version,'revision',p.revision,'eventsRevision',p.events_revision,
    'status',p.status,'currentBeat',p.current_beat,'events',p.events,'answers',p.answers,
    'resumeState',p.resume_state,'auditResult',p.audit_result,'completionPolicyVersion',p.completion_policy_version,
    'createdAt',p.created_at,'startedAt',p.started_at,'updatedAt',p.updated_at,'completedAt',p.completed_at)
    into result from public.week_three_progress p
    where p.user_id=week_three_private.owner_id() and p.activity_id=target;
  return result;
exception when sqlstate 'PT400' or sqlstate 'PT401' or sqlstate 'PT404' then raise;
  when others then raise exception using message='WEEK_THREE_UNAVAILABLE',errcode='PT503';
end $$;
create function public.complete_week_three(p_request jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then raise exception using message='AUTH_REQUIRED',errcode='PT401'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' then raise exception using message='INVALID_INPUT',errcode='PT400'; end if;
  if (p_request-'slug')<>'{}'::jsonb or jsonb_typeof(p_request->'slug') is distinct from 'string'
    or length(p_request->>'slug') not between 1 and 100 or p_request->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using message='INVALID_INPUT',errcode='PT400'; end if;
  raise exception using message='COMPLETION_POLICY_UNAVAILABLE',errcode='PT503';
end $$;

-- Restricted RPC owner cannot bypass RLS, log in, administer aliases or modify legacy progress.
-- Prerequisite signals use the transaction MVCC snapshot; they do not attest learning.
alter function week_three_private.valid_events(jsonb) owner to week_three_writer;
alter function week_three_private.valid_resume(jsonb) owner to week_three_writer;
alter function week_three_private.valid_cache(jsonb) owner to week_three_writer;
alter function week_three_private.guard_row() owner to week_three_writer;
alter function week_three_private.immutable_receipt() owner to week_three_writer;
alter function week_three_private.resolve_target(text) owner to week_three_writer;
alter function week_three_private.require_prior(uuid) owner to week_three_writer;
alter function week_three_private.save(jsonb) owner to week_three_writer;
alter function public.save_week_three_draft(jsonb) owner to week_three_writer;
alter function public.load_week_three_progress(jsonb) owner to week_three_writer;
revoke all on all functions in schema week_three_private from public,anon,authenticated;
grant execute on function week_three_private.owner_id() to week_three_writer;
revoke all on function public.save_week_three_draft(jsonb),public.load_week_three_progress(jsonb),public.complete_week_three(jsonb) from public,anon;
grant execute on function public.save_week_three_draft(jsonb),public.load_week_three_progress(jsonb),public.complete_week_three(jsonb) to authenticated;
revoke create on schema public,week_three_private from week_three_writer;
