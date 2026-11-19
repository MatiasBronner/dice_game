-- Rolling Die Maze: Supabase schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Security model: the game page uses the public "anon" key, which anyone can read
-- from the page source. So the tables have row-level security ON and NO policies for
-- anon: nobody can read, change or delete data through the API. The game can only
-- write through the two functions at the bottom, which upsert/append and never read
-- back. You view and export the data in the Supabase dashboard (Table Editor → Export),
-- or with the service-role key from your own analysis scripts.

create table if not exists participants (
  pid          text primary key,         -- normalised "first-last" name, e.g. matias-bronner
  first_name   text,
  last_name    text,
  grp          text not null,            -- none | user | adaptive (group at first session)
  first_seen   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists sessions (
  session_key   text primary key,
  pid           text not null references participants(pid),
  first_name    text,
  last_name     text,
  session       int  not null,           -- 1 = training, 2 = delayed test
  mode          text,                    -- study URL: dev | control | adaptive | help
  grp           text not null,           -- none | user | adaptive | delayed (delayed-test link) | dev
  assistance    text not null,           -- assistance actually given this session
  level_set     text not null,           -- A | B
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null,           -- in_progress | complete
  current_level int,
  levels_total  int,
  quiz_score    int,
  quiz_n        int,
  event_count   int,
  skip_after    int,
  user_agent    text,
  screen        text,
  timezone      text,
  updated_at    timestamptz not null default now()
);

create table if not exists level_results (
  session_key     text not null references sessions(session_key) on delete cascade,
  level           int  not null,           -- position in the session (1 = first level played)
  level_id        text,                  -- P0, T01-T30, I1-I6, D1-D6 (see levels.js)
  phase           text,                  -- practice | training | immediate | delayed
  tier            text,                  -- easy | medium | hard | retention | near | far
  kind            text,                  -- same as tier (kept for compatibility)
  rule            text,                  -- top | bottom
  solved          boolean,
  skipped         boolean,
  moves           int,
  opt             int,
  efficiency      numeric,
  undos           int,
  blocked         int,
  hints           int,
  auto_hints      int,
  hint_ms         int,                   -- total ms hints were on screen
  max_tier        int,                   -- unused since v3
  detector_fires  int,
  max_struggle    numeric,
  unique_states   int,
  secs            int,
  ms                   bigint,
  rolls                int,
  total_moves          int,
  restarts             int,
  first_move_ms        int,
  optimal_moves        int,
  nonoptimal_moves     int,
  deadend_states       int,
  revisits             int,
  repeat_blocks        int,
  best_dist            int,
  final_dist           int,
  spin_uses            int,
  flip_uses            int,
  idle_checks          int,
  median_decision_ms   int,
  mean_decision_ms     int,
  max_pause_ms         int,
  hidden_ms            int,
  first_hint_ms        int,
  hints_followed       int,
  hint_moves_shown     int,
  hint_moves_followed  int,
  hint_watch_ms        int,
  level_hash           text,
  hint_details         jsonb,
  actions              jsonb,
  primary key (session_key, level)
);

create table if not exists quiz_answers (
  session_key  text not null references sessions(session_key) on delete cascade,
  q            int  not null,
  qtype        text,
  answer       int,
  correct      int,
  ok           boolean,
  secs         numeric,
  primary key (session_key, q)
);

-- Every logged action: moves, blocks, undos, hints, detector fires, idle, quiz, etc.
create table if not exists events (
  session_key  text not null references sessions(session_key) on delete cascade,
  seq          int  not null,            -- order within the session (0, 1, 2, ...)
  t_ms         bigint,                   -- ms since session start
  at           timestamptz,
  level_index  int,
  level_kind   text,
  type         text not null,
  data         jsonb,                    -- the full event, all fields
  primary key (session_key, seq)
);
create index if not exists events_type_idx on events(type);

alter table participants  enable row level security;
alter table sessions      enable row level security;
alter table level_results enable row level security;
alter table quiz_answers  enable row level security;
alter table events        enable row level security;

-- A participant is identified by their normalised name (pid). Each time they play, a new
-- row is added to sessions, so repeat testing builds up a history per participant.

-- Save or update a session with its level results and quiz answers.
create or replace function rdm_save_session(s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text := s->>'key';
begin
  if k is null or length(k) > 120 then raise exception 'bad key'; end if;

  insert into participants(pid, first_name, last_name, grp, first_seen)
  values (s->>'pid', s->>'firstName', s->>'lastName', s->>'group', coalesce((s->>'started')::timestamptz, now()))
  on conflict (pid) do update set
    -- keep the name as first entered; each session row keeps what was typed that time
    first_name = coalesce(participants.first_name, excluded.first_name),
    last_name  = coalesce(participants.last_name, excluded.last_name),
    -- a participant's group is set by their first non-dev session; dev sessions never overwrite it
    grp = case when participants.grp in ('delayed','test','dev') and excluded.grp not in ('delayed','test','dev') then excluded.grp else participants.grp end,
    updated_at = now();

  insert into sessions(session_key, pid, first_name, last_name, session, mode, grp, assistance, level_set, started_at, finished_at,
    status, current_level, levels_total, quiz_score, quiz_n, event_count, skip_after, user_agent, screen, timezone, updated_at)
  values (k, s->>'pid', s->>'firstName', s->>'lastName', (s->>'session')::int, s->>'mode', s->>'group', s->>'assistance', coalesce(s->>'set','v3'),
    (s->>'started')::timestamptz, (s->>'finished')::timestamptz, s->>'status',
    (s->>'currentLevel')::int, (s->>'levelsTotal')::int, (s->>'quizScore')::int,
    jsonb_array_length(coalesce(s->'quiz','[]'::jsonb)), (s->>'eventCount')::int,
    (s->>'skipAfter')::int, s->>'ua', s->>'screen', s->>'timezone', now())
  on conflict (session_key) do update set
    finished_at = excluded.finished_at, status = excluded.status, current_level = excluded.current_level,
    quiz_score = excluded.quiz_score, quiz_n = excluded.quiz_n, event_count = excluded.event_count,
    updated_at = now();

  insert into level_results(session_key, level, level_id, phase, tier, kind, rule, solved, skipped, moves, opt, efficiency,
    undos, blocked, hints, auto_hints, hint_ms, max_tier, detector_fires, max_struggle, unique_states, secs,
    ms, rolls, total_moves, restarts, first_move_ms, optimal_moves, nonoptimal_moves, deadend_states, revisits, repeat_blocks, best_dist, final_dist, spin_uses, flip_uses, idle_checks, median_decision_ms, mean_decision_ms, max_pause_ms, hidden_ms, first_hint_ms, hints_followed, hint_moves_shown, hint_moves_followed, hint_watch_ms, level_hash, hint_details, actions)
  select k, (l->>'level')::int, l->>'id', l->>'phase', l->>'tier', l->>'kind', l->>'rule', (l->>'solved')::boolean, (l->>'skipped')::boolean,
    (l->>'moves')::int, (l->>'opt')::int, (l->>'efficiency')::numeric, (l->>'undos')::int, (l->>'blocked')::int,
    (l->>'hints')::int, (l->>'autoHints')::int, (l->>'hintMs')::int, (l->>'maxTier')::int, (l->>'detectorFires')::int,
    (l->>'maxStruggle')::numeric, (l->>'uniqueStates')::int, (l->>'secs')::int,
    (l->>'ms')::bigint, (l->>'rolls')::int, (l->>'totalMoves')::int, (l->>'restarts')::int, (l->>'firstMoveMs')::int, (l->>'optimalMoves')::int, (l->>'nonOptimalMoves')::int, (l->>'deadendStates')::int, (l->>'revisits')::int, (l->>'repeatBlocks')::int, (l->>'bestDist')::int, (l->>'finalDist')::int, (l->>'spinUses')::int, (l->>'flipUses')::int, (l->>'idleChecks')::int, (l->>'medianDecisionMs')::int, (l->>'meanDecisionMs')::int, (l->>'maxPauseMs')::int, (l->>'hiddenMs')::int, (l->>'firstHintMs')::int, (l->>'hintsFollowed')::int, (l->>'hintMovesShown')::int, (l->>'hintMovesFollowed')::int, (l->>'hintWatchMs')::int, l->>'hash', l->'hintDetails', l->'actions'
  from jsonb_array_elements(coalesce(s->'levels','[]'::jsonb)) l
  on conflict (session_key, level) do nothing;

  insert into quiz_answers(session_key, q, qtype, answer, correct, ok, secs)
  select k, (a->>'q')::int, a->>'type', (a->>'answer')::int, (a->>'correct')::int, (a->>'ok')::boolean, (a->>'secs')::numeric
  from jsonb_array_elements(coalesce(s->'quiz','[]'::jsonb)) a
  on conflict (session_key, q) do nothing;
end $$;

-- Append a batch of events. Re-sending the same events is harmless.
create or replace function rdm_save_events(k text, evs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(evs) > 1000 then raise exception 'batch too large'; end if;
  insert into events(session_key, seq, t_ms, at, level_index, level_kind, type, data)
  select k, (e->>'seq')::int, (e->>'t')::bigint, (e->>'at')::timestamptz, (e->>'lv')::int, e->>'kind', e->>'type', e
  from jsonb_array_elements(evs) e
  on conflict (session_key, seq) do nothing;
end $$;

revoke all on function rdm_save_session(jsonb) from public;
revoke all on function rdm_save_events(text, jsonb) from public;
grant execute on function rdm_save_session(jsonb) to anon, authenticated;
grant execute on function rdm_save_events(text, jsonb) to anon, authenticated;
