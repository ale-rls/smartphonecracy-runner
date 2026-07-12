create table if not exists scenarios (
  id text not null,
  version text primary key,
  definition_json jsonb not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  installation_id text not null,
  scenario_id text not null references scenarios(version),
  status text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  current_phase_id text,
  current_phase_epoch integer,
  current_phase_started_at timestamptz,
  current_phase_deadline timestamptz,
  participant_data_expires_at timestamptz not null
);

create table if not exists session_phases (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  phase_id text not null,
  phase_index integer not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  question_text text,
  x_axis_json jsonb,
  y_axis_json jsonb,
  outcome_json jsonb,
  unique (session_id, phase_index)
);

create table if not exists checkpoints (
  id bigint generated always as identity primary key,
  session_id text not null,
  phase_id text not null,
  phase_epoch integer not null,
  scenario_version text not null,
  started_at timestamptz not null,
  deadline_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id bigint generated always as identity primary key,
  session_phase_id text not null references session_phases(id) on delete cascade,
  participant_id text not null,
  x double precision,
  y double precision,
  status text not null,
  last_input_at timestamptz,
  recorded_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  retained_until timestamptz not null,
  unique (session_phase_id, participant_id)
);

create table if not exists events (
  id bigint generated always as identity primary key,
  session_id text not null,
  type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists health_events (
  id bigint generated always as identity primary key,
  installation_id text not null,
  component text not null,
  status text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists votes_retained_until_idx on votes(retained_until);
create index if not exists checkpoints_session_id_idx on checkpoints(session_id);

-- Participant identifiers and final positions are deleted together. There is
-- intentionally no table for cursor samples, grants, leases, or IP addresses.
create or replace function delete_expired_participant_data(cutoff timestamptz default now())
returns bigint language plpgsql as $$
declare deleted_count bigint;
begin
  delete from votes where retained_until <= cutoff;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;
