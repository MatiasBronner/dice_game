# Rolling Die Maze

A 3D puzzle game for a study on AI assistance and skill acquisition. Players roll a die through a maze. Numbered squares can only be entered when the right face is showing, and special squares (↻, ⇅) change the die in ways players discover by experimenting.

**Research question:** Does adaptive AI intervention that preserves productive struggle lead to better independent learning and long-term skill retention than user-initiated assistance or no assistance?

## Study links

Site: https://matiasbronner.github.io/dice_game/ (experimenter page listing the links)

| Link | Path | Condition |
|---|---|---|
| 1 | `/play/1/` | **Development**: for the research team, not participants |
| 2 | `/play/2/` | Control: no help |
| 3 | `/play/3/` | Adaptive: the lightbulb lights up when the struggle detector fires; the player clicks it when they want the hint |
| 4 | `/play/4/` | Help always available (lightbulb) |

The paths are numbered, not named, so participants can't tell which condition they're in.

### Sign-in and repeat testing

Participants sign in with their **first and last name**. Their participant ID (`pid`) is the name normalised to lowercase with accents and spacing ignored, so "Matías  Bronner" and "matias bronner" are both `matias-bronner`. Each time someone plays, a new row is added to `sessions` with the same `pid`, so repeated testing builds a history per person, and `participants` keeps their name and group. Two different people with the same full name would share a `pid`. If that's possible in your sample, ask one of them to add a middle initial.

### Development link (1)

A setup screen lets you choose any condition, start at any level, turn the intro screens and Supabase saving on or off, and edit every hint and detector setting (`CFG` and the struggle weights). During play, a **detector panel** on the board shows the live struggle score, how each action was classified, moves left versus best, the stagnation budget, and *why* the detector would or wouldn't fire right now. It also has buttons for Hint now, Fire detector, Solve, Restart, Prev/Next level, Quiz and Setup.

Settings edited here are saved in your browser only. **Copy settings as code** produces a `const CFG=…` line to paste into `app.js` when you want them to become the study defaults. Dev sessions are stored with `mode = 'dev'` and `grp = 'dev'`. Exclude them in analysis with `where s.mode <> 'dev'`, or delete them: `delete from sessions where mode = 'dev';`.

### Resuming

If a participant reloads or closes the tab, they're offered **Continue where I left off** (within 12 hours, same browser). The level they were on restarts, and everything they did before is kept.

## Session structure

Every session (links 2–4): practice → **30 training levels** (assistance per condition) → **6 test levels** on their own → 6-question rule quiz.

| Levels | Tier | Board | Optimal moves | Notes |
|---|---|---|---|---|
| T01–T10 | easy | 5×5 | 4–7 | ↻ first appears at T08 |
| T11–T20 | medium | 6×6 | 9–13 | ⇅ first appears at T13 |
| T21–T30 | hard | 6×6 / 7×7 | 13–20 | Both tiles from T25 |
| I1–I6 | retention ×2, near ×2, far ×2 | 6×6 / 7×7 | 10–17 | Played on their own after training |

*Far transfer* levels switch to the bottom-face rule, with a rule-change screen first.

Levels are generated and verified by `tools/gen_levels.py`, which writes `levels.js`. Every level is solved exactly, and every ↻/⇅ square is necessary (removing it makes the level longer or unsolvable). See the script for the difficulty targets. To change the levels, edit the plan in the script and run `python3 tools/gen_levels.py`.

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

See **[DETECTOR.md](DETECTOR.md)** for how productive and unproductive struggle are told apart, the weights, and how to tune them. In short: a ghost die demonstrates the next 3 optimal moves and loops until the player gives any input.

## Files

| File | What it is |
|---|---|
| `index.html` | Experimenter page with the four links |
| `play/1..4/index.html` | Study pages; each sets the condition and loads the shared files |
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
| `sessions` | time someone played (`pid`, name, `mode` = link, group, assistance, start/finish, status, quiz score, device) |
| `level_results` | level played (`level_id`, `phase`, `tier`, moves, optimal, efficiency, undos, blocks, hints, `hint_ms`, detector fires, time) |
| `quiz_answers` | quiz question |
| `events` | logged action: moves, blocks, undos, tiles, hints and how long they were watched, detector fires, idle, quiz. The full event is in `data` (jsonb) |

Example: performance on the test levels by condition, and each person's sessions in order.

```sql
select p.grp, l.tier, round(avg(l.efficiency), 3) eff, round(avg(l.secs)) secs,
       avg(l.solved::int) solved, count(*)
from level_results l join sessions s using (session_key) join participants p on p.pid = s.pid
where l.phase = 'immediate' and s.mode <> 'dev'
group by 1, 2 order by 1, 2;

select pid, first_name, last_name, mode, started_at, status, quiz_score,
       row_number() over (partition by pid order by started_at) as visit
from sessions where mode <> 'dev' order by pid, started_at;
```

To delete one person's data: `delete from sessions where pid = 'first-last'; delete from participants where pid = 'first-last';`
