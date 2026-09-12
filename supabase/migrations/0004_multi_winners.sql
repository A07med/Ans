-- Multi-winner support for Stay Alive and Wamda. Migrations 0001-0003 are
-- already applied remotely and intentionally remain immutable.

alter table public.game_sessions
  add column winner_target_count integer not null default 1
  check (winner_target_count between 1 and 6);

create table public.game_winners (
  id uuid primary key default extensions.gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  winner_position integer check (winner_position > 0),
  selected_at timestamptz not null default now(),
  selected_by uuid references auth.users(id) on delete set null,
  revealed_at timestamptz,
  unique (game_session_id, participant_id),
  unique (game_session_id, winner_position)
);

create index game_winners_session_idx
  on public.game_winners(game_session_id, winner_position, selected_at, id);

alter table public.game_winners enable row level security;
revoke all on table public.game_winners from public, anon, authenticated;

-- Preserve previously completed single-winner history.
insert into public.game_winners(
  game_session_id, participant_id, winner_position, selected_at, revealed_at
)
select
  id,
  winner_participant_id,
  1,
  updated_at,
  case when winner_revealed then updated_at else null end
from public.game_sessions
where winner_participant_id is not null
on conflict (game_session_id, participant_id) do nothing;

create or replace function public.public_event_state_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
  s as (
    select * from public.event_state where id
  ),
  g as (
    select gs.*
    from public.game_sessions gs
    join s on gs.id = s.active_game_session_id
  ),
  alive as (
    select count(*)::integer n
    from public.stay_alive_entries e
    join s on e.game_session_id = s.active_game_session_id
    where e.status in ('alive', 'finalist', 'winner')
  ),
  attempts as (
    select
      count(*) filter (where not false_start)::integer responses,
      count(*) filter (where false_start)::integer false_starts,
      count(*) filter (where valid)::integer valid_count,
      count(*) filter (where cardinality(integrity_flags) > 0)::integer flagged
    from public.wamda_attempts a
    join s on a.game_session_id = s.active_game_session_id
  ),
  signal as (
    select ps.status
    from public.wamda_public_signals ps
    join s on ps.id = s.active_signal_id
  ),
  winner_count as (
    select count(*)::integer n
    from public.game_winners w
    join s on w.game_session_id = s.active_game_session_id
  ),
  revealed_stay as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('name', p.name)
        order by w.selected_at, w.id
      ),
      '[]'::jsonb
    ) winners
    from public.game_winners w
    join g on g.id = w.game_session_id and g.game_id = 'stay_alive' and g.winner_revealed
    join public.participants p on p.id = w.participant_id
  ),
  revealed_wamda as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', p.name,
          'position', w.winner_position,
          'reactionMs', a.reaction_ms
        )
        order by w.winner_position, a.reaction_ms, a.submission_received_at, a.id
      ),
      '[]'::jsonb
    ) winners
    from public.game_winners w
    join g on g.id = w.game_session_id and g.game_id = 'wamda' and g.winner_revealed
    join public.participants p on p.id = w.participant_id
    join public.wamda_attempts a
      on a.game_session_id = w.game_session_id
     and a.participant_id = w.participant_id
  )
select jsonb_build_object(
  'registrationOpen', s.registration_open,
  'currentExperience', s.current_experience,
  'activeGame', s.active_game,
  'activeGameSessionId', s.active_game_session_id,
  'activeSignalId', s.active_signal_id,
  'gameStatus', s.game_status,
  'stageMode', s.stage_mode,
  'registered', (select count(*)::integer from public.participants),
  'connected', 0,
  'winnerTargetCount', coalesce(g.winner_target_count, 1),
  'winnersSelectedCount', coalesce(winner_count.n, 0),
  'stayAliveRemaining', coalesce(alive.n, 0),
  'stayAliveRound', coalesce((
    select max(round_number)
    from public.stay_alive_rounds r
    where r.game_session_id = s.active_game_session_id
  ), 0),
  'stayAliveWinners', case
    when s.active_game = 'stay_alive' and g.winner_revealed then revealed_stay.winners
    else '[]'::jsonb
  end,
  'stayAliveWinner', case
    when s.active_game = 'stay_alive' and g.winner_revealed
      then revealed_stay.winners->0->>'name'
    else null
  end,
  'wamdaReady', (select count(*)::integer from public.participants),
  'wamdaResponses', coalesce(attempts.responses, 0),
  'wamdaFalseStarts', coalesce(attempts.false_starts, 0),
  'wamdaValid', coalesce(attempts.valid_count, 0),
  'wamdaFlagged', coalesce(attempts.flagged, 0),
  'wamdaWinners', case
    when s.active_game = 'wamda' and g.winner_revealed then revealed_wamda.winners
    else '[]'::jsonb
  end,
  'wamdaFastestMs', case
    when s.active_game = 'wamda' and g.winner_revealed
      then (revealed_wamda.winners->0->>'reactionMs')::integer
    else null
  end,
  'wamdaWinner', case
    when s.active_game = 'wamda' and g.winner_revealed
      then revealed_wamda.winners->0->>'name'
    else null
  end,
  'wamdaSignal', coalesce(signal.status, 'idle'),
  'updatedAt', s.updated_at
)
from s
left join g on true
left join alive on true
left join attempts on true
left join signal on true
left join winner_count on true
left join revealed_stay on true
left join revealed_wamda on true;
$$;

revoke all on function public.public_event_state_json() from public, anon, authenticated;

create or replace function public.get_public_event_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select public.public_event_state_json(); $$;

revoke all on function public.get_public_event_state() from public, anon, authenticated;
grant execute on function public.get_public_event_state() to anon, authenticated;

create or replace function public.get_participant_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_name text;
  v_session uuid;
  v_game text;
  v_stay text;
  v_attempt public.wamda_attempts;
  v_winner_revealed boolean := false;
  v_rank integer;
  v_total_ranked integer;
  v_is_winner boolean;
  v_winner_position integer;
begin
  v_pid := public.session_participant_id(p_token);
  if v_pid is null then
    return null;
  end if;

  update public.participant_sessions
  set last_seen_at = now()
  where token_hash = extensions.digest(p_token, 'sha256');

  select name into v_name
  from public.participants
  where id = v_pid;

  select s.active_game_session_id, s.active_game
  into v_session, v_game
  from public.event_state s
  where id;

  select status into v_stay
  from public.stay_alive_entries
  where game_session_id = v_session
    and participant_id = v_pid;

  select * into v_attempt
  from public.wamda_attempts
  where game_session_id = v_session
    and participant_id = v_pid;

  select coalesce(winner_revealed, false) into v_winner_revealed
  from public.game_sessions
  where id = v_session;

  if coalesce(v_winner_revealed, false)
     and v_attempt.id is not null
     and v_attempt.valid
     and not v_attempt.false_start then
    with ranked as (
      select
        id,
        row_number() over (
          order by reaction_ms, submission_received_at, id
        )::integer as result_rank,
        count(*) over ()::integer as total_ranked
      from public.wamda_attempts
      where game_session_id = v_session
        and valid
        and not false_start
    )
    select result_rank, total_ranked
    into v_rank, v_total_ranked
    from ranked
    where id = v_attempt.id;

    select
      exists(
        select 1 from public.game_winners w
        where w.game_session_id = v_session and w.participant_id = v_pid
      ) or game.winner_participant_id = v_pid,
      coalesce(
        (select w.winner_position from public.game_winners w
         where w.game_session_id = v_session and w.participant_id = v_pid),
        case when game.winner_participant_id = v_pid then 1 else null end
      )
    into v_is_winner, v_winner_position
    from public.game_sessions game
    where game.id = v_session;
  end if;

  return jsonb_build_object(
    'participantId', v_pid,
    'name', v_name,
    'stayAliveStatus', case
      when v_game = 'stay_alive' and not coalesce(v_winner_revealed, false) and v_stay = 'winner'
        then 'finalist'
      else v_stay
    end,
    'stayAliveIsWinner', case
      when v_game = 'stay_alive' and coalesce(v_winner_revealed, false)
        then exists(
          select 1 from public.game_winners
          where game_session_id = v_session and participant_id = v_pid
        ) or exists(
          select 1 from public.game_sessions
          where id = v_session and winner_participant_id = v_pid
        )
      else null
    end,
    'wamdaAttempt', case
      when v_attempt.id is null then 'none'
      when v_attempt.false_start then 'false_start'
      when cardinality(v_attempt.integrity_flags) > 0 then 'flagged'
      else 'valid'
    end,
    'reactionMs', v_attempt.reaction_ms,
    'wamdaRank', v_rank,
    'wamdaTotalRanked', v_total_ranked,
    'wamdaIsWinner', v_is_winner,
    'wamdaWinnerPosition', v_winner_position,
    'winnerTargetCount', coalesce((
      select winner_target_count from public.game_sessions where id = v_session
    ), 1),
    'winnerRevealed', coalesce(v_winner_revealed, false)
  );
end;
$$;

revoke all on function public.get_participant_state(text) from public, anon, authenticated;
grant execute on function public.get_participant_state(text) to anon, authenticated;

create or replace function public.execute_stay_alive_round(
  p_target_survivors integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid;
  v_session uuid;
  v_before integer;
  v_round integer;
  v_winner_target integer;
begin
  v_admin := public.require_admin();
  perform pg_advisory_xact_lock(17001);

  if exists(select 1 from public.stay_alive_rounds where request_id = p_request_id) then
    return public.public_event_state_json();
  end if;

  select s.active_game_session_id, g.winner_target_count
  into v_session, v_winner_target
  from public.event_state s
  join public.game_sessions g on g.id = s.active_game_session_id
  where s.id and s.active_game = 'stay_alive'
  for update of s, g;

  if v_session is null then
    raise exception 'stay_alive_not_active';
  end if;
  if exists(select 1 from public.game_winners where game_session_id = v_session) then
    raise exception 'winners_already_selected';
  end if;

  select count(*)::integer into v_before
  from public.stay_alive_entries
  where game_session_id = v_session
    and status in ('alive', 'finalist');

  if p_target_survivors < v_winner_target or p_target_survivors >= v_before then
    raise exception 'invalid_survivor_target';
  end if;

  select coalesce(max(round_number), 0) + 1 into v_round
  from public.stay_alive_rounds
  where game_session_id = v_session;

  with candidates as (
    select participant_id
    from public.stay_alive_entries
    where game_session_id = v_session
      and status in ('alive', 'finalist')
  ),
  survivors as (
    select participant_id
    from candidates
    order by extensions.gen_random_uuid()
    limit p_target_survivors
  )
  update public.stay_alive_entries e
  set
    status = case
      when survivors.participant_id is null then 'eliminated'
      when p_target_survivors <= greatest(3, v_winner_target) then 'finalist'
      else 'alive'
    end,
    eliminated_at = case when survivors.participant_id is null then now() else null end,
    updated_at = now()
  from candidates
  left join survivors on survivors.participant_id = candidates.participant_id
  where e.game_session_id = v_session
    and e.participant_id = candidates.participant_id;

  insert into public.stay_alive_rounds(
    game_session_id, request_id, round_number, number_before,
    number_after, eliminated_count, created_by
  ) values (
    v_session, p_request_id, v_round, v_before,
    p_target_survivors, v_before - p_target_survivors, v_admin
  );

  update public.event_state
  set game_status = case when p_target_survivors = v_winner_target then 'selection' else 'live' end,
      updated_at = now()
  where id;

  insert into public.admin_action_log(
    request_id, action, detail, admin_user_id, game_session_id
  ) values (
    p_request_id, 'stay_alive_round',
    v_before || ' → ' || p_target_survivors,
    v_admin, v_session
  );

  return public.public_event_state_json();
end;
$$;

revoke all on function public.execute_stay_alive_round(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_stay_alive_round(integer, uuid)
  to authenticated;

alter function public.admin_action(text, jsonb, uuid)
  rename to admin_action_before_multi_winners;

revoke all on function public.admin_action_before_multi_winners(text, jsonb, uuid)
  from public, anon, authenticated;

create function public.admin_action(
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_request_id uuid default extensions.gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid;
  v_session uuid;
  v_game text;
  v_target integer;
  v_count integer;
  v_attempt uuid;
  v_participant uuid;
  v_result jsonb;
begin
  -- Existing unrelated actions keep the reviewed 0003 behavior.
  if p_action not in (
    'start_stay_alive', 'open_wamda', 'set_winner_target',
    'select_stay_alive_winner', 'reveal_stay_alive_winner',
    'select_wamda_result', 'reveal_wamda_winner',
    'reset_stay_alive', 'reset_wamda', 'reset_event_state',
    'clear_all_registrations'
  ) then
    return public.admin_action_before_multi_winners(p_action, p_payload, p_request_id);
  end if;

  v_admin := public.require_admin();
  perform pg_advisory_xact_lock(17002);

  if exists(select 1 from public.admin_action_log where request_id = p_request_id) then
    return public.public_event_state_json();
  end if;

  if p_action in ('start_stay_alive', 'open_wamda') then
    v_target := coalesce((p_payload->>'winnerTargetCount')::integer, 1);
    if v_target not between 1 and 6 then
      raise exception 'winner_target_out_of_range';
    end if;
    if p_action = 'start_stay_alive' then
      select count(*)::integer into v_count from public.participants;
      if v_count = 0 then
        raise exception 'no_registered_participants';
      end if;
      if v_target > v_count then
        raise exception 'winner_target_exceeds_participants';
      end if;
    end if;

    v_result := public.admin_action_before_multi_winners(p_action, p_payload, p_request_id);
    select active_game_session_id into v_session
    from public.event_state where id;
    update public.game_sessions
    set winner_target_count = v_target, updated_at = now()
    where id = v_session;
    return public.public_event_state_json();
  end if;

  select s.active_game_session_id, s.active_game, g.winner_target_count
  into v_session, v_game, v_target
  from public.event_state s
  left join public.game_sessions g on g.id = s.active_game_session_id
  where s.id
  for update of s;

  if p_action = 'set_winner_target' then
    v_target := (p_payload->>'winnerTargetCount')::integer;
    if v_session is null or v_target is null or v_target not between 1 and 6 then
      raise exception 'winner_target_out_of_range';
    end if;
    if exists(select 1 from public.game_winners where game_session_id = v_session) then
      raise exception 'winners_already_selected';
    end if;
    if v_game = 'stay_alive' and v_target > (
      select count(*) from public.stay_alive_entries
      where game_session_id = v_session and status in ('alive', 'finalist')
    ) then
      raise exception 'winner_target_exceeds_remaining';
    end if;
    update public.game_sessions
    set winner_target_count = v_target, updated_at = now()
    where id = v_session and not winner_revealed;
    if not found then
      raise exception 'winner_target_locked';
    end if;

  elsif p_action = 'select_stay_alive_winner' then
    if v_game <> 'stay_alive' then
      raise exception 'stay_alive_not_active';
    end if;
    select count(*)::integer into v_count
    from public.stay_alive_entries
    where game_session_id = v_session and status in ('alive', 'finalist');
    if v_count <> v_target then
      raise exception 'winner_target_not_reached';
    end if;
    if exists(select 1 from public.game_winners where game_session_id = v_session) then
      raise exception 'winners_already_selected';
    end if;

    insert into public.game_winners(game_session_id, participant_id, selected_by)
    select v_session, participant_id, v_admin
    from public.stay_alive_entries
    where game_session_id = v_session and status in ('alive', 'finalist')
    order by participant_id;

    select participant_id into v_participant
    from public.game_winners
    where game_session_id = v_session
    order by selected_at, id
    limit 1;

    update public.game_sessions
    set winner_participant_id = v_participant, status = 'selection', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'selection', updated_at = now()
    where id;

  elsif p_action = 'reveal_stay_alive_winner' then
    if v_game <> 'stay_alive' then
      raise exception 'stay_alive_not_active';
    end if;
    select count(*)::integer into v_count
    from public.game_winners
    where game_session_id = v_session;
    if v_count <> v_target then
      raise exception 'winner_selection_incomplete';
    end if;

    update public.game_winners
    set revealed_at = coalesce(revealed_at, now())
    where game_session_id = v_session;
    update public.stay_alive_entries e
    set status = 'winner', updated_at = now()
    where e.game_session_id = v_session
      and exists (
        select 1 from public.game_winners w
        where w.game_session_id = e.game_session_id
          and w.participant_id = e.participant_id
      );
    update public.game_sessions
    set winner_revealed = true, status = 'revealed', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'revealed', updated_at = now()
    where id;

  elsif p_action = 'select_wamda_result' then
    if v_game <> 'wamda' then
      raise exception 'wamda_not_active';
    end if;
    if exists(select 1 from public.game_sessions where id = v_session and winner_revealed) then
      raise exception 'winner_selection_locked';
    end if;
    v_attempt := (p_payload->>'attemptId')::uuid;
    select participant_id into v_participant
    from public.wamda_attempts
    where id = v_attempt and game_session_id = v_session
      and valid and not false_start;
    if v_participant is null then
      raise exception 'valid_result_required';
    end if;

    if exists (
      select 1 from public.game_winners
      where game_session_id = v_session and participant_id = v_participant
    ) then
      delete from public.game_winners
      where game_session_id = v_session and participant_id = v_participant;
    else
      select count(*)::integer into v_count
      from public.game_winners where game_session_id = v_session;
      if v_count >= v_target then
        raise exception 'winner_target_reached';
      end if;

      insert into public.game_winners(
        game_session_id, participant_id, winner_position, selected_by
      )
      select v_session, ranked.participant_id, ranked.result_rank, v_admin
      from (
        select
          participant_id,
          row_number() over (
            order by reaction_ms, submission_received_at, id
          )::integer result_rank
        from public.wamda_attempts
        where game_session_id = v_session and valid and not false_start
      ) ranked
      where ranked.participant_id = v_participant;
    end if;

    update public.wamda_attempts a
    set selected = exists (
      select 1 from public.game_winners w
      where w.game_session_id = a.game_session_id
        and w.participant_id = a.participant_id
    )
    where a.game_session_id = v_session;

    select participant_id into v_participant
    from public.game_winners
    where game_session_id = v_session
    order by winner_position, selected_at, id
    limit 1;
    update public.game_sessions
    set winner_participant_id = v_participant, status = 'selection', updated_at = now()
    where id = v_session;

  elsif p_action = 'reveal_wamda_winner' then
    if v_game <> 'wamda' then
      raise exception 'wamda_not_active';
    end if;
    select count(*)::integer into v_count
    from public.game_winners
    where game_session_id = v_session;
    if v_count <> v_target then
      raise exception 'winner_selection_incomplete';
    end if;

    -- Recompute positions from the final result set so late valid attempts can
    -- never leave a selected winner with a stale rank.
    update public.game_winners
    set winner_position = null
    where game_session_id = v_session;
    with ranked as (
      select
        participant_id,
        row_number() over (
          order by reaction_ms, submission_received_at, id
        )::integer result_rank
      from public.wamda_attempts
      where game_session_id = v_session and valid and not false_start
    )
    update public.game_winners w
    set winner_position = ranked.result_rank
    from ranked
    where w.game_session_id = v_session
      and w.participant_id = ranked.participant_id;

    select participant_id into v_participant
    from public.game_winners
    where game_session_id = v_session
    order by winner_position, selected_at, id
    limit 1;
    update public.game_winners
    set revealed_at = coalesce(revealed_at, now())
    where game_session_id = v_session;
    update public.game_sessions
    set winner_participant_id = v_participant,
        winner_revealed = true, status = 'revealed', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'revealed', updated_at = now()
    where id;

  elsif p_action in (
    'reset_stay_alive', 'reset_wamda', 'reset_event_state',
    'clear_all_registrations'
  ) then
    if p_action = 'clear_all_registrations' then
      delete from public.game_winners where id is not null;
    elsif v_session is not null then
      delete from public.game_winners where game_session_id = v_session;
    end if;
    return public.admin_action_before_multi_winners(p_action, p_payload, p_request_id);
  end if;

  insert into public.admin_action_log(
    request_id, action, detail, admin_user_id, game_session_id
  ) values (
    p_request_id, p_action, coalesce(p_payload::text, ''), v_admin, v_session
  );

  return public.public_event_state_json();
end;
$$;

revoke all on function public.admin_action(text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_action(text, jsonb, uuid)
  to authenticated;

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid;
  v_session uuid;
begin
  v_admin := public.require_admin();
  select active_game_session_id into v_session
  from public.event_state where id;

  return jsonb_build_object(
    'logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'action', action,
          'detail', detail,
          'createdAt', created_at
        ) order by created_at desc
      )
      from (
        select * from public.admin_action_log
        order by created_at desc limit 80
      ) logs
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'attemptId', a.id,
          'participantName', p.name,
          'reactionMs', a.reaction_ms,
          'submissionReceivedAt', a.submission_received_at,
          'flags', a.integrity_flags,
          'selected', w.id is not null,
          'selectedPosition', w.winner_position
        ) order by a.reaction_ms, a.submission_received_at, a.id
      )
      from public.wamda_attempts a
      join public.participants p on p.id = a.participant_id
      left join public.game_winners w
        on w.game_session_id = a.game_session_id
       and w.participant_id = a.participant_id
      where a.game_session_id = v_session
        and a.valid and not a.false_start
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard()
  to authenticated;
