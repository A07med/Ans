begin;
select plan(13);

create temp table registration_fixture (result jsonb not null);
grant select,insert on registration_fixture to anon;

set local role anon;
insert into registration_fixture(result)
select public.register_participant('Original Participant','+96879999991');
reset role;

select ok(
  (select result ? 'token' and char_length(result->>'token')=64 from registration_fixture),
  'A: first registration creates one opaque participant token'
);
select is(
  (select count(*) from public.participants where phone_normalized='+96879999991'),
  1::bigint,
  'B: first registration creates exactly one participant'
);

set local role anon;
select throws_ok(
  $$select public.register_participant('Attacker Rename','+96879999991')$$,
  'P0001',
  'already_registered',
  'C: duplicate phone fails closed with the safe error'
);
reset role;

select is(
  (select name from public.participants where phone_normalized='+96879999991'),
  'Original Participant',
  'D: duplicate registration does not change the participant name'
);
select is(
  (select count(*) from public.participant_sessions s join public.participants p on p.id=s.participant_id where p.phone_normalized='+96879999991' and s.revoked_at is not null),
  0::bigint,
  'E: duplicate registration does not revoke the original session'
);
select is(
  (select count(*) from public.participant_sessions s join public.participants p on p.id=s.participant_id where p.phone_normalized='+96879999991'),
  1::bigint,
  'F: duplicate registration does not create a second session'
);

set local role anon;
select is(
  public.get_participant_state((select result->>'token' from registration_fixture))->>'name',
  'Original Participant',
  'G: the original participant token remains valid'
);
select is(
  public.get_participant_state(repeat('0',64)),
  null::jsonb,
  'H: an invalid participant token is rejected'
);
reset role;

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.participants'::regclass and contype='u' and pg_get_constraintdef(oid) like '%phone_normalized%'
  ),
  'I: the unique phone constraint is authoritative for concurrent inserts'
);
select is(
  (select count(*) from public.participants where phone_normalized='+96879999991'),
  1::bigint,
  'J: only one participant survives duplicate attempts'
);
select ok(
  not has_function_privilege('anon','public.session_participant_id(text)','EXECUTE')
    and not has_function_privilege('anon','public.public_event_state_json()','EXECUTE'),
  'K: anon cannot execute internal SECURITY DEFINER helpers'
);
select ok(
  not has_function_privilege('anon','public.admin_action(text,jsonb,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.get_admin_dashboard()','EXECUTE'),
  'L: anon cannot execute admin SECURITY DEFINER RPCs'
);

set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select throws_ok(
  $$select public.admin_action('open_registration','{}'::jsonb,'22222222-2222-4222-8222-222222222222')$$,
  '42501',
  'admin_required',
  'M: authenticated non-admin users cannot perform admin actions'
);
reset role;

select * from finish();
rollback;
