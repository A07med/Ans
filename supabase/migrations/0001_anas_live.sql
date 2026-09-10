-- Anas Live portable Supabase schema.
-- Apply this migration in the Supabase SQL editor before enabling the live adapter.

create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2),
  phone_normalized text not null unique,
  participant_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  connected_at timestamptz
);

create table if not exists public.event_state (
  id boolean primary key default true check (id),
  registration_open boolean not null default true,
  current_experience text not null default 'lobby',
  active_game text,
  game_status text not null default 'idle',
  stage_mode text not null default 'lobby',
  updated_at timestamptz not null default now()
);

insert into public.event_state (id) values (true)
on conflict (id) do nothing;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null check (game_id in ('stay_alive', 'wamda')),
  status text not null default 'idle',
  started_at timestamptz,
  closed_at timestamptz,
  winner_participant_id uuid references public.participants(id),
  created_at timestamptz not null default now()
);

create table if not exists public.stay_alive_rounds (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_number integer not null,
  number_before integer not null,
  number_after integer not null,
  eliminated_count integer not null,
  created_at timestamptz not null default now(),
  unique (game_session_id, round_number)
);

create table if not exists public.stay_alive_entries (
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  status text not null default 'alive',
  eliminated_at timestamptz,
  primary key (game_session_id, participant_id)
);

create table if not exists public.wamda_attempts (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  signal_id uuid not null,
  reaction_ms integer,
  submission_received_at timestamptz not null default now(),
  false_start boolean not null default false,
  valid boolean not null default false,
  integrity_flags jsonb not null default '{}'::jsonb,
  unique (game_session_id, participant_id)
);

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  admin_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists participants_connected_idx
  on public.participants (connected_at);
create index if not exists stay_alive_rounds_session_idx
  on public.stay_alive_rounds (game_session_id, round_number);
create index if not exists wamda_attempts_fastest_idx
  on public.wamda_attempts (game_session_id, reaction_ms)
  where valid = true and false_start = false;

alter table public.participants enable row level security;
alter table public.event_state enable row level security;
alter table public.game_sessions enable row level security;
alter table public.stay_alive_rounds enable row level security;
alter table public.stay_alive_entries enable row level security;
alter table public.wamda_attempts enable row level security;
alter table public.admin_action_log enable row level security;

-- Participant-facing reads/writes should be exposed through protected RPCs or
-- edge functions. Admin operations must never be implemented as client updates.