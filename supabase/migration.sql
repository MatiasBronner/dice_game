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

-- v4: detailed per-level play record (see README, "Data collected")
alter table level_results add column if not exists ms                   bigint;
alter table level_results add column if not exists rolls                int;
alter table level_results add column if not exists total_moves          int;
alter table level_results add column if not exists restarts             int;
alter table level_results add column if not exists first_move_ms        int;
alter table level_results add column if not exists optimal_moves        int;
alter table level_results add column if not exists nonoptimal_moves     int;
alter table level_results add column if not exists deadend_states       int;
alter table level_results add column if not exists revisits             int;
alter table level_results add column if not exists repeat_blocks        int;
alter table level_results add column if not exists best_dist            int;
alter table level_results add column if not exists final_dist           int;
alter table level_results add column if not exists spin_uses            int;
alter table level_results add column if not exists flip_uses            int;
alter table level_results add column if not exists idle_checks          int;
alter table level_results add column if not exists median_decision_ms   int;
alter table level_results add column if not exists mean_decision_ms     int;
alter table level_results add column if not exists max_pause_ms         int;
alter table level_results add column if not exists hidden_ms            int;
alter table level_results add column if not exists first_hint_ms        int;
alter table level_results add column if not exists hints_followed       int;
alter table level_results add column if not exists hint_moves_shown     int;
alter table level_results add column if not exists hint_moves_followed  int;
alter table level_results add column if not exists hint_watch_ms        int;
alter table level_results add column if not exists level_hash           text;
alter table level_results add column if not exists hint_details         jsonb;
alter table level_results add column if not exists actions              jsonb;
alter table level_results add column if not exists path                 text;


-- One row per action in a level (a spreadsheet-friendly copy of level_results.actions).
create table if not exists level_actions (
  session_key    text not null references sessions(session_key) on delete cascade,
  level          int  not null,           -- position in the session (same as level_results.level)
  level_id       text,
  seq            int  not null,           -- 1, 2, 3 ... in order, including hints, idle and tab switches
  step           int,                     -- the player's own action number (moves, blocks, undos, restarts, skip)
  t_ms           int,                     -- ms since the level started
  dt_ms          int,                     -- ms since the player's previous action (decision time)
  action         text,                    -- move | blocked | undo | restart | skip | hint | hint_end | idle | tab_hidden | tab_visible
  direction      text,                    -- up | down | left | right (moves and blocked moves)
  move_no        int,                     -- move counter after this action
  pos            text,                    -- die position after it, "row,col"
  orientation    text,                    -- die orientation after it: top, back, right faces
  top_face       int,
  dist_left      int,                     -- optimal moves left to the exit after it (null = dead end)
  optimal        boolean,                 -- moves: brought the die one step closer along a shortest path
  revisit        boolean,
  tile           text,                    -- spin | flip if the move landed on one
  blocked_why    text,                    -- wall | num
  face_would_be  int,                     -- blocked by a number square: the face that would have been checked
  face_needed    int,                     -- ...and the number the square needed
  hint_n         int,                     -- hint rows: which hint. Player actions: the hint they came right after
  hint_match     boolean,                 -- player actions after a hint: was it the move the hint showed?
  hint_how       text,                    -- hint rows: automatic | offered | clicked
  hint_shown     text,                    -- hint rows: the moves shown, e.g. "down, right, right"
  data           jsonb,
  primary key (session_key, level, seq)
);

-- One row per hint (a spreadsheet-friendly copy of level_results.hint_details).
create table if not exists level_hints (
  session_key        text not null references sessions(session_key) on delete cascade,
  level              int  not null,
  level_id           text,
  hint_n             int  not null,       -- 1st, 2nd ... hint on this level
  how                text,                -- automatic (adaptive) | offered | clicked (help-always)
  t_ms               int,                 -- ms into the level when the hint came / was clicked
  wait_ms            int,                 -- ms since the player's last action (how long they waited before the hint)
  at_move            int,                 -- move counter when the hint came
  at_roll            int,                 -- forward rolls made before the hint
  after_step         int,                 -- player actions made before the hint
  dist_at_hint       int,                 -- optimal moves left when the hint came (null = dead end)
  shown              text,                -- moves shown, e.g. "down, right, right"
  hint_len           int,
  struggle_score     numeric,             -- detector score when the hint came
  cause              text,                -- what the detector saw: loop | repeat_block | deadend | idle | stagnation | general
  lock_ms            int,                 -- adaptive: time the player had to watch before moving
  watched_ms         int,                 -- time the hint was on screen
  end_reason         text,                -- what ended it: move | key | click | undo | restart | skip | solved
  first_action_after_ms int,              -- ms from the hint appearing to the player's next action
  matched            int,                 -- how many of the shown moves they then made, in order
  followed           boolean,             -- true if they made all of them
  follow_end         text,                -- why following stopped, e.g. "other move W (also optimal)"
  pos                text,
  orientation        text,
  data               jsonb,
  primary key (session_key, level, hint_n)
);
alter table level_actions enable row level security;
alter table level_hints   enable row level security;

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
    ms, rolls, total_moves, restarts, first_move_ms, optimal_moves, nonoptimal_moves, deadend_states, revisits, repeat_blocks, best_dist, final_dist, spin_uses, flip_uses, idle_checks, median_decision_ms, mean_decision_ms, max_pause_ms, hidden_ms, first_hint_ms, hints_followed, hint_moves_shown, hint_moves_followed, hint_watch_ms, level_hash, hint_details, actions, path)
  select k, (l->>'level')::int, l->>'id', l->>'phase', l->>'tier', l->>'kind', l->>'rule', (l->>'solved')::boolean, (l->>'skipped')::boolean,
    (l->>'moves')::int, (l->>'opt')::int, (l->>'efficiency')::numeric, (l->>'undos')::int, (l->>'blocked')::int,
    (l->>'hints')::int, (l->>'autoHints')::int, (l->>'hintMs')::int, (l->>'maxTier')::int, (l->>'detectorFires')::int,
    (l->>'maxStruggle')::numeric, (l->>'uniqueStates')::int, (l->>'secs')::int,
    (l->>'ms')::bigint, (l->>'rolls')::int, (l->>'totalMoves')::int, (l->>'restarts')::int, (l->>'firstMoveMs')::int, (l->>'optimalMoves')::int, (l->>'nonOptimalMoves')::int, (l->>'deadendStates')::int, (l->>'revisits')::int, (l->>'repeatBlocks')::int, (l->>'bestDist')::int, (l->>'finalDist')::int, (l->>'spinUses')::int, (l->>'flipUses')::int, (l->>'idleChecks')::int, (l->>'medianDecisionMs')::int, (l->>'meanDecisionMs')::int, (l->>'maxPauseMs')::int, (l->>'hiddenMs')::int, (l->>'firstHintMs')::int, (l->>'hintsFollowed')::int, (l->>'hintMovesShown')::int, (l->>'hintMovesFollowed')::int, (l->>'hintWatchMs')::int, l->>'hash', l->'hintDetails', l->'actions', l->>'path'
  from jsonb_array_elements(coalesce(s->'levels','[]'::jsonb)) l
  on conflict (session_key, level) do nothing;

  insert into level_actions(session_key, level, level_id, seq, step, t_ms, dt_ms, action, direction, move_no, pos, orientation, top_face,
    dist_left, optimal, revisit, tile, blocked_why, face_would_be, face_needed, hint_n, hint_match, hint_how, hint_shown, data)
  select k, (l->>'level')::int, l->>'id', a.ord::int, (a.e->>'step')::int, (a.e->>'t')::int, (a.e->>'dt')::int, a.e->>'a', a.e->>'dir',
    (a.e->>'moveNo')::int, a.e->>'p', a.e->>'o', (a.e->>'top')::int, (a.e->>'dist')::int, (a.e->>'opt')::boolean, (a.e->>'revisit')::boolean,
    a.e->>'tile', a.e->>'why', (a.e->>'face')::int, (a.e->>'need')::int, coalesce((a.e->>'hint')::int, (a.e->>'afterHint')::int),
    (a.e->>'hintMatch')::boolean, a.e->>'how', a.e->>'words', a.e
  from jsonb_array_elements(coalesce(s->'levels','[]'::jsonb)) l,
       jsonb_array_elements(coalesce(l->'actions','[]'::jsonb)) with ordinality a(e, ord)
  on conflict (session_key, level, seq) do nothing;

  insert into level_hints(session_key, level, level_id, hint_n, how, t_ms, wait_ms, at_move, at_roll, after_step, dist_at_hint, shown, hint_len,
    struggle_score, cause, lock_ms, watched_ms, end_reason, first_action_after_ms, matched, followed, follow_end, pos, orientation, data)
  select k, (l->>'level')::int, l->>'id', (h->>'n')::int, h->>'how', (h->>'t')::int, (h->>'sinceLastActionMs')::int, (h->>'atMove')::int,
    (h->>'atRoll')::int, (h->>'afterStep')::int, (h->>'distAtHint')::int, h->>'shownWords', (h->>'len')::int, (h->>'struggleScore')::numeric,
    h->>'cause', (h->>'lockMs')::int, (h->>'watchedMs')::int, h->>'endReason', (h->>'firstActionAfterMs')::int, (h->>'matched')::int,
    (h->>'followed')::boolean, h->>'followEnd', h->>'p', h->>'o', h
  from jsonb_array_elements(coalesce(s->'levels','[]'::jsonb)) l,
       jsonb_array_elements(coalesce(l->'hintDetails','[]'::jsonb)) h
  on conflict (session_key, level, hint_n) do nothing;

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
