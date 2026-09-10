begin;
select plan(22);

select ok((select relrowsecurity from pg_class where oid='public.participants'::regclass), 'participants RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.participant_sessions'::regclass), 'participant sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.event_state'::regclass), 'event state RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.wamda_attempts'::regclass), 'attempts RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.admin_action_log'::regclass), 'admin log RLS enabled');

select ok(not has_table_privilege('anon','public.participants','SELECT'), 'anon cannot list participants or phones');
select ok(not has_table_privilege('anon','public.participants','UPDATE'), 'anon cannot update participants');
select ok(not has_table_privilege('anon','public.participant_sessions','SELECT'), 'anon cannot read sessions');
select ok(not has_table_privilege('anon','public.game_sessions','INSERT'), 'anon cannot create game sessions');
select ok(not has_table_privilege('anon','public.event_state','UPDATE'), 'anon cannot mutate event state');
select ok(not has_table_privilege('anon','public.wamda_signals','SELECT'), 'anon cannot read private signal delay');
select ok(not has_table_privilege('anon','public.wamda_attempts','SELECT'), 'anon cannot read attempts');
select ok(not has_table_privilege('anon','public.admin_action_log','SELECT'), 'anon cannot read admin logs');

select ok(has_function_privilege('anon','public.get_public_event_state()','EXECUTE'), 'anon can rehydrate safe state');
select ok(has_function_privilege('anon','public.register_participant(text,text)','EXECUTE'), 'anon can register through RPC');
select ok(has_function_privilege('anon','public.submit_wamda_attempt(text,uuid,uuid,integer,boolean)','EXECUTE'), 'anon can submit own token-bound attempt');
select ok(not has_function_privilege('anon','public.execute_stay_alive_round(integer,uuid)','EXECUTE'), 'anon cannot run Stay Alive rounds');
select ok(not has_function_privilege('anon','public.fire_wamda_signal(uuid)','EXECUTE'), 'anon cannot fire green');
select ok(not has_function_privilege('anon','public.admin_action(text,jsonb,uuid)','EXECUTE'), 'anon cannot change event or select/reveal winners');
select ok(not has_function_privilege('anon','public.arm_wamda(uuid)','EXECUTE'), 'anon cannot arm Wamda');
select ok(not has_function_privilege('anon','public.get_admin_dashboard()','EXECUTE'), 'anon cannot read admin logs or results');
select ok(not has_function_privilege('anon','public.is_admin()','EXECUTE'), 'anon cannot probe admin allow-list');

select * from finish();
rollback;
