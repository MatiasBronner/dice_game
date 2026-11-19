# Rolling Die Maze

A 3D puzzle game for a study on AI assistance and skill acquisition. Players roll a die through a maze. Numbered squares can only be entered when the right face is showing, and special squares (↻, ⇅) change the die in ways players discover by experimenting.

**Research question:** Does adaptive AI intervention that preserves productive struggle lead to better independent learning and long-term skill retention than user-initiated assistance or no assistance?

## Study links

Site: https://matiasbronner.github.io/dice_game/ (experimenter page listing the links)

| Path | Condition | Level set |
|---|---|---|
| `/play/1/` | **Development**: for the research team, not participants | any (chosen on the setup screen) |
| `/play/2a/`, `/play/2b/` | Control: no help | A, B |
| `/play/3a/`, `/play/3b/` | Adaptive: when the struggle detector fires, the hint plays automatically and the player watches it twice before moving | A, B |
| `/play/4a/`, `/play/4b/` | Help always available (lightbulb) | A, B |
| `/play/2a-2/` … `/play/4b-2/` | **Session 2** for each group: same group, **no help for anyone** | A, B |

The paths are numbered, not named, so participants can't tell which condition they're in.

**Each participant plays twice**, once with each set. **Session 1** uses the plain link for their group (help as the group says). **Session 2** uses their group's `-2` link, where nobody gets help (hints are off, the lightbulb is hidden; the struggle detector still logs when it *would* have fired). Counterbalance the sets: in each group, half the participants play A then B (`3a` → `3b-2`) and the other half B then A (`3b` → `3a-2`). Saved as `sessions.session` (1 or 2), `sessions.level_set` (A or B), `sessions.grp` (the group) and `sessions.assistance` (`none` in session 2). On session 2's How-to-play screen, the adaptive and help-always groups are told there are no hints this time; the control group sees nothing about hints.

### Sign-in and repeat testing

Participants sign in with their **first and last name**. Their participant ID (`pid`) is the name normalised to lowercase with accents and spacing ignored, so "Matías  Bronner" and "matias bronner" are both `matias-bronner`. Each time someone plays, a new row is added to `sessions` with the same `pid`, so repeated testing builds a history per person, and `participants` keeps their name and group. Two different people with the same full name would share a `pid`. If that's possible in your sample, ask one of them to add a middle initial.

### Development link (1)

A setup screen lets you choose any condition, start at any level, turn the intro screens and Supabase saving on or off, and edit every hint and detector setting (`CFG` and the struggle weights). During play, a **detector panel** on the board shows the live struggle score, how each action was classified, moves left versus best, the stagnation budget, and *why* the detector would or wouldn't fire right now. It also has buttons for Hint now, Fire detector, Solve, Restart, Prev/Next level, Quiz and Setup.

Settings edited here are saved in your browser only. **Copy settings as code** produces a `const CFG=…` line to paste into `app.js` when you want them to become the study defaults. Dev sessions are stored with `mode = 'dev'` and `grp = 'dev'`. Exclude them in analysis with `where s.mode <> 'dev'`, or delete them: `delete from sessions where mode = 'dev';`.

### Resuming

If a participant reloads or closes the tab, they're offered **Continue where I left off** (within 12 hours, same browser). The level they were on restarts, and everything they did before is kept.

## Session structure

Every session: one practice level → the set's **15 levels** (5 easy, 5 medium, 5 hard), with the condition's assistance. There's no quiz and no end-of-session test levels.

The 30 levels T01–T30 are split into two sets in `SETS` at the top of `app.js`:

| Set | Easy | Medium | Hard | Sum of best solutions |
|---|---|---|---|---|
| A | T01 T02 T04 T09 T10 | T11 T12 T16 T17 T18 | T21 T23 T25 T28 T29 | 171 |
| B | T03 T05 T06 T07 T08 | T13 T14 T15 T19 T20 | T22 T24 T26 T27 T30 | 176 |

The split was chosen to match the sets as closely as possible on best-solution length and lock detour in each tier. Each set also has an easy level that needs ↻ (A: T09, T10; B: T08) and a medium level that needs ⇅ (A: T18; B: T13), so every player meets both squares early. Levels are played in ID order, so difficulty ramps up within a session. The I1–I6 and D1–D6 levels in `levels.js` are no longer used.

| Levels | Tier | Board | Optimal moves | Notes |
|---|---|---|---|---|
| T01–T10 | easy | 5×5 | 4–7 | ↻ first appears at T08 |
| T11–T20 | medium | 6×6 | 9–13 | ⇅ first appears at T13 |
| T21–T30 | hard | 6×6 / 7×7 | 13–20 (T24: 27) | Both tiles from T25 |

Levels are generated and verified by `tools/gen_levels.py`, which writes `levels.js`. Every level is solved exactly, and every ↻/⇅ square is necessary (removing it makes the level longer or unsolvable). See the script for the difficulty targets. To change the levels, edit the plan in the script and run `python3 tools/gen_levels.py`.

### Restart

**⟲ Restart** (next to Undo) is always available while a level is in progress. It puts the die back on the start square. The move counter is **not** reset: moves keep counting across restarts, so `level_results.moves` and `efficiency` include every attempt. Each restart is logged as a `restart` event with the moves so far, and the `level_done` event records `restarts`. Time, undos, blocks and hints also keep counting across restarts.

```sql
select s.pid, s.mode, e.data->>'id' as level, (e.data->>'restarts')::int as restarts,
       (e.data->>'moves')::int as final_moves, (e.data->>'totalMoves')::int as total_moves
from events e join sessions s using (session_key)
where e.type = 'level_done' and s.mode <> 'dev' order by s.pid, e.at;
```

## Data collected

Everything is saved per participant, per session and per level. **Run `supabase/migration.sql` in the Supabase SQL Editor** to add the detailed columns below (safe to rerun; until you do, the game keeps saving the older columns, and all the detail is still in `events`).

### Per level (`level_results`, one row per level played)

| Column | What it is |
|---|---|
| `level_id`, `level_hash`, `phase`, `tier`, `opt` | Which level (and exact layout version), its tier and best possible solution |
| `solved`, `skipped` | Whether they reached the exit or skipped the level |
| `moves` / `total_moves` | Moves counted across all attempts (restarts don't reset it; an undo counts as a move) |
| `rolls` | Forward rolls only |
| `efficiency` | `opt / moves` (solved levels) |
| `restarts`, `undos`, `blocked`, `repeat_blocks` | Restarts, undos, blocked moves, and blocked moves repeated from the same state |
| `optimal_moves`, `nonoptimal_moves` | Rolls that did / didn't bring the die one step closer to the exit along a shortest solution |
| `deadend_states`, `revisits`, `unique_states` | Times in a state with no way out, returns to an earlier state, distinct states visited |
| `best_dist`, `final_dist` | Closest they got to the exit (in optimal moves), and how far they were when the level ended (0 if solved) |
| `spin_uses`, `flip_uses` | Times they rolled onto ↻ / ⇅ |
| `ms`, `secs`, `first_move_ms` | Time on the level, and time before the first roll |
| `median_decision_ms`, `mean_decision_ms`, `max_pause_ms` | Time between their actions |
| `idle_checks`, `hidden_ms` | 10-second periods without any input, and time the tab was hidden (switched away) |
| `hints`, `auto_hints`, `hint_ms`, `hint_watch_ms` | Hints shown, how many were automatic, and how long they were on screen |
| `first_hint_ms` | Time from level start to the first hint |
| `hints_followed`, `hint_moves_shown`, `hint_moves_followed` | Hints where the player then made every shown move, and shown vs. copied moves in total |
| `detector_fires`, `max_struggle` | Struggle detector fires (logged in every group, as a counterfactual where there's no help) and peak score |
| `hint_details` (jsonb) | One entry per hint, below |
| `actions` (jsonb) | Every action in order, below: a full replay of the level |
| `path` | The same thing as readable text, e.g. `[blocked up], [HINT 1: down, right], down, right, undo, restart, …` |

**`actions`**: each entry has `t` (ms since the level started) and `a`, the action: `move`, `blocked`, `undo`, `restart`, `skip`, or (not the player's own) `hint`, `hint_end`, `idle`, `tab_hidden`, `tab_visible`. Player actions also have `dt` (ms since their previous action, i.e. decision time), `p` (die position "row,col") and `o` (orientation: top, back, right faces). Moves add `d` (N/S/E/W), `opt` (true if optimal), `dist` (optimal moves left), `tile` (↻/⇅ if they rolled onto one), `revisit`. Blocked moves add `why` (`wall` or `num`), `face` vs `need` for number squares, and `repeat`.

**`hint_details`**: per hint: `n`, `t` (ms into the level), `how` (`automatic`, `offered` or `clicked`), `sinceLastActionMs` (time since their last action when the hint came or was clicked), `movesSoFar`, `distAtHint`, `shown` (e.g. `EEN`), `len`, `struggleScore` and `cause` (what the detector saw), `lockMs` (adaptive: time they had to watch), `watchedMs`, `endReason` (`move`, `key`, `click`, …), `firstActionAfterMs`, `matched` (how many of the shown moves they then made, in order), `followed` (true if all of them), `followEnd` (why following stopped, e.g. `other move W (also optimal)`), and the die's position and orientation.

### One row per action (`level_actions`) and per hint (`level_hints`)

The same `actions` and `hint_details` as normal tables, so they export straight to a spreadsheet (Table Editor → Export to CSV).

**`level_actions`**: one row per action, in order (`seq`). `step` numbers the player's own actions (1, 2, 3 …). `t_ms` is the time into the level, and `dt_ms` the time since their previous action. `action` is `move`, `blocked`, `undo`, `restart` or `skip` (the player's), or `hint`, `hint_end`, `idle`, `tab_hidden`, `tab_visible`. Each row also has `direction` (up/down/left/right), `move_no` (move counter after it), `pos`, `orientation` and `top_face` (where the die ended up and which way up), `dist_left` (optimal moves left; empty = dead end), `optimal`, `revisit` and `tile`. Blocked moves add `blocked_why`, `face_would_be` and `face_needed`. On hint rows, `hint_n`, `hint_how` and `hint_shown` say which hint it was and what it showed. On the player's actions right after a hint, `hint_n` says which hint and `hint_match` says whether it was the move the hint showed.

**`level_hints`**: one row per hint.
- `hint_n`, `how` (`automatic` or `clicked`)
- `t_ms`: when in the level it came
- `wait_ms`: time since the player's last action, i.e. how long they waited before clicking or before the assistant stepped in
- `at_move`, `at_roll`, `after_step`: which move it came on
- `dist_at_hint`: how far from the exit they were
- `shown`: the moves shown, e.g. "down, right, right"
- `struggle_score`, `cause`: what the detector saw
- `lock_ms`, `watched_ms`, `end_reason`, `first_action_after_ms`
- `matched`: how many shown moves they then made, in order
- `followed`: whether they made all of them
- `follow_end`: why following stopped, e.g. "other move: left (also optimal)" or "blocked down"

```sql
-- every action of every level, in order, with who played it
select s.pid, s.session, s.grp, a.level_id, a.seq, a.step, a.t_ms, a.dt_ms, a.action, a.direction, a.move_no,
       a.top_face, a.dist_left, a.optimal, a.hint_n, a.hint_match
from level_actions a join sessions s using (session_key)
where s.mode <> 'dev' order by s.pid, s.started_at, a.level, a.seq;

-- every hint: when, after how many moves, how long they waited, and whether they followed it
select s.pid, s.grp, h.level_id, h.hint_n, h.how, h.t_ms, h.at_move, h.wait_ms, h.shown, h.watched_ms, h.matched, h.followed, h.follow_end
from level_hints h join sessions s using (session_key)
where s.mode <> 'dev' order by s.pid, s.started_at, h.level, h.hint_n;
```

### Per action (`events`)

Every event above is also a row in `events`, with `t_ms` (since session start), `at` (clock time) and, during a level, `lt` (ms since the level started). Also logged: `session_start`/`session_resume`/`session_end`, `intro_step` (each start screen), `level_start`, `state` (detector classification after each move), `tile`, `detector_fire`, `hint`, `hint_unlocked`, `hint_end`, `hint_follow`, `help_click`, `next_click` (time spent on the "Solved" card), `level_done`/`level_skipped` (the full level summary).

### Per session and person

`sessions`: who, group, session 1 or 2, level set, assistance, start/finish, status, levels completed, device, screen size and timezone. `participants`: name and group.

Example: per-level summary for each person, in session order.

```sql
select s.pid, s.session, s.level_set, s.grp, l.level_id, l.solved, l.skipped, l.moves, l.opt, l.restarts, l.undos,
       l.hints, l.first_hint_ms, l.hints_followed, l.optimal_moves, l.nonoptimal_moves, l.median_decision_ms, l.ms
from level_results l join sessions s using (session_key)
where s.mode <> 'dev' order by s.pid, s.started_at, l.level;

-- every hint and whether it was followed
select s.pid, s.grp, l.level_id, h->>'how' how, (h->>'t')::int t_ms, (h->>'sinceLastActionMs')::int waited_ms,
       h->>'shown' shown, (h->>'matched')::int matched, (h->>'followed')::boolean followed, h->>'followEnd' follow_end
from level_results l join sessions s using (session_key), jsonb_array_elements(l.hint_details) h
where s.mode <> 'dev';
```

## Editing levels

Use the **level editor** on the development link: open `/play/1/`, then click **Open level editor** (or go straight to `/play/1/#editor`).

1. **Pick a level** from the list on the left.
2. **Paint** with the tools above the board (click or drag). You can use keys too: `W` wall, `1`–`6` number squares, `R` ↻, `F` ⇅, `S` start, `X` exit, `0` empty, `P` show/hide the solution. Board size, the rule (top or bottom face) and the difficulty tier are above the board.
3. **Check the analysis** on the right. It updates on every change, using the same solver as the game:
   - whether the level can be solved, and its best solution length (with the change from the published version)
   - the *lock detour* (extra moves the number squares force) and how many numbers the best path crosses
   - whether each ↻/⇅ square is actually needed (an unneeded one can be skipped, so players might never discover it)
   - a warning if the best solution is outside the tier's usual range (easy 4–8, medium 9–13, hard 13–20)
   - the best path, drawn on the board as numbered steps
4. **See what you changed** in *Changes from the published level*, or click **All changes & publish** to see every edited level, with the best-solution length before and after. **Revert** undoes one level or all of them.
5. **Delete** a level with **Delete level**. It's struck through in the list, disappears from your play-tests, and is removed from the game when you publish. **Restore level** undoes it any time before then. Each section (practice, training, end-of-session test) must keep at least one level. Level IDs don't change when you delete, so data from before and after stays comparable. For example, after deleting T05 the training levels run T01–T04, T06–T30, and players see "Level 5 / 29" on T06.
6. **Play-test** with **▶ Play test**. It opens that level in the game with your edits, using the condition chosen on the dev setup screen. Use **✎ Edit this level** in the detector panel to go back to the editor.
7. **Publish** from *All changes & publish* (it also shows how many levels each section will have): **Copy new levels.js**, open `levels.js` on GitHub in edit mode (the dialog links to it), select all, paste, and **Commit changes**. The live game updates within a couple of minutes.

Edits are saved in your browser only until you publish, so participants never see work in progress. The dev setup screen's **Play my edited levels** box chooses whether dev sessions use your edits or the published levels.

`levels.js` has **one level per line**, so a commit's diff on GitHub shows exactly which levels changed. Every `level_start` and `level_done` event records a `hash` of the level's layout, so you can tell which version of a level each participant played. Dev play-tests of unpublished edits are also marked `edited: true`. Re-running `tools/gen_levels.py` regenerates all levels from scratch and **replaces hand edits**.

## Hints and the struggle detector

See **[DETECTOR.md](DETECTOR.md)** for how productive and unproductive struggle are told apart, the weights, and how to tune them. In short: a ghost die demonstrates the next optimal moves (2 on easy, 3 on medium, 5 on hard levels). In the adaptive condition it plays as soon as the detector fires and the player can't move until it has played twice.

## Files

| File | What it is |
|---|---|
| `index.html` | Experimenter page with the four links |
| `play/1/index.html` | Development link |
| `play/2a..4b/index.html` | Study pages; each sets the condition and level set and loads the shared files |
| `app.js` / `app.css` | The game (settings in `CFG` at the top of `app.js`) |
| `levels.js` | The levels, one per line (generated, then hand-edited with the level editor) |
| `editor.js` | Level editor (loaded on the development link only) |
| `supabase/schema.sql` | Full database setup for a new project |
| `supabase/migration.sql` | Upgrade for an existing project (cumulative; safe to rerun) |

## Supabase

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run `supabase/schema.sql` (new project) or `supabase/migration.sql` (existing project).
3. Put the Project URL and publishable key in `SUPABASE_URL` / `SUPABASE_ANON_KEY` at the top of `app.js`.

The publishable key is designed to be public. All tables have row-level security turned on with no policies, so the page can only write through `rdm_save_session` / `rdm_save_events`, and nobody can read data through the API. View and export data in the dashboard (**Table Editor → Export to CSV**), or from analysis scripts using the secret key, which you should never commit.

| Table | One row per |
|---|---|
| `participants` | person (`pid`, `first_name`, `last_name`, group) |
| `sessions` | time someone played (`pid`, name, `mode` = condition, `level_set` = A or B, group, assistance, start/finish, status, device) |
| `level_results` | level played (`level_id`, `phase`, `tier`, moves, optimal, efficiency, undos, blocks, hints, `hint_ms`, detector fires, time) |
| `quiz_answers` | quiz question (no longer used) |
| `events` | logged action: moves, blocks, undos, tiles, hints and how long they were watched, detector fires, idle. The full event is in `data` (jsonb) |

Example: performance by condition, first or second session, and tier; and each person's sessions in order.

```sql
with s as (select *, row_number() over (partition by pid order by started_at) as visit
           from sessions where mode <> 'dev' and status = 'complete')
select s.mode, s.visit, l.tier, round(avg(l.efficiency), 3) eff, round(avg(l.secs)) secs,
       avg(l.solved::int) solved, count(*)
from level_results l join s using (session_key)
where l.phase = 'training'
group by 1, 2, 3 order by 1, 2, 3;

select pid, first_name, last_name, mode, level_set, started_at, status,
       row_number() over (partition by pid order by started_at) as visit
from sessions where mode <> 'dev' order by pid, started_at;
```

To delete one person's data: `delete from sessions where pid = 'first-last'; delete from participants where pid = 'first-last';`
