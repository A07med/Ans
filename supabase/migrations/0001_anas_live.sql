-- أُنس Live — complete fresh-project schema, security policies and game RPCs.
-- Prepared for owner review. Do not apply to production without approval.
create extension if not exists pgcrypto;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone_normalized text not null unique check (phone_normalized ~ '^\+968[79][0-9]{7}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.participant_sessions (
  id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.participants(id) on delete cascade,
  token_hash bytea not null unique, expires_at timestamptz not null default (now() + interval '18 hours'),
  last_seen_at timestamptz not null default now(), revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(), game_id text not null check (game_id in ('stay_alive','wamda')),
  status text not null default 'idle' check (status in ('idle','live','paused','selection','revealed','complete','cancelled')),
  winner_participant_id uuid references public.participants(id) on delete set null, winner_revealed boolean not null default false,
  started_at timestamptz, closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.event_state (
  id boolean primary key default true check (id), registration_open boolean not null default true,
  current_experience text not null default 'lobby' check (current_experience in ('lobby','stay_alive','intermission','wamda','end')),
  active_game text check (active_game in ('stay_alive','wamda')), active_game_session_id uuid references public.game_sessions(id), active_signal_id uuid,
  game_status text not null default 'idle' check (game_status in ('idle','live','paused','selection','revealed','complete')),
  stage_mode text not null default 'lobby' check (stage_mode in ('lobby','alive','wamda','end')), updated_at timestamptz not null default now()
);
insert into public.event_state (id) values (true);
create table public.stay_alive_entries (
  game_session_id uuid not null references public.game_sessions(id) on delete cascade, participant_id uuid not null references public.participants(id) on delete cascade,
  status text not null default 'alive' check (status in ('alive','eliminated','finalist','winner')), eliminated_at timestamptz,
  updated_at timestamptz not null default now(), primary key (game_session_id,participant_id)
);
create table public.stay_alive_rounds (
  id uuid primary key default gen_random_uuid(), game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  request_id uuid not null unique, round_number integer not null check (round_number>0), number_before integer not null check (number_before>0),
  number_after integer not null check (number_after>0), eliminated_count integer not null check (eliminated_count>=0),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(game_session_id,round_number)
);
create table public.wamda_signals (
  id uuid primary key default gen_random_uuid(), game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  status text not null check (status in ('red','green','cancelled','closed')), trigger_at timestamptz not null, green_at timestamptz,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Safe Realtime projection: the secret trigger time never reaches participant clients.
create table public.wamda_public_signals (
  id uuid primary key references public.wamda_signals(id) on delete cascade, game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  status text not null check (status in ('red','green','cancelled','closed')), updated_at timestamptz not null default now()
);
create table public.wamda_attempts (
  id uuid primary key default gen_random_uuid(), game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  signal_id uuid not null references public.wamda_signals(id) on delete cascade, participant_id uuid not null references public.participants(id) on delete cascade,
  reaction_ms integer, submission_received_at timestamptz not null default now(), false_start boolean not null, valid boolean not null,
  integrity_flags text[] not null default '{}', selected boolean not null default false, unique(game_session_id,participant_id)
);
create table public.admin_action_log (
  id uuid primary key default gen_random_uuid(), request_id uuid unique, action text not null, detail text not null default '',
  admin_user_id uuid references auth.users(id), game_session_id uuid references public.game_sessions(id) on delete set null, created_at timestamptz not null default now()
);
create index participant_sessions_participant_idx on public.participant_sessions(participant_id,expires_at);
create index game_sessions_game_status_idx on public.game_sessions(game_id,status,created_at desc);
create index stay_alive_entries_status_idx on public.stay_alive_entries(game_session_id,status);
create index wamda_attempts_results_idx on public.wamda_attempts(game_session_id,valid,false_start,reaction_ms,submission_received_at,id);
create index admin_action_log_created_idx on public.admin_action_log(created_at desc);

alter table public.participants enable row level security; alter table public.participant_sessions enable row level security;
alter table public.admin_profiles enable row level security; alter table public.game_sessions enable row level security;
alter table public.event_state enable row level security; alter table public.stay_alive_entries enable row level security;
alter table public.stay_alive_rounds enable row level security; alter table public.wamda_signals enable row level security;
alter table public.wamda_public_signals enable row level security; alter table public.wamda_attempts enable row level security;
alter table public.admin_action_log enable row level security;
create policy event_state_public_read on public.event_state for select to anon,authenticated using(true);
create policy wamda_public_signal_read on public.wamda_public_signals for select to anon,authenticated using(true);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.admin_profiles where user_id=auth.uid() and active); $$;
revoke all on function public.is_admin() from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated;
create or replace function public.require_admin() returns uuid language plpgsql stable security definer set search_path=public,auth as $$
declare v_uid uuid:=auth.uid(); begin
  if v_uid is null or not exists(select 1 from public.admin_profiles where user_id=v_uid and active) then raise exception 'admin_required' using errcode='42501'; end if;
  return v_uid;
end; $$;
revoke all on function public.require_admin() from public,anon,authenticated;

create or replace function public.public_event_state_json() returns jsonb language sql stable security definer set search_path=public as $$
with s as (select * from public.event_state where id), g as (select gs.* from public.game_sessions gs join s on gs.id=s.active_game_session_id),
alive as (select count(*)::int n from public.stay_alive_entries e join s on e.game_session_id=s.active_game_session_id where e.status in ('alive','finalist','winner')),
attempts as (select count(*) filter(where not false_start)::int responses,count(*) filter(where false_start)::int false_starts,count(*) filter(where valid)::int valid_count,count(*) filter(where cardinality(integrity_flags)>0)::int flagged,min(reaction_ms) filter(where selected)::int selected_ms from public.wamda_attempts a join s on a.game_session_id=s.active_game_session_id),
signal as (select ps.status from public.wamda_public_signals ps join s on ps.id=s.active_signal_id),
winner as (select p.name from g join public.participants p on p.id=g.winner_participant_id where g.winner_revealed)
select jsonb_build_object('registrationOpen',s.registration_open,'currentExperience',s.current_experience,'activeGame',s.active_game,
'activeGameSessionId',s.active_game_session_id,'activeSignalId',s.active_signal_id,'gameStatus',s.game_status,'stageMode',s.stage_mode,
'registered',(select count(*)::int from public.participants),'connected',0,'stayAliveRemaining',coalesce((select n from alive),0),
'stayAliveRound',coalesce((select max(round_number) from public.stay_alive_rounds r where r.game_session_id=s.active_game_session_id),0),
'stayAliveWinner',case when s.active_game='stay_alive' then (select name from winner) else null end,'wamdaReady',(select count(*)::int from public.participants),
'wamdaResponses',coalesce(attempts.responses,0),'wamdaFalseStarts',coalesce(attempts.false_starts,0),'wamdaValid',coalesce(attempts.valid_count,0),
'wamdaFlagged',coalesce(attempts.flagged,0),'wamdaFastestMs',case when g.winner_revealed then attempts.selected_ms else null end,
'wamdaWinner',case when s.active_game='wamda' then (select name from winner) else null end,'wamdaSignal',coalesce(signal.status,'idle'),'updatedAt',s.updated_at)
from s left join g on true left join attempts on true left join signal on true; $$;
revoke all on function public.public_event_state_json() from public,anon,authenticated;
create or replace function public.get_public_event_state() returns jsonb language sql stable security definer set search_path=public as $$ select public.public_event_state_json(); $$;
revoke all on function public.get_public_event_state() from public,anon,authenticated;
grant execute on function public.get_public_event_state() to anon,authenticated;

create or replace function public.register_participant(p_name text,p_phone text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_participant public.participants; v_token text; v_open boolean; begin
  select registration_open into v_open from public.event_state where id for share; if not v_open then raise exception 'registration_closed'; end if;
  p_name:=regexp_replace(btrim(p_name),'\s+',' ','g');
  if char_length(p_name) not between 2 and 80 or p_phone !~ '^\+968[79][0-9]{7}$' then raise exception 'invalid_registration'; end if;
  begin
    insert into public.participants(name,phone_normalized) values(p_name,p_phone) returning * into v_participant;
  exception when unique_violation then
    raise exception 'already_registered' using errcode='P0001';
  end;
  v_token:=encode(gen_random_bytes(32),'hex'); insert into public.participant_sessions(participant_id,token_hash) values(v_participant.id,digest(v_token,'sha256'));
  insert into public.admin_action_log(action,detail) values('participant_registered','Participant registered');
  update public.event_state set updated_at=now() where id;
  return jsonb_build_object('token',v_token,'participantId',v_participant.id,'name',v_participant.name);
end; $$;
revoke all on function public.register_participant(text,text) from public,anon,authenticated;
grant execute on function public.register_participant(text,text) to anon,authenticated;
create or replace function public.session_participant_id(p_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin if p_token is null or char_length(p_token)<>64 then return null; end if;
select participant_id into v_id from public.participant_sessions where token_hash=digest(p_token,'sha256') and revoked_at is null and expires_at>now(); return v_id; end; $$;
revoke all on function public.session_participant_id(text) from public,anon,authenticated;
create or replace function public.get_participant_state(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pid uuid; v_name text; v_session uuid; v_stay text; v_attempt public.wamda_attempts; begin
v_pid:=public.session_participant_id(p_token); if v_pid is null then return null; end if;
update public.participant_sessions set last_seen_at=now() where token_hash=digest(p_token,'sha256'); select name into v_name from public.participants where id=v_pid;
select active_game_session_id into v_session from public.event_state where id; select status into v_stay from public.stay_alive_entries where game_session_id=v_session and participant_id=v_pid;
select * into v_attempt from public.wamda_attempts where game_session_id=v_session and participant_id=v_pid;
return jsonb_build_object('participantId',v_pid,'name',v_name,'stayAliveStatus',v_stay,'wamdaAttempt',case when v_attempt.id is null then 'none' when v_attempt.false_start then 'false_start' when cardinality(v_attempt.integrity_flags)>0 then 'flagged' else 'valid' end,'reactionMs',v_attempt.reaction_ms); end; $$;
revoke all on function public.get_participant_state(text) from public,anon,authenticated;
grant execute on function public.get_participant_state(text) to anon,authenticated;

create or replace function public.execute_stay_alive_round(p_target_survivors integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid; v_session uuid; v_before integer; v_round integer; begin
v_admin:=public.require_admin(); perform pg_advisory_xact_lock(17001); if exists(select 1 from public.stay_alive_rounds where request_id=p_request_id) then return public.public_event_state_json(); end if;
select active_game_session_id into v_session from public.event_state where id and active_game='stay_alive' for update; if v_session is null then raise exception 'stay_alive_not_active'; end if;
select count(*)::int into v_before from public.stay_alive_entries where game_session_id=v_session and status in ('alive','finalist');
if p_target_survivors<1 or p_target_survivors>=v_before then raise exception 'invalid_survivor_target'; end if;
select coalesce(max(round_number),0)+1 into v_round from public.stay_alive_rounds where game_session_id=v_session;
with candidates as (select participant_id from public.stay_alive_entries where game_session_id=v_session and status in ('alive','finalist')),
survivors as (select participant_id from candidates order by gen_random_uuid() limit p_target_survivors)
update public.stay_alive_entries e set status=case when s.participant_id is null then 'eliminated' when p_target_survivors<=3 then 'finalist' else 'alive' end,
eliminated_at=case when s.participant_id is null then now() else null end,updated_at=now()
from candidates c left join survivors s on s.participant_id=c.participant_id where e.game_session_id=v_session and e.participant_id=c.participant_id;
insert into public.stay_alive_rounds(game_session_id,request_id,round_number,number_before,number_after,eliminated_count,created_by) values(v_session,p_request_id,v_round,v_before,p_target_survivors,v_before-p_target_survivors,v_admin);
update public.event_state set game_status=case when p_target_survivors<=3 then 'selection' else 'live' end,updated_at=now() where id;
insert into public.admin_action_log(request_id,action,detail,admin_user_id,game_session_id) values(p_request_id,'stay_alive_round',v_before||' → '||p_target_survivors,v_admin,v_session);
return public.public_event_state_json(); end; $$;
revoke all on function public.execute_stay_alive_round(integer,uuid) from public,anon,authenticated;
grant execute on function public.execute_stay_alive_round(integer,uuid) to authenticated;

create or replace function public.admin_action(p_action text,p_payload jsonb default '{}'::jsonb,p_request_id uuid default gen_random_uuid()) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid; v_session uuid; v_winner uuid; v_count integer; v_attempt uuid; begin
v_admin:=public.require_admin(); perform pg_advisory_xact_lock(17002); if exists(select 1 from public.admin_action_log where request_id=p_request_id) then return public.public_event_state_json(); end if;
select active_game_session_id into v_session from public.event_state where id for update;
if p_action='open_registration' then update public.event_state set registration_open=true,updated_at=now() where id;
elsif p_action='close_registration' then update public.event_state set registration_open=false,updated_at=now() where id;
elsif p_action='start_stay_alive' then if not exists(select 1 from public.participants) then raise exception 'no_registered_participants'; end if; insert into public.game_sessions(game_id,status,started_at) values('stay_alive','live',now()) returning id into v_session; insert into public.stay_alive_entries(game_session_id,participant_id) select v_session,id from public.participants; update public.event_state set current_experience='stay_alive',active_game='stay_alive',active_game_session_id=v_session,active_signal_id=null,game_status='live',stage_mode='alive',updated_at=now() where id;
elsif p_action='pause' then update public.game_sessions set status='paused',updated_at=now() where id=v_session; update public.event_state set game_status='paused',updated_at=now() where id;
elsif p_action='return_lobby' then update public.event_state set current_experience='lobby',active_game=null,active_game_session_id=null,active_signal_id=null,game_status='idle',stage_mode='lobby',updated_at=now() where id;
elsif p_action='select_stay_alive_winner' then if not exists(select 1 from public.game_sessions where id=v_session and game_id='stay_alive') then raise exception 'stay_alive_not_active'; end if; select count(*) into v_count from public.stay_alive_entries where game_session_id=v_session and status in ('alive','finalist'); if v_count<>1 then raise exception 'exactly_one_survivor_required'; end if; select participant_id into v_winner from public.stay_alive_entries where game_session_id=v_session and status in ('alive','finalist') limit 1; update public.stay_alive_entries set status='winner',updated_at=now() where game_session_id=v_session and participant_id=v_winner; update public.game_sessions set winner_participant_id=v_winner,status='selection',updated_at=now() where id=v_session; update public.event_state set game_status='selection',updated_at=now() where id;
elsif p_action='reveal_stay_alive_winner' then if not exists(select 1 from public.game_sessions where id=v_session and game_id='stay_alive' and winner_participant_id is not null) then raise exception 'winner_not_selected'; end if; update public.game_sessions set winner_revealed=true,status='revealed',updated_at=now() where id=v_session; update public.event_state set game_status='revealed',updated_at=now() where id;
elsif p_action='reset_stay_alive' then update public.game_sessions set status='cancelled',updated_at=now() where id=v_session and game_id='stay_alive'; update public.event_state set current_experience='lobby',active_game=null,active_game_session_id=null,game_status='idle',stage_mode='lobby',updated_at=now() where id;
elsif p_action='open_wamda' then insert into public.game_sessions(game_id,status,started_at) values('wamda','live',now()) returning id into v_session; update public.event_state set current_experience='wamda',active_game='wamda',active_game_session_id=v_session,active_signal_id=null,game_status='live',stage_mode='wamda',updated_at=now() where id;
elsif p_action='cancel_arm' then update public.wamda_signals set status='cancelled',updated_at=now() where id=(select active_signal_id from public.event_state where id) and status='red'; update public.wamda_public_signals set status='cancelled',updated_at=now() where id=(select active_signal_id from public.event_state where id); update public.event_state set active_signal_id=null,updated_at=now() where id;
elsif p_action='close_wamda' then update public.wamda_signals set status='closed',updated_at=now() where id=(select active_signal_id from public.event_state where id); update public.wamda_public_signals set status='closed',updated_at=now() where id=(select active_signal_id from public.event_state where id); update public.game_sessions set status='selection',closed_at=now(),updated_at=now() where id=v_session; update public.event_state set game_status='selection',updated_at=now() where id;
elsif p_action='select_wamda_result' then v_attempt:=(p_payload->>'attemptId')::uuid; select participant_id into v_winner from public.wamda_attempts where id=v_attempt and game_session_id=v_session and valid and not false_start; if v_winner is null then raise exception 'valid_result_required'; end if; update public.wamda_attempts set selected=(id=v_attempt) where game_session_id=v_session; update public.game_sessions set winner_participant_id=v_winner,status='selection',updated_at=now() where id=v_session;
elsif p_action='reveal_wamda_winner' then if not exists(select 1 from public.game_sessions where id=v_session and game_id='wamda' and winner_participant_id is not null) then raise exception 'winner_not_selected'; end if; update public.game_sessions set winner_revealed=true,status='revealed',updated_at=now() where id=v_session; update public.event_state set game_status='revealed',updated_at=now() where id;
elsif p_action='reset_wamda' then update public.game_sessions set status='cancelled',updated_at=now() where id=v_session and game_id='wamda'; update public.event_state set current_experience='lobby',active_game=null,active_game_session_id=null,active_signal_id=null,game_status='idle',stage_mode='lobby',updated_at=now() where id;
elsif p_action='full_reset' then update public.participant_sessions set revoked_at=now() where revoked_at is null; delete from public.participants; update public.event_state set registration_open=false,current_experience='lobby',active_game=null,active_game_session_id=null,active_signal_id=null,game_status='idle',stage_mode='lobby',updated_at=now() where id;
else raise exception 'unknown_admin_action'; end if;
insert into public.admin_action_log(request_id,action,detail,admin_user_id,game_session_id) values(p_request_id,p_action,coalesce(p_payload::text,''),v_admin,v_session); return public.public_event_state_json(); end; $$;
revoke all on function public.admin_action(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.admin_action(text,jsonb,uuid) to authenticated;

create or replace function public.arm_wamda(p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid; v_session uuid; v_signal uuid; v_trigger timestamptz; begin
v_admin:=public.require_admin(); perform pg_advisory_xact_lock(17003); select active_game_session_id into v_session from public.event_state where id and active_game='wamda' for update;
if v_session is null then raise exception 'wamda_not_open'; end if; if exists(select 1 from public.wamda_signals where game_session_id=v_session and status in ('red','green')) then raise exception 'signal_already_active'; end if;
v_trigger:=now()+((2+floor(random()*5))::text||' seconds')::interval; insert into public.wamda_signals(game_session_id,status,trigger_at,created_by) values(v_session,'red',v_trigger,v_admin) returning id into v_signal;
insert into public.wamda_public_signals(id,game_session_id,status) values(v_signal,v_session,'red'); update public.event_state set active_signal_id=v_signal,game_status='live',updated_at=now() where id;
insert into public.admin_action_log(request_id,action,detail,admin_user_id,game_session_id) values(p_request_id,'wamda_armed','Random server delay selected',v_admin,v_session);
return jsonb_build_object('signalId',v_signal,'triggerAt',v_trigger); end; $$;
revoke all on function public.arm_wamda(uuid) from public,anon,authenticated;
grant execute on function public.arm_wamda(uuid) to authenticated;
create or replace function public.fire_wamda_signal(p_signal_id uuid) returns boolean language plpgsql security definer set search_path=public,auth as $$
declare v_session uuid; begin if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
update public.wamda_signals set status='green',green_at=now(),updated_at=now() where id=p_signal_id and status='red' and trigger_at<=now() returning game_session_id into v_session;
if v_session is null then return false; end if; update public.wamda_public_signals set status='green',updated_at=now() where id=p_signal_id; update public.event_state set updated_at=now() where id and active_signal_id=p_signal_id;
insert into public.admin_action_log(action,detail,game_session_id) values('wamda_green','Authoritative green signal fired',v_session); return true; end; $$;
revoke all on function public.fire_wamda_signal(uuid) from public,anon,authenticated; grant execute on function public.fire_wamda_signal(uuid) to service_role;

create or replace function public.submit_wamda_attempt(p_token text,p_game_session_id uuid,p_signal_id uuid,p_reaction_ms integer,p_false_start boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pid uuid; v_signal public.wamda_signals; v_false boolean; v_flags text[]:='{}'; v_valid boolean:=false; begin
v_pid:=public.session_participant_id(p_token); if v_pid is null then raise exception 'invalid_participant_session' using errcode='42501'; end if;
if not exists(select 1 from public.event_state where id and active_game='wamda' and active_game_session_id=p_game_session_id and active_signal_id=p_signal_id) then raise exception 'wrong_session_or_signal'; end if;
select * into v_signal from public.wamda_signals where id=p_signal_id and game_session_id=p_game_session_id; if v_signal.id is null or v_signal.status in ('cancelled','closed') then raise exception 'signal_not_active'; end if;
v_false:=p_false_start or v_signal.status<>'green'; if not v_false then if p_reaction_ms is null or p_reaction_ms<=0 or p_reaction_ms>10000 then raise exception 'invalid_reaction_ms'; end if; v_valid:=true; if p_reaction_ms<120 then v_flags:=array_append(v_flags,'reaction_under_120ms'); end if; if now()-v_signal.green_at>interval '15 seconds' then v_flags:=array_append(v_flags,'late_submission'); end if; end if;
insert into public.wamda_attempts(game_session_id,signal_id,participant_id,reaction_ms,false_start,valid,integrity_flags) values(p_game_session_id,p_signal_id,v_pid,case when v_false then null else p_reaction_ms end,v_false,v_valid,v_flags);
return public.get_participant_state(p_token); exception when unique_violation then raise exception 'attempt_already_submitted' using errcode='23505'; end; $$;
revoke all on function public.submit_wamda_attempt(text,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.submit_wamda_attempt(text,uuid,uuid,integer,boolean) to anon,authenticated;
create or replace function public.get_admin_dashboard() returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_admin uuid; v_session uuid; begin v_admin:=public.require_admin(); select active_game_session_id into v_session from public.event_state where id;
return jsonb_build_object('logs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'detail',detail,'createdAt',created_at) order by created_at desc) from (select * from public.admin_action_log order by created_at desc limit 80) l),'[]'::jsonb),
'results',coalesce((select jsonb_agg(jsonb_build_object('attemptId',a.id,'participantName',p.name,'reactionMs',a.reaction_ms,'flags',a.integrity_flags,'selected',a.selected) order by a.reaction_ms,a.submission_received_at,a.id) from public.wamda_attempts a join public.participants p on p.id=a.participant_id where a.game_session_id=v_session and a.valid and not a.false_start),'[]'::jsonb)); end; $$;
revoke all on function public.get_admin_dashboard() from public,anon,authenticated;
grant execute on function public.get_admin_dashboard() to authenticated;

do $$ begin alter publication supabase_realtime add table public.event_state; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.wamda_public_signals; exception when duplicate_object then null; end $$;
revoke all on all tables in schema public from anon,authenticated;
grant select on public.event_state,public.wamda_public_signals to anon,authenticated;
