-- Event-night rehearsal polish. 0001 has already been applied remotely;
-- keep this migration backwards-safe and independently reviewable.

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
  v_stay text;
  v_attempt public.wamda_attempts;
  v_winner_revealed boolean := false;
  v_rank integer;
  v_total_ranked integer;
  v_is_winner boolean;
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

  select active_game_session_id into v_session
  from public.event_state
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
  where id = v_session
    and game_id = 'wamda';

  -- Ranking is computed only after the authoritative reveal. Selection alone
  -- deliberately leaves every participant-specific result field null.
  if coalesce(v_winner_revealed, false)
     and v_attempt.id is not null
     and v_attempt.valid
     and not v_attempt.false_start then
    with ranked as (
      select
        id,
        participant_id,
        row_number() over (
          order by reaction_ms, submission_received_at, id
        )::integer as result_rank,
        count(*) over ()::integer as total_ranked
      from public.wamda_attempts
      where game_session_id = v_session
        and valid
        and not false_start
    )
    select
      ranked.result_rank,
      ranked.total_ranked,
      ranked.participant_id = game.winner_participant_id
    into v_rank, v_total_ranked, v_is_winner
    from ranked
    join public.game_sessions game on game.id = v_session
    where ranked.id = v_attempt.id;
  end if;

  return jsonb_build_object(
    'participantId', v_pid,
    'name', v_name,
    'stayAliveStatus', v_stay,
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
    'winnerRevealed', coalesce(v_winner_revealed, false)
  );
end;
$$;

revoke all on function public.get_participant_state(text) from public, anon, authenticated;
grant execute on function public.get_participant_state(text) to anon, authenticated;

create or replace function public.admin_action(
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid;
  v_session uuid;
  v_winner uuid;
  v_count integer;
  v_attempt uuid;
begin
  v_admin := public.require_admin();
  perform pg_advisory_xact_lock(17002);

  if exists (
    select 1 from public.admin_action_log where request_id = p_request_id
  ) then
    return public.public_event_state_json();
  end if;

  select active_game_session_id into v_session
  from public.event_state
  where id
  for update;

  if p_action = 'open_registration' then
    update public.event_state
    set registration_open = true, updated_at = now()
    where id;
  elsif p_action = 'close_registration' then
    update public.event_state
    set registration_open = false, updated_at = now()
    where id;
  elsif p_action = 'start_stay_alive' then
    if not exists (select 1 from public.participants) then
      raise exception 'no_registered_participants';
    end if;
    insert into public.game_sessions(game_id, status, started_at)
    values ('stay_alive', 'live', now())
    returning id into v_session;
    insert into public.stay_alive_entries(game_session_id, participant_id)
    select v_session, id from public.participants;
    update public.event_state
    set current_experience = 'stay_alive', active_game = 'stay_alive',
        active_game_session_id = v_session, active_signal_id = null,
        game_status = 'live', stage_mode = 'alive', updated_at = now()
    where id;
  elsif p_action = 'pause' then
    update public.game_sessions
    set status = 'paused', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'paused', updated_at = now()
    where id;
  elsif p_action = 'resume' then
    update public.game_sessions
    set status = 'live', updated_at = now()
    where id = v_session and status = 'paused';
    update public.event_state
    set game_status = 'live', updated_at = now()
    where id and game_status = 'paused';
  elsif p_action = 'return_lobby' then
    update public.event_state
    set current_experience = 'lobby', active_game = null,
        active_game_session_id = null, active_signal_id = null,
        game_status = 'idle', stage_mode = 'lobby', updated_at = now()
    where id;
  elsif p_action = 'select_stay_alive_winner' then
    if not exists (
      select 1 from public.game_sessions
      where id = v_session and game_id = 'stay_alive'
    ) then
      raise exception 'stay_alive_not_active';
    end if;
    select count(*) into v_count
    from public.stay_alive_entries
    where game_session_id = v_session
      and status in ('alive', 'finalist');
    if v_count <> 1 then
      raise exception 'exactly_one_survivor_required';
    end if;
    select participant_id into v_winner
    from public.stay_alive_entries
    where game_session_id = v_session
      and status in ('alive', 'finalist')
    limit 1;
    update public.stay_alive_entries
    set status = 'winner', updated_at = now()
    where game_session_id = v_session
      and participant_id = v_winner;
    update public.game_sessions
    set winner_participant_id = v_winner, status = 'selection', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'selection', updated_at = now()
    where id;
  elsif p_action = 'reveal_stay_alive_winner' then
    if not exists (
      select 1 from public.game_sessions
      where id = v_session and game_id = 'stay_alive'
        and winner_participant_id is not null
    ) then
      raise exception 'winner_not_selected';
    end if;
    update public.game_sessions
    set winner_revealed = true, status = 'revealed', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'revealed', updated_at = now()
    where id;
  elsif p_action = 'reset_stay_alive' then
    update public.game_sessions
    set status = 'cancelled', updated_at = now()
    where id = v_session and game_id = 'stay_alive';
    update public.event_state
    set current_experience = 'lobby', active_game = null,
        active_game_session_id = null, game_status = 'idle',
        stage_mode = 'lobby', updated_at = now()
    where id;
  elsif p_action = 'open_wamda' then
    insert into public.game_sessions(game_id, status, started_at)
    values ('wamda', 'live', now())
    returning id into v_session;
    update public.event_state
    set current_experience = 'wamda', active_game = 'wamda',
        active_game_session_id = v_session, active_signal_id = null,
        game_status = 'live', stage_mode = 'wamda', updated_at = now()
    where id;
  elsif p_action = 'cancel_arm' then
    update public.wamda_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id)
      and status = 'red';
    update public.wamda_public_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id);
    update public.event_state
    set active_signal_id = null, updated_at = now()
    where id;
  elsif p_action = 'close_wamda' then
    update public.wamda_signals
    set status = 'closed', updated_at = now()
    where id = (select active_signal_id from public.event_state where id);
    update public.wamda_public_signals
    set status = 'closed', updated_at = now()
    where id = (select active_signal_id from public.event_state where id);
    update public.game_sessions
    set status = 'selection', closed_at = now(), updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'selection', updated_at = now()
    where id;
  elsif p_action = 'select_wamda_result' then
    v_attempt := (p_payload ->> 'attemptId')::uuid;
    select participant_id into v_winner
    from public.wamda_attempts
    where id = v_attempt and game_session_id = v_session
      and valid and not false_start;
    if v_winner is null then
      raise exception 'valid_result_required';
    end if;
    update public.wamda_attempts
    set selected = (id = v_attempt)
    where game_session_id = v_session;
    update public.game_sessions
    set winner_participant_id = v_winner, status = 'selection', updated_at = now()
    where id = v_session;
  elsif p_action = 'reveal_wamda_winner' then
    if not exists (
      select 1 from public.game_sessions
      where id = v_session and game_id = 'wamda'
        and winner_participant_id is not null
    ) then
      raise exception 'winner_not_selected';
    end if;
    update public.game_sessions
    set winner_revealed = true, status = 'revealed', updated_at = now()
    where id = v_session;
    update public.event_state
    set game_status = 'revealed', updated_at = now()
    where id;
  elsif p_action = 'reset_wamda' then
    update public.game_sessions
    set status = 'cancelled', updated_at = now()
    where id = v_session and game_id = 'wamda';
    update public.event_state
    set current_experience = 'lobby', active_game = null,
        active_game_session_id = null, active_signal_id = null,
        game_status = 'idle', stage_mode = 'lobby', updated_at = now()
    where id;
  elsif p_action = 'reset_event_state' then
    update public.wamda_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id)
      and status in ('red', 'green');
    update public.wamda_public_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id)
      and status in ('red', 'green');
    update public.game_sessions
    set status = 'cancelled', closed_at = coalesce(closed_at, now()), updated_at = now()
    where id = v_session;
    update public.event_state
    set current_experience = 'lobby', active_game = null,
        active_game_session_id = null, active_signal_id = null,
        game_status = 'idle', stage_mode = 'lobby', updated_at = now()
    where id;
  elsif p_action = 'clear_all_registrations' then
    select count(*)::integer into v_count from public.participants;
    update public.wamda_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id)
      and status in ('red', 'green');
    update public.wamda_public_signals
    set status = 'cancelled', updated_at = now()
    where id = (select active_signal_id from public.event_state where id)
      and status in ('red', 'green');
    update public.game_sessions
    set status = 'cancelled', closed_at = coalesce(closed_at, now()), updated_at = now()
    where id = v_session;
    update public.event_state
    set registration_open = false, current_experience = 'lobby',
        active_game = null, active_game_session_id = null,
        active_signal_id = null, game_status = 'idle',
        stage_mode = 'lobby', updated_at = now()
    where id;
    update public.participant_sessions
    set revoked_at = coalesce(revoked_at, now());
    delete from public.participants;
    p_payload := jsonb_build_object('deletedParticipants', v_count);
  else
    raise exception 'unknown_admin_action';
  end if;

  insert into public.admin_action_log(
    request_id, action, detail, admin_user_id, game_session_id
  ) values (
    p_request_id, p_action, coalesce(p_payload::text, ''), v_admin, v_session
  );

  return public.public_event_state_json();
end;
$$;

revoke all on function public.admin_action(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_action(text, jsonb, uuid) to authenticated;
