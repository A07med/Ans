begin;
select plan(27);

select ok(
  not has_function_privilege('anon', 'public.admin_action(text,jsonb,uuid)', 'EXECUTE'),
  'anonymous users cannot call the public admin action RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_action_before_rehearsal_bugfix(text,jsonb,uuid)', 'EXECUTE'),
  'the renamed implementation is an internal helper'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_action(text,jsonb,uuid)', 'EXECUTE'),
  'authenticated users can reach the guarded admin action RPC'
);

insert into auth.users(id, email, created_at, updated_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'bugfix-admin@anas.test', now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'bugfix-viewer@anas.test', now(), now());
insert into public.admin_profiles(user_id, display_name)
values ('c0000000-0000-4000-8000-000000000001', 'Bugfix Admin');

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.admin_action('clear_all_registrations', '{}'::jsonb, 'c1000000-0000-4000-8000-000000000001')$$,
  '42501', 'admin_required', 'a non-admin cannot clear registrations'
);
reset role;

insert into public.participants(id, name, phone_normalized)
values
  ('c2000000-0000-4000-8000-000000000001', 'Clear One', '+96891111111'),
  ('c2000000-0000-4000-8000-000000000002', 'Clear Two', '+96892222222');
insert into public.participant_sessions(participant_id, token_hash)
values
  ('c2000000-0000-4000-8000-000000000001', extensions.digest(repeat('a', 64), 'sha256')),
  ('c2000000-0000-4000-8000-000000000002', extensions.digest(repeat('b', 64), 'sha256'));

insert into public.game_sessions(id, game_id, status, winner_participant_id, started_at)
values
  ('c3000000-0000-4000-8000-000000000001', 'stay_alive', 'selection', 'c2000000-0000-4000-8000-000000000001', now()),
  ('c3000000-0000-4000-8000-000000000002', 'wamda', 'live', 'c2000000-0000-4000-8000-000000000002', now());
insert into public.stay_alive_entries(game_session_id, participant_id, status)
values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'winner'),
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'eliminated');
insert into public.wamda_signals(id, game_session_id, status, trigger_at, created_by)
values ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'red', now() + interval '5 seconds', 'c0000000-0000-4000-8000-000000000001');
insert into public.wamda_public_signals(id, game_session_id, status)
values ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'red');
insert into public.wamda_attempts(game_session_id, signal_id, participant_id, reaction_ms, false_start, valid)
values ('c3000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 350, false, true);
update public.event_state
set registration_open = true,
    current_experience = 'wamda',
    active_game = 'wamda',
    active_game_session_id = 'c3000000-0000-4000-8000-000000000002',
    active_signal_id = 'c4000000-0000-4000-8000-000000000001',
    game_status = 'live',
    stage_mode = 'wamda'
where id;

-- The real PostgREST log proved SQLSTATE 21000. Preserve a regression marker
-- for the exact unsafe 0002 statement while exercising the replacement below.
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000001';
select ok(
  pg_get_functiondef('public.admin_action_before_rehearsal_bugfix(text,jsonb,uuid)'::regprocedure)
    ~ 'update public\.participant_sessions[[:space:]]+set revoked_at = coalesce\(revoked_at, now\(\)\);',
  'the retained 0002 definition contains the exact unqualified UPDATE rejected by PostgREST safeupdate'
);

create temp table clear_result(sequence integer, payload jsonb);
select lives_ok(
  $$insert into clear_result values (1, public.admin_action('clear_all_registrations', '{}'::jsonb, 'c1000000-0000-4000-8000-000000000003'))$$,
  '0003 clears registrations with participant sessions and game history present'
);
select is((select (payload->>'deletedParticipants')::integer from clear_result where sequence = 1), 2, 'the RPC returns the deleted participant count');
select is((select count(*) from public.participants), 0::bigint, 'all participants are removed');
select is((select count(*) from public.participant_sessions), 0::bigint, 'all participant sessions are removed');
select is((select count(*) from public.stay_alive_entries), 0::bigint, 'all Stay Alive participant entries are removed');
select is((select count(*) from public.wamda_attempts), 0::bigint, 'all Wamda attempts are removed');
select ok(not exists(select 1 from public.game_sessions where winner_participant_id is not null), 'winner participant references are cleared');
select is((select status from public.game_sessions where id = 'c3000000-0000-4000-8000-000000000002'), 'cancelled', 'the active game is cancelled');
select is((select status from public.wamda_signals where id = 'c4000000-0000-4000-8000-000000000001'), 'cancelled', 'the private Wamda signal is cancelled');
select is((select status from public.wamda_public_signals where id = 'c4000000-0000-4000-8000-000000000001'), 'cancelled', 'the public Wamda projection is cancelled');
select ok(
  (select not registration_open
      and current_experience = 'lobby'
      and active_game is null
      and active_game_session_id is null
      and active_signal_id is null
      and game_status = 'idle'
      and stage_mode = 'lobby'
   from public.event_state where id),
  'event state returns to a closed lobby and idle state'
);
select is((select count(*) from public.admin_profiles), 1::bigint, 'the admin profile is preserved');
select is((select count(*) from auth.users), 2::bigint, 'organizer and non-admin auth users are preserved');
select ok(
  exists(select 1 from public.admin_action_log where request_id = 'c1000000-0000-4000-8000-000000000003' and detail::jsonb->>'deletedParticipants' = '2'),
  'the destructive action is audited with its deleted count'
);
select is((select count(*) from public.participant_sessions), 0::bigint, 'the required final participant-session count is zero');

select lives_ok(
  $$insert into clear_result values (2, public.admin_action('clear_all_registrations', '{}'::jsonb, 'c1000000-0000-4000-8000-000000000004'))$$,
  'repeating clear with no participants is safe'
);
select is((select (payload->>'deletedParticipants')::integer from clear_result where sequence = 2), 0, 'the repeated clear reports zero deleted participants');
select is((select count(*) from public.participants), 0::bigint, 'repeated clear leaves participant count at zero');
select ok(
  exists(select 1 from public.admin_action_log where request_id = 'c1000000-0000-4000-8000-000000000004' and detail::jsonb->>'deletedParticipants' = '0'),
  'the idempotent repeat is audited'
);
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.admin_action(text,jsonb,uuid)'::regprocedure),
  'search_path=public, auth',
  'the replacement keeps a fixed SECURITY DEFINER search path'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.admin_action(text,jsonb,uuid)'::regprocedure),
  'the replacement remains SECURITY DEFINER'
);
select is((select count(*) from public.admin_action_log where action = 'clear_all_registrations'), 2::bigint, 'exactly the two successful clear calls were audited');

select * from finish();
rollback;
