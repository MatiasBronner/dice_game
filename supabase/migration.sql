-- Rolling Die Maze: upgrade an existing Supabase project to the current version.
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run any number of times;
-- existing data is kept. (Replaces migration_v3.sql.)

alter table participants  add column if not exists first_name text;
alter table participants  add column if not exists last_name  text;
alter table sessions      add column if not exists first_name text;
alter table sessions      add column if not exists last_name  text;
alter table sessions      add column if not exists mode       text;
alter table level_results add column if not exists level_id   text;
alter table level_results add column if not exists phase      text;
alter table level_results add column if not exists tier       text;
alter table level_results add column if not exists hint_ms    int;

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
    undos, blocked, hints, auto_hints, hint_ms, max_tier, detector_fires, max_struggle, unique_states, secs)
  select k, (l->>'level')::int, l->>'id', l->>'phase', l->>'tier', l->>'kind', l->>'rule', (l->>'solved')::boolean, (l->>'skipped')::boolean,
    (l->>'moves')::int, (l->>'opt')::int, (l->>'efficiency')::numeric, (l->>'undos')::int, (l->>'blocked')::int,
    (l->>'hints')::int, (l->>'autoHints')::int, (l->>'hintMs')::int, (l->>'maxTier')::int, (l->>'detectorFires')::int,
    (l->>'maxStruggle')::numeric, (l->>'uniqueStates')::int, (l->>'secs')::int
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
