-- MIN-220: additive, definition-driven storage. No production curriculum is seeded.
create schema baseline_private;
revoke all on schema baseline_private from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'baseline_writer') then
    create role baseline_writer nologin noinherit nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname='baseline_writer'
    and (rolcanlogin or rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb))
    or pg_has_role('authenticated','baseline_writer','member')
    or pg_has_role('anon','baseline_writer','member') then
    raise exception 'Unsafe baseline_writer role configuration';
  end if;
end $$;
grant baseline_writer to postgres;
grant usage on schema public, baseline_private to baseline_writer;
-- Temporary ownership-transfer privileges, revoked below.
grant create on schema public, baseline_private to baseline_writer;
-- Managed Supabase auth schema does not grant delegation rights to postgres.
-- This narrow identity bridge reads auth.uid() only: no table reads or writes.
create function baseline_private.current_owner()
returns uuid language sql stable security definer set search_path = '' as $$
  select auth.uid();
$$;

create function baseline_private.valid_questions(questions jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare q jsonb;
begin
  if jsonb_typeof(questions) is distinct from 'array' then return false; end if;
  if jsonb_array_length(questions) <> 5 then return false; end if;
  for q in select value from jsonb_array_elements(questions) loop
    if jsonb_typeof(q) is distinct from 'object'
      or (q - 'questionId' - 'prompt' - 'maxCharacters') <> '{}'::jsonb
      or jsonb_typeof(q->'questionId') is distinct from 'string'
      or jsonb_typeof(q->'prompt') is distinct from 'string'
      or jsonb_typeof(q->'maxCharacters') is distinct from 'number' then return false; end if;
    if char_length(q->>'questionId') not between 1 and 64
      or not (q->>'questionId' ~ '[^[:space:]]')
      or not (q->>'prompt' ~ '[^[:space:]]') then return false; end if;
    if (q->>'maxCharacters')::numeric not between 1 and 20000
      or trunc((q->>'maxCharacters')::numeric) <> (q->>'maxCharacters')::numeric then return false; end if;
  end loop;
  return (select count(distinct value->>'questionId') = 5 from jsonb_array_elements(questions));
end $$;

create table public.baseline_definitions (
  definition_id text not null check (definition_id ~ '[^[:space:]]'),
  definition_version integer not null check (definition_version > 0),
  questions jsonb not null check (baseline_private.valid_questions(questions)),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (definition_id, definition_version)
);
create table public.baseline_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contract_version text not null default 'sprint3-storage/v1' check (contract_version = 'sprint3-storage/v1'),
  definition_id text not null,
  definition_version integer not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null check (status in ('draft', 'submitted')),
  revision bigint not null check (revision between 1 and 9007199254740991),
  submitted_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  foreign key (definition_id, definition_version)
    references public.baseline_definitions on delete restrict,
  check ((status = 'submitted') = (submitted_at is not null)),
  check ((status = 'submitted') = (submitted_operation_id is not null))
);
create table public.baseline_write_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check (operation_kind in ('save_draft', 'submit')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  resulting_revision bigint not null check (resulting_revision between 1 and 9007199254740991),
  outcome text not null check (outcome in ('draft_saved', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  check ((operation_kind = 'submit' and outcome = 'submitted' and submitted_at is not null)
    or (operation_kind = 'save_draft' and outcome = 'draft_saved' and submitted_at is null))
);

alter table public.baseline_definitions enable row level security;
alter table public.baseline_records enable row level security;
alter table public.baseline_write_receipts enable row level security;
revoke all on public.baseline_definitions, public.baseline_records, public.baseline_write_receipts
  from public, anon, authenticated, baseline_writer;
grant select on public.baseline_definitions, public.baseline_records, public.baseline_write_receipts
  to authenticated, baseline_writer;
grant insert, update on public.baseline_records to baseline_writer;
grant insert on public.baseline_write_receipts to baseline_writer;

create policy baseline_owner_read on public.baseline_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy baseline_writer_read on public.baseline_records for select to baseline_writer
  using ((select baseline_private.current_owner()) = user_id);
create policy baseline_owner_insert on public.baseline_records for insert to baseline_writer
  with check ((select baseline_private.current_owner()) = user_id);
create policy baseline_owner_update on public.baseline_records for update to baseline_writer
  using ((select baseline_private.current_owner()) = user_id)
  with check ((select baseline_private.current_owner()) = user_id);
create policy baseline_receipt_read on public.baseline_write_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy baseline_writer_receipt_read on public.baseline_write_receipts for select to baseline_writer
  using ((select baseline_private.current_owner()) = user_id);
create policy baseline_receipt_insert on public.baseline_write_receipts for insert to baseline_writer
  with check ((select baseline_private.current_owner()) = user_id);
create policy baseline_definition_read on public.baseline_definitions for select to authenticated
  using (is_published or exists (select 1 from public.baseline_records b
    where b.user_id = (select auth.uid()) and b.definition_id = baseline_definitions.definition_id
      and b.definition_version = baseline_definitions.definition_version));
create policy baseline_writer_definition_read on public.baseline_definitions for select to baseline_writer
  using (is_published or exists (select 1 from public.baseline_records b
    where b.user_id = (select baseline_private.current_owner()) and b.definition_id = baseline_definitions.definition_id
      and b.definition_version = baseline_definitions.definition_version));

create function baseline_private.guard_definition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.definition_id, new.definition_version, new.questions, new.created_at)
    is distinct from (old.definition_id, old.definition_version, old.questions, old.created_at) then
    raise exception 'BASELINE_DEFINITION_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger baseline_definition_immutable before update on public.baseline_definitions
  for each row execute function baseline_private.guard_definition();

create function baseline_private.guard_record()
returns trigger language plpgsql set search_path = '' as $$
declare questions jsonb; answer record; q jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'submitted' then raise exception 'BASELINE_IMMUTABLE'; end if;
    if (new.user_id, new.definition_id, new.definition_version, new.contract_version, new.created_at)
      is distinct from (old.user_id, old.definition_id, old.definition_version, old.contract_version, old.created_at) then
      raise exception 'INVALID_INPUT';
    end if;
    if new.revision <> old.revision + 1 then raise exception 'STALE_REVISION'; end if;
  else
    if new.revision <> 1 then raise exception 'STALE_REVISION'; end if;
    new.created_at := now();
  end if;
  select d.questions into questions from public.baseline_definitions d
    where d.definition_id = new.definition_id and d.definition_version = new.definition_version;
  if questions is null then raise exception 'DEFINITION_NOT_AVAILABLE'; end if;
  if jsonb_typeof(new.answers) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  for answer in select key, value from jsonb_each(new.answers) loop
    select value into q from jsonb_array_elements(questions) where value->>'questionId' = answer.key;
    if q is null or jsonb_typeof(answer.value) is distinct from 'string' then raise exception 'INVALID_INPUT'; end if;
    if char_length(answer.value #>> '{}') > (q->>'maxCharacters')::integer then raise exception 'INVALID_INPUT'; end if;
  end loop;
  if new.status = 'submitted' then
    if (select count(*) from jsonb_each(new.answers)) <> 5
      or exists (select 1 from jsonb_each_text(new.answers) where not (value ~ '[^[:space:]]')) then
      raise exception 'INVALID_INPUT';
    end if;
    new.submitted_at := now();
  else
    new.submitted_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger baseline_record_guard before insert or update on public.baseline_records
  for each row execute function baseline_private.guard_record();

create function baseline_private.guard_receipt()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'OPERATION_CONFLICT'; end $$;
create trigger baseline_receipt_immutable before update on public.baseline_write_receipts
  for each row execute function baseline_private.guard_receipt();

create function baseline_private.write_baseline(kind text, request jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := baseline_private.current_owner(); op_id uuid; expected bigint; version integer;
  fingerprint text; existing public.baseline_records; receipt public.baseline_write_receipts;
  published boolean; result_revision bigint; submitted_time timestamptz;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_typeof(request) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if octet_length(request::text) > 524288
    or (request - 'contractVersion' - 'operationId' - 'expectedRevision' - 'definitionId' - 'definitionVersion' - 'answers') <> '{}'::jsonb
    or request->>'contractVersion' is distinct from 'sprint3-storage/v1'
    or jsonb_typeof(request->'operationId') is distinct from 'string'
    or not (request->>'operationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or jsonb_typeof(request->'definitionId') is distinct from 'string'
    or not (request->>'definitionId' ~ '[^[:space:]]')
    or jsonb_typeof(request->'definitionVersion') is distinct from 'number'
    or jsonb_typeof(request->'expectedRevision') is distinct from 'number'
    or jsonb_typeof(request->'answers') is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if (request->>'definitionVersion')::numeric not between 1 and 2147483647
    or trunc((request->>'definitionVersion')::numeric) <> (request->>'definitionVersion')::numeric
    or (request->>'expectedRevision')::numeric not between 0 and 9007199254740990
    or trunc((request->>'expectedRevision')::numeric) <> (request->>'expectedRevision')::numeric then raise exception 'INVALID_INPUT'; end if;
  op_id := (request->>'operationId')::uuid;
  expected := (request->>'expectedRevision')::bigint;
  version := (request->>'definitionVersion')::integer;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('kind', kind, 'request', request)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('baseline:' || owner_id::text, 0));
  select * into receipt from public.baseline_write_receipts where user_id = owner_id and operation_id = op_id;
  if found then
    if receipt.request_hash <> fingerprint then raise exception 'OPERATION_CONFLICT'; end if;
    return jsonb_build_object('contractVersion', 'sprint3-storage/v1', 'outcome', receipt.outcome,
      'revision', receipt.resulting_revision, 'submittedAt', receipt.submitted_at, 'replayed', true);
  end if;
  select * into existing from public.baseline_records where user_id = owner_id;
  if existing.status = 'submitted' then raise exception 'BASELINE_IMMUTABLE'; end if;
  if existing.user_id is not null and (existing.definition_id <> request->>'definitionId' or existing.definition_version <> version) then
    raise exception 'DEFINITION_CONFLICT';
  end if;
  select d.is_published into published from public.baseline_definitions d
    where d.definition_id = request->>'definitionId' and d.definition_version = version;
  if published is distinct from true then raise exception 'DEFINITION_NOT_AVAILABLE'; end if;
  if coalesce(existing.revision, 0) <> expected then raise exception 'STALE_REVISION'; end if;
  result_revision := expected + 1;
  if existing.user_id is null then
    insert into public.baseline_records(user_id, definition_id, definition_version, answers, status, revision, submitted_operation_id)
      values(owner_id, request->>'definitionId', version, request->'answers',
        case when kind = 'submit' then 'submitted' else 'draft' end, result_revision,
        case when kind = 'submit' then op_id else null end)
      returning submitted_at into submitted_time;
  else
    update public.baseline_records set answers = request->'answers',
      status = case when kind = 'submit' then 'submitted' else 'draft' end,
      revision = result_revision, submitted_operation_id = case when kind = 'submit' then op_id else null end
      where user_id = owner_id returning submitted_at into submitted_time;
  end if;
  insert into public.baseline_write_receipts(user_id, operation_id, operation_kind, request_hash, resulting_revision, outcome, submitted_at)
    values(owner_id, op_id, kind, fingerprint, result_revision,
      case when kind = 'submit' then 'submitted' else 'draft_saved' end, submitted_time);
  return jsonb_build_object('contractVersion', 'sprint3-storage/v1',
    'outcome', case when kind = 'submit' then 'submitted' else 'draft_saved' end,
    'revision', result_revision, 'submittedAt', submitted_time, 'replayed', false);
end $$;

create function public.save_baseline_draft(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return baseline_private.write_baseline('save_draft', p_request);
exception when others then
  if sqlerrm = any(array['AUTH_REQUIRED','INVALID_INPUT','DEFINITION_NOT_AVAILABLE','DEFINITION_CONFLICT',
    'STALE_REVISION','OPERATION_CONFLICT','BASELINE_IMMUTABLE']) then
    raise exception using message = sqlerrm, errcode = 'P0001';
  end if;
  raise exception 'BASELINE_UNAVAILABLE';
end $$;
create function public.submit_baseline(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return baseline_private.write_baseline('submit', p_request);
exception when others then
  if sqlerrm = any(array['AUTH_REQUIRED','INVALID_INPUT','DEFINITION_NOT_AVAILABLE','DEFINITION_CONFLICT',
    'STALE_REVISION','OPERATION_CONFLICT','BASELINE_IMMUTABLE']) then
    raise exception using message = sqlerrm, errcode = 'P0001';
  end if;
  raise exception 'BASELINE_UNAVAILABLE';
end $$;

-- Read-only invoker projections: no owner parameter, no draft in original-only retrieval.
create function public.load_baseline()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select jsonb_build_object('contractVersion', b.contract_version, 'definitionId', b.definition_id,
    'definitionVersion', b.definition_version, 'answers', b.answers, 'status', b.status, 'revision', b.revision,
    'submittedOperationId', b.submitted_operation_id, 'submittedAt', b.submitted_at,
    'createdAt', b.created_at, 'updatedAt', b.updated_at)
    into result from public.baseline_records b where b.user_id = auth.uid();
  return result;
exception when others then
  if sqlerrm = 'AUTH_REQUIRED' then raise exception 'AUTH_REQUIRED'; end if;
  raise exception 'BASELINE_UNAVAILABLE';
end $$;
create function public.load_original_baseline()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare original jsonb; definition jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select jsonb_build_object('contractVersion', b.contract_version, 'definitionId', b.definition_id,
    'definitionVersion', b.definition_version, 'answers', b.answers, 'status', b.status, 'revision', b.revision,
    'submittedOperationId', b.submitted_operation_id, 'submittedAt', b.submitted_at,
    'createdAt', b.created_at, 'updatedAt', b.updated_at),
    jsonb_build_object('definitionId', d.definition_id, 'definitionVersion', d.definition_version,
      'questions', d.questions, 'isPublished', d.is_published)
    into original, definition from public.baseline_records b
    join public.baseline_definitions d using (definition_id, definition_version)
    where b.user_id = auth.uid() and b.status = 'submitted';
  return jsonb_build_object('contractVersion', 'sprint3-storage/v1', 'original', original, 'definition', definition);
exception when others then
  if sqlerrm = 'AUTH_REQUIRED' then raise exception 'AUTH_REQUIRED'; end if;
  raise exception 'BASELINE_UNAVAILABLE';
end $$;

alter function baseline_private.valid_questions(jsonb) owner to baseline_writer;
alter function baseline_private.guard_definition() owner to baseline_writer;
alter function baseline_private.guard_record() owner to baseline_writer;
alter function baseline_private.guard_receipt() owner to baseline_writer;
alter function baseline_private.write_baseline(text, jsonb) owner to baseline_writer;
alter function public.save_baseline_draft(jsonb) owner to baseline_writer;
alter function public.submit_baseline(jsonb) owner to baseline_writer;
revoke all on all functions in schema baseline_private from public, anon, authenticated;
grant execute on function baseline_private.current_owner() to baseline_writer;
revoke all on function public.save_baseline_draft(jsonb), public.submit_baseline(jsonb),
  public.load_baseline(), public.load_original_baseline() from public, anon;
grant execute on function public.save_baseline_draft(jsonb), public.submit_baseline(jsonb),
  public.load_baseline(), public.load_original_baseline() to authenticated;
revoke create on schema public, baseline_private from baseline_writer;
