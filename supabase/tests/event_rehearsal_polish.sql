begin;
select plan(38);

insert into auth.users(id, email, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@anas.test', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'viewer@anas.test', now(), now());
insert into public.admin_profiles(user_id, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Test Admin');

select ok(
  not has_function_privilege('anon', 'public.admin_action(text,jsonb,uuid)', 'EXECUTE'),
  'anon cannot call reset or registration deletion actions'
);

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select throws_ok(
  $$select public.admin_action('reset_event_state', '{}'::jsonb, '01000000-0000-4000-8000-000000000001')$$,
  '42501', 'admin_required', 'reset_event_state requires an authorized admin'
);
select throws_ok(
  $$select public.admin_action('clear_all_registrations', '{}'::jsonb, '01000000-0000-4000-8000-000000000002')$$,
  '42501', 'admin_required', 'clear_all_registrations requires an authorized admin'
);
reset role;

insert into public.participants(id, name, phone_normalized)
values
  ('10000000-0000-4000-8000-000000000001', 'First', '+96891111111'),
  ('10000000-0000-4000-8000-000000000002', 'Second', '+96892222222'),
  ('10000000-0000-4000-8000-000000000003', 'Flagged', '+96893333333'),
  ('10000000-0000-4000-8000-000000000004', 'Early', '+96894444444');
insert into public.participant_sessions(participant_id, token_hash)
values
  ('10000000-0000-4000-8000-000000000001', extensions.digest(repeat('1', 64), 'sha256')),
  ('10000000-0000-4000-8000-000000000002', extensions.digest(repeat('2', 64), 'sha256')),
  ('10000000-0000-4000-8000-000000000003', extensions.digest(repeat('3', 64), 'sha256')),
  ('10000000-0000-4000-8000-000000000004', extensions.digest(repeat('4', 64), 'sha256'));

insert into public.game_sessions(id, game_id, status, winner_participant_id, winner_revealed, started_at)
values (
  '20000000-0000-4000-8000-000000000001', 'wamda', 'selection',
  '10000000-0000-4000-8000-000000000001', false, now()
);
insert into public.wamda_signals(id, game_session_id, status, trigger_at, green_at, created_by)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'green', now() - interval '2 seconds', now(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
insert into public.wamda_public_signals(id, game_session_id, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'green'
);
insert into public.wamda_attempts(
  id, game_session_id, signal_id, participant_id, reaction_ms,
  submission_received_at, false_start, valid, integrity_flags, selected
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 316, '2026-09-11 12:00:00.100+00', false, true, '{}', true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 421, '2026-09-11 12:00:00.200+00', false, true, '{}', false),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 421, '2026-09-11 12:00:00.200+00', false, true, '{reaction_under_120ms}', false),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', null, '2026-09-11 12:00:00.050+00', true, false, '{}', false);
update public.event_state
set current_experience = 'wamda', active_game = 'wamda',
    active_game_session_id = '20000000-0000-4000-8000-000000000001',
    active_signal_id = '30000000-0000-4000-8000-000000000001',
    game_status = 'selection', stage_mode = 'wamda';

set local role anon;
select is(public.get_participant_state(repeat('1', 64))->>'wamdaRank', null::text, 'rank is hidden before reveal');
select is(public.get_participant_state(repeat('1', 64))->>'wamdaIsWinner', null::text, 'winner boolean is hidden before reveal');
select is(public.get_participant_state(repeat('1', 64))->>'winnerRevealed', 'false', 'winner selection alone does not leak a reveal');
select is(public.get_participant_state(repeat('2', 64))->>'wamdaRank', null::text, 'nonwinner rank is also hidden before reveal');
reset role;

update public.game_sessions
set winner_revealed = true, status = 'revealed'
where id = '20000000-0000-4000-8000-000000000001';
update public.event_state set game_status = 'revealed' where id;

set local role anon;
select is((public.get_participant_state(repeat('1', 64))->>'wamdaRank')::integer, 1, 'revealed winner gets rank one');
select is(public.get_participant_state(repeat('1', 64))->>'wamdaIsWinner', 'true', 'revealed winner gets isWinner true');
select is((public.get_participant_state(repeat('1', 64))->>'wamdaTotalRanked')::integer, 3, 'revealed winner gets total ranked count');
select is((public.get_participant_state(repeat('2', 64))->>'wamdaRank')::integer, 2, 'nonwinner gets the correct rank');
select is(public.get_participant_state(repeat('2', 64))->>'wamdaIsWinner', 'false', 'nonwinner gets isWinner false after reveal');
select is((public.get_participant_state(repeat('3', 64))->>'wamdaRank')::integer, 3, 'reaction, receipt time, then UUID deterministically break ties');
select is(public.get_participant_state(repeat('3', 64))->>'wamdaAttempt', 'flagged', 'flagged valid attempt remains ranked');
select is(public.get_participant_state(repeat('4', 64))->>'wamdaRank', null::text, 'false start gets no numeric rank');
select is(public.get_participant_state(repeat('4', 64))->>'wamdaIsWinner', null::text, 'false start gets no winner boolean');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select lives_ok(
  $$select public.admin_action('reset_event_state', '{}'::jsonb, '01000000-0000-4000-8000-000000000003')$$,
  'authorized admin can reset event state'
);
reset role;

select is((select current_experience from public.event_state where id), 'lobby', 'reset returns experience to lobby');
select is((select game_status from public.event_state where id), 'idle', 'reset returns game status to idle');
select is((select stage_mode from public.event_state where id), 'lobby', 'reset returns stage to lobby');
select ok((select active_game is null and active_game_session_id is null and active_signal_id is null from public.event_state where id), 'reset clears all active references');
select is((select count(*) from public.participants), 4::bigint, 'reset preserves participants');
select is((select count(*) from public.participant_sessions), 4::bigint, 'reset preserves participant sessions');
select is((select count(*) from public.participant_sessions where revoked_at is not null), 0::bigint, 'reset keeps participant sessions valid');
set local role anon;
select is(public.get_participant_state(repeat('2', 64))->>'name', 'Second', 'registered participant can refresh after reset');
reset role;
select is((select status from public.game_sessions where id = '20000000-0000-4000-8000-000000000001'), 'cancelled', 'reset cancels the active game session');
select is((select status from public.wamda_signals where id = '30000000-0000-4000-8000-000000000001'), 'cancelled', 'reset cancels an active Wamda signal');
select is((select count(*) from public.admin_profiles), 1::bigint, 'reset preserves admin profiles');
select ok(exists(select 1 from public.admin_action_log where action = 'reset_event_state'), 'reset creates an audit log entry');

insert into public.game_sessions(id, game_id, status, started_at)
values ('20000000-0000-4000-8000-000000000002', 'stay_alive', 'live', now());
insert into public.stay_alive_entries(game_session_id, participant_id)
select '20000000-0000-4000-8000-000000000002', id from public.participants;
update public.event_state
set registration_open = true, current_experience = 'stay_alive', active_game = 'stay_alive',
    active_game_session_id = '20000000-0000-4000-8000-000000000002',
    game_status = 'live', stage_mode = 'alive'
where id;

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select lives_ok(
  $$select public.admin_action('clear_all_registrations', '{}'::jsonb, '01000000-0000-4000-8000-000000000004')$$,
  'authorized admin can clear all registrations'
);
reset role;

select is((select count(*) from public.participants), 0::bigint, 'clear registrations deletes every participant');
select is((select count(*) from public.participant_sessions), 0::bigint, 'clear registrations deletes every device session');
select is((select count(*) from public.stay_alive_entries), 0::bigint, 'dependent Stay Alive entries are removed safely');
select is((select count(*) from public.wamda_attempts), 0::bigint, 'dependent Wamda attempts are removed safely');
select is((select count(*) from public.admin_profiles), 1::bigint, 'clear registrations preserves admin profiles');
select ok((select not registration_open and current_experience = 'lobby' and game_status = 'idle' and stage_mode = 'lobby' and active_game is null and active_game_session_id is null and active_signal_id is null from public.event_state where id), 'clear registrations closes registration and returns the event to lobby/idle');
select ok(not exists(select 1 from public.game_sessions where winner_participant_id is not null), 'participant deletion leaves game session foreign keys consistent');
select ok(exists(select 1 from public.admin_action_log where action = 'clear_all_registrations' and detail::jsonb->>'deletedParticipants' = '4'), 'clear registrations records an audit entry with the deleted count');

select * from finish();
rollback;
