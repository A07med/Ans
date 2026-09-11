-- Rehearsal bug fixes. Migrations 0001 and 0002 are immutable because they
-- have already been applied to the linked project.

-- Keep the reviewed 0002 implementation available for every existing action,
-- while interposing a safeupdate-compatible clear operation.
alter function public.admin_action(text, jsonb, uuid)
  rename to admin_action_before_rehearsal_bugfix;

revoke all on function public.admin_action_before_rehearsal_bugfix(text, jsonb, uuid)
  from public, anon, authenticated;

create function public.admin_action(
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
  v_signal uuid;
  v_count integer;
begin
  -- Existing actions keep the already-reviewed 0002 behavior. The renamed
  -- helper has no anon/authenticated EXECUTE grant of its own.
  if p_action <> 'clear_all_registrations' then
    return public.admin_action_before_rehearsal_bugfix(
      p_action,
      p_payload,
      p_request_id
    );
  end if;

  v_admin := public.require_admin();
  perform pg_advisory_xact_lock(17002);

  if exists (
    select 1 from public.admin_action_log where request_id = p_request_id
  ) then
    return public.public_event_state_json();
  end if;

  -- This row lock serializes the destructive operation with game mutations.
  select active_game_session_id, active_signal_id
  into v_session, v_signal
  from public.event_state
  where id
  for update;

  select count(*)::integer into v_count
  from public.participants;

  update public.wamda_signals
  set status = 'cancelled', updated_at = now()
  where id = v_signal
    and status in ('red', 'green');

  update public.wamda_public_signals
  set status = 'cancelled', updated_at = now()
  where id = v_signal
    and status in ('red', 'green');

  update public.game_sessions
  set status = 'cancelled',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
  where id = v_session;

  update public.event_state
  set registration_open = false,
      current_experience = 'lobby',
      active_game = null,
      active_game_session_id = null,
      active_signal_id = null,
      game_status = 'idle',
      stage_mode = 'lobby',
      updated_at = now()
  where id;

  -- Clear references and dependent participant data explicitly. Every UPDATE
  -- and DELETE has a WHERE clause so the function also works in PostgREST
  -- sessions where pg_safeupdate is loaded.
  update public.game_sessions
  set winner_participant_id = null, updated_at = now()
  where winner_participant_id is not null;

  delete from public.wamda_attempts
  where participant_id is not null;

  delete from public.stay_alive_entries
  where participant_id is not null;

  delete from public.participant_sessions
  where participant_id is not null;

  delete from public.participants
  where id is not null;

  p_payload := jsonb_build_object('deletedParticipants', v_count);

  insert into public.admin_action_log(
    request_id, action, detail, admin_user_id, game_session_id
  ) values (
    p_request_id,
    p_action,
    p_payload::text,
    v_admin,
    v_session
  );

  return public.public_event_state_json()
    || jsonb_build_object('deletedParticipants', v_count);
end;
$$;

revoke all on function public.admin_action(text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_action(text, jsonb, uuid)
  to authenticated;
