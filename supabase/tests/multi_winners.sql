begin;
select plan(60);

select has_table('public', 'game_winners', 'normalized game_winners table exists');
select col_type_is('public', 'game_sessions', 'winner_target_count', 'integer', 'game sessions store an integer winner target');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.game_winners'::regclass),
  'RLS is enabled on game_winners'
);
select ok(
  not has_table_privilege('anon', 'public.game_winners', 'SELECT'),
  'anonymous users cannot read winner rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.game_winners', 'SELECT'),
  'authenticated users cannot read winner rows directly'
);
select ok(
  not has_function_privilege('anon', 'public.admin_action(text,jsonb,uuid)', 'EXECUTE'),
  'anonymous users cannot mutate winners'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_action_before_multi_winners(text,jsonb,uuid)', 'EXECUTE'),
  'the previous admin action is an internal helper'
);

insert into auth.users(id, email, created_at, updated_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'multi-admin@anas.test', now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'multi-viewer@anas.test', now(), now());
insert into public.admin_profiles(user_id, display_name)
values ('d0000000-0000-4000-8000-000000000001', 'Multi Admin');

insert into public.participants(id, name, phone_normalized)
select
  ('d1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Participant ' || n,
  '+9689' || lpad(n::text, 7, '0')
from generate_series(1, 8) n;
insert into public.participant_sessions(participant_id, token_hash)
select
  id,
  extensions.digest(repeat(n::text, 64), 'sha256')
from (
  select id, row_number() over (order by id)::integer n
  from public.participants
) ranked_participants;

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.admin_action('start_stay_alive', '{"winnerTargetCount":3}'::jsonb, 'd2000000-0000-4000-8000-000000000001')$$,
  '42501', 'admin_required', 'a non-admin cannot configure or start a multi-winner game'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.admin_action('start_stay_alive', '{"winnerTargetCount":0}'::jsonb, 'd2000000-0000-4000-8000-000000000023')$$,
  'P0001', 'winner_target_out_of_range', 'winner target zero is rejected'
);
select throws_ok(
  $$select public.admin_action('start_stay_alive', '{"winnerTargetCount":7}'::jsonb, 'd2000000-0000-4000-8000-000000000024')$$,
  'P0001', 'winner_target_out_of_range', 'winner target seven is rejected'
);
select lives_ok(
  $$select public.admin_action('start_stay_alive', '{"winnerTargetCount":3}'::jsonb, 'd2000000-0000-4000-8000-000000000002')$$,
  'an admin can start Stay Alive with three winners'
);
reset role;

select is(
  (select winner_target_count from public.game_sessions where id = (select active_game_session_id from public.event_state where id)),
  3,
  'Stay Alive persists the three-winner target'
);
select is((public.get_public_event_state()->>'winnerTargetCount')::integer, 3, 'the public projection exposes only the configured count');
select is(public.get_public_event_state()->'stayAliveWinners', '[]'::jsonb, 'no Stay Alive identities are public before selection');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.admin_action('select_stay_alive_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000003')$$,
  'P0001', 'winner_target_not_reached', 'Stay Alive winners cannot be selected before exactly three remain'
);
select lives_ok(
  $$select public.execute_stay_alive_round(3, 'd2000000-0000-4000-8000-000000000004')$$,
  'Stay Alive can reduce the field to the configured target'
);
reset role;

select is((public.get_public_event_state()->>'stayAliveRemaining')::integer, 3, 'exactly three Stay Alive finalists remain');
select is((select count(*) from public.stay_alive_entries where status = 'finalist'), 3::bigint, 'all three survivors are finalists before reveal');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.admin_action('select_stay_alive_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000005')$$,
  'all remaining Stay Alive finalists can be selected together'
);
reset role;

select is((select count(*) from public.game_winners), 3::bigint, 'three normalized Stay Alive winner rows are stored');
select is(public.get_public_event_state()->'stayAliveWinners', '[]'::jsonb, 'selected Stay Alive identities remain hidden before reveal');
select is(public.get_public_event_state()->>'stayAliveWinner', null::text, 'legacy single-winner identity also remains hidden before reveal');
select is(
  public.get_participant_state((
    select repeat(right(participant_id::text, 1), 64)
    from public.stay_alive_entries where status = 'finalist'
    order by participant_id limit 1
  ))->>'stayAliveStatus',
  'finalist',
  'a selected finalist is not told they won before reveal'
);
select is(
  public.get_participant_state((
    select repeat(right(participant_id::text, 1), 64)
    from public.stay_alive_entries where status = 'finalist'
    order by participant_id limit 1
  ))->>'stayAliveIsWinner',
  null::text,
  'participant-specific winner status is null before reveal'
);

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.admin_action('reveal_stay_alive_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000006')$$,
  'three Stay Alive winners can be revealed'
);
reset role;

select is(jsonb_array_length(public.get_public_event_state()->'stayAliveWinners'), 3, 'three Stay Alive identities appear after reveal');
select is((select count(*) from public.stay_alive_entries where status = 'winner'), 3::bigint, 'all revealed Stay Alive winners receive winner status');
select is(
  public.get_participant_state((
    select repeat(right(participant_id::text, 1), 64)
    from public.stay_alive_entries where status = 'winner'
    order by participant_id limit 1
  ))->>'stayAliveIsWinner',
  'true',
  'a revealed Stay Alive winner learns their own status'
);

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.admin_action('reset_event_state', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000007')$$,
  'reset clears the active multi-winner game'
);
reset role;
select is((select count(*) from public.game_winners), 0::bigint, 'reset clears normalized winner rows');
select is((select count(*) from public.participants), 8::bigint, 'reset preserves registrations');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.admin_action('start_stay_alive', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000008')$$,
  'omitting the winner target preserves single-winner compatibility'
);
reset role;
select is(
  (select winner_target_count from public.game_sessions where id = (select active_game_session_id from public.event_state where id)),
  1,
  'the backwards-compatible winner target defaults to one'
);

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok($$select public.execute_stay_alive_round(1, 'd2000000-0000-4000-8000-000000000009')$$, 'single-winner Stay Alive reaches one finalist');
select lives_ok($$select public.admin_action('select_stay_alive_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000010')$$, 'single-winner selection still works');
select lives_ok($$select public.admin_action('reveal_stay_alive_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000011')$$, 'single-winner reveal still works');
select lives_ok($$select public.admin_action('reset_event_state', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000012')$$, 'single-winner session resets cleanly');
select lives_ok($$select public.admin_action('open_wamda', '{"winnerTargetCount":3}'::jsonb, 'd2000000-0000-4000-8000-000000000013')$$, 'Wamda starts with a three-winner target');
reset role;

insert into public.wamda_signals(id, game_session_id, status, trigger_at, green_at, created_by)
values (
  'd3000000-0000-4000-8000-000000000001',
  (select active_game_session_id from public.event_state where id),
  'closed', now() - interval '2 seconds', now() - interval '1 second',
  'd0000000-0000-4000-8000-000000000001'
);
insert into public.wamda_public_signals(id, game_session_id, status)
values (
  'd3000000-0000-4000-8000-000000000001',
  (select active_game_session_id from public.event_state where id), 'closed'
);
update public.event_state set active_signal_id = 'd3000000-0000-4000-8000-000000000001' where id;
insert into public.wamda_attempts(
  id, game_session_id, signal_id, participant_id, reaction_ms,
  submission_received_at, false_start, valid, integrity_flags
)
select
  ('d4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  (select active_game_session_id from public.event_state where id),
  'd3000000-0000-4000-8000-000000000001',
  ('d1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 5 then null when n = 3 then 320 else 300 + (n * 10) end,
  ('2026-09-12 10:00:00+00'::timestamptz + (case when n = 3 then 2 else n end) * interval '1 millisecond'),
  n = 5,
  n <> 5,
  case when n = 4 then array['human_review']::text[] else '{}'::text[] end
from generate_series(1, 5) n;

select is(public.get_public_event_state()->'wamdaWinners', '[]'::jsonb, 'Wamda identities are hidden before reveal');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000001"}'::jsonb, 'd2000000-0000-4000-8000-000000000014')$$, 'first Wamda winner can be selected');
select lives_ok($$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000002"}'::jsonb, 'd2000000-0000-4000-8000-000000000015')$$, 'second Wamda winner can be selected');
select throws_ok(
  $$select public.admin_action('reveal_wamda_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000016')$$,
  'P0001', 'winner_selection_incomplete', 'Wamda cannot reveal with too few selected winners'
);
select lives_ok($$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000003"}'::jsonb, 'd2000000-0000-4000-8000-000000000017')$$, 'third Wamda winner can be selected');
select throws_ok(
  $$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000004"}'::jsonb, 'd2000000-0000-4000-8000-000000000018')$$,
  'P0001', 'winner_target_reached', 'Wamda cannot select more winners than configured'
);
reset role;
insert into public.game_winners(game_session_id, participant_id, winner_position, selected_by)
values (
  (select active_game_session_id from public.event_state where id),
  'd1000000-0000-4000-8000-000000000004', 4,
  'd0000000-0000-4000-8000-000000000001'
);
set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.admin_action('reveal_wamda_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000025')$$,
  'P0001', 'winner_selection_incomplete', 'Wamda cannot reveal with too many selected winners'
);
reset role;
delete from public.game_winners
where participant_id = 'd1000000-0000-4000-8000-000000000004';
set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000002"}'::jsonb, 'd2000000-0000-4000-8000-000000000019')$$, 'a selected Wamda result can be deselected');
select lives_ok($$select public.admin_action('select_wamda_result', '{"attemptId":"d4000000-0000-4000-8000-000000000004"}'::jsonb, 'd2000000-0000-4000-8000-000000000020')$$, 'a flagged Wamda result can be chosen only by an explicit admin action');
reset role;

select is(
  (select array_agg(winner_position order by winner_position) from public.game_winners),
  array[1,3,4],
  'persisted Wamda positions follow deterministic full-result order'
);
select is(public.get_public_event_state()->'wamdaWinners', '[]'::jsonb, 'selected Wamda identities remain hidden before reveal');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_action('reveal_wamda_winner', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000021')$$, 'Wamda reveals exactly three selected winners');
reset role;

select is(jsonb_array_length(public.get_public_event_state()->'wamdaWinners'), 3, 'three Wamda winner identities are public after reveal');
select is(public.get_participant_state(repeat('1', 64))->>'wamdaIsWinner', 'true', 'a Wamda winner learns only their own winner state after reveal');
select is((public.get_participant_state(repeat('1', 64))->>'wamdaWinnerPosition')::integer, 1, 'a Wamda winner receives their persisted position');
select is(public.get_participant_state(repeat('2', 64))->>'wamdaIsWinner', 'false', 'a valid nonwinner receives false only after reveal');
select is((public.get_participant_state(repeat('2', 64))->>'wamdaRank')::integer, 2, 'a nonwinner receives deterministic rank after reveal');
select is(public.get_participant_state(repeat('5', 64))->>'wamdaRank', null::text, 'a false start never receives a numeric rank');

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000001';
select lives_ok($$select public.admin_action('clear_all_registrations', '{}'::jsonb, 'd2000000-0000-4000-8000-000000000022')$$, 'clear registrations remains valid with game_winners present');
reset role;
select is((select count(*) from public.game_winners), 0::bigint, 'clear registrations removes dependent winner rows');
select is((select count(*) from public.participants), 0::bigint, 'clear registrations still removes participants');
select is((select count(*) from public.admin_profiles), 1::bigint, 'clear registrations preserves the admin account');

select * from finish();
rollback;
