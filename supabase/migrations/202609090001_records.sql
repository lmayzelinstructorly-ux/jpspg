-- Server-owned repository. All browser/anon access is denied by RLS and grants.
-- Authentication uses secure username/password sessions on the game server.
create table if not exists public.jpspg_records (
  kind text not null check (kind in ('accounts','sessions','friends','requests','blocks','conversations','messages','parties','reports','results','settings')),
  id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (kind,id),
  check (payload->>'id'=id)
);
alter table public.jpspg_records enable row level security;
alter table public.jpspg_records force row level security;
revoke all on public.jpspg_records from anon, authenticated;
grant select,insert,update,delete on public.jpspg_records to service_role;
-- No permissive browser policy is intentional. Clients only use authorized API routes.
create unique index if not exists jpspg_handle_unique
 on public.jpspg_records (lower(payload->>'handle')) where kind='accounts';
create index if not exists jpspg_message_conversation
 on public.jpspg_records ((payload->>'conversation'),((payload->>'at')::bigint)) where kind='messages';
create index if not exists jpspg_session_user
 on public.jpspg_records ((payload->>'user')) where kind='sessions';
create or replace function public.jpspg_touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now();return new;end;
$$;
drop trigger if exists jpspg_touch on public.jpspg_records;
create trigger jpspg_touch before update on public.jpspg_records for each row execute function public.jpspg_touch_updated_at();
