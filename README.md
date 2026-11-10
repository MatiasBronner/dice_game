# Rolling Die Maze

A 3D puzzle game for a study on AI assistance and skill acquisition. Players roll a die through a maze. Numbered squares can only be entered when the right face is showing, and special squares (↻, ⇅) change the die in ways players discover by experimenting.

**Research question:** Does adaptive AI intervention that preserves productive struggle lead to better independent learning and long-term skill retention than user-initiated assistance or no assistance?

## Study links

Site: https://matiasbronner.github.io/dice_game/ (experimenter page listing the links)

| Link | Path | Condition | Session |
|---|---|---|---|
| 1 | `/play/1/` | **Development**: for the research team, not participants | any |
| 2 | `/play/2/` | Control: no help | 1 |
| 3 | `/play/3/` | Adaptive: hints when the struggle detector fires | 1 |
| 4 | `/play/4/` | Help always available (lightbulb) | 1 |
| 5 | `/play/5/` | Delayed test: no help for anyone | 2 |

The paths are numbered, not named, so participants can't tell which condition they're in. Add `?pid=ID` (or Prolific's `PROLIFIC_PID`) to fill in the participant ID automatically. Participants must use the same ID in both sessions; the delayed test is linked to their group through `pid`.

### Development link (1)

A setup screen lets you choose any condition, start at any level, turn the intro screens and Supabase saving on or off, and edit every hint and detector setting (`CFG` and the struggle weights). During play, a **detector panel** on the board shows the live struggle score, how each action was classified, moves left versus best, the stagnation budget, and *why* the detector would or wouldn't fire right now. It also has buttons for Hint now, Fire detector, Solve, Restart, Prev/Next level, Quiz and Setup.

Settings edited here are saved in your browser only. **Copy settings as code** produces a `const CFG=…` line to paste into `app.js` when you want them to become the study defaults. Dev sessions are stored with `mode = 'dev'` and `grp = 'dev'`. Exclude them in analysis with `where s.mode <> 'dev'`, or delete them: `delete from sessions where mode = 'dev';`.

### Resuming

If a participant reloads or closes the tab, they're offered **Continue where I left off** (within 12 hours, same browser). The level they were on restarts, and everything they did before is kept.

## Session structure

**Session 1** (links 2–4): practice → **30 training levels** (assistance per condition) → **6 immediate-test levels** on their own → 6-question rule quiz.
**Session 2** (link 5): **6 delayed-test levels** → the same quiz.

| Levels | Tier | Board | Optimal moves | Notes |
|---|---|---|---|---|
| T01–T10 | easy | 5×5 | 4–7 | ↻ first appears at T08 |
| T11–T20 | medium | 6×6 | 9–13 | ⇅ first appears at T13 |
| T21–T30 | hard | 6×6 / 7×7 | 13–20 | Both tiles from T25 |
| I1–I6 / D1–D6 | retention ×2, near ×2, far ×2 | 6×6 / 7×7 | 10–17 | Immediate and delayed sets are matched pairs: same specs, optimal and lock-cost within 1 |

*Far transfer* levels switch to the bottom-face rule, with a rule-change screen first.

Levels are generated and verified by `tools/gen_levels.py`, which writes `levels.js`. Every level is solved exactly, and every ↻/⇅ square is necessary (removing it makes the level longer or unsolvable). See the script for the difficulty targets. To change the levels, edit the plan in the script and run `python3 tools/gen_levels.py`.

## Hints and the struggle detector

See **[DETECTOR.md](DETECTOR.md)** for how productive and unproductive struggle are told apart, the weights, and how to tune them. In short: a ghost die demonstrates the next 3 optimal moves and loops until the player gives any input.

## Files

| File | What it is |
|---|---|
| `index.html` | Experimenter page with the four links |
| `play/1..5/index.html` | Study pages; each sets the condition and loads the shared files |
| `app.js` / `app.css` | The game (settings in `CFG` at the top of `app.js`) |
| `levels.js` | Generated levels |
| `supabase/schema.sql` | Full database setup for a new project |
| `supabase/migration_v3.sql` | Upgrade for a project set up with the earlier schema |

## Supabase

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run `supabase/schema.sql` (new project) or `supabase/migration_v3.sql` (upgrading).
3. Put the Project URL and publishable key in `SUPABASE_URL` / `SUPABASE_ANON_KEY` at the top of `app.js`.

The publishable key is designed to be public. All tables have row-level security turned on with no policies, so the page can only write through `rdm_save_session` / `rdm_save_events`, and nobody can read data through the API. View and export data in the dashboard (**Table Editor → Export to CSV**), or from analysis scripts using the secret key, which you should never commit.

| Table | One row per |
|---|---|
| `participants` | participant (ID, group) |
| `sessions` | session (`mode` = link, group, assistance, start/finish, status, quiz score, device) |
| `level_results` | level played (`level_id`, `phase`, `tier`, moves, optimal, efficiency, undos, blocks, hints, `hint_ms`, detector fires, time) |
| `quiz_answers` | quiz question |
| `events` | logged action: moves, blocks, undos, tiles, hints and how long they were watched, detector fires, idle, quiz. The full event is in `data` (jsonb) |

Example: performance on the immediate and delayed tests by condition.

```sql
select p.grp, l.phase, l.tier, round(avg(l.efficiency), 3) eff, round(avg(l.secs)) secs,
       avg(l.solved::int) solved, count(*)
from level_results l join sessions s using (session_key) join participants p on p.pid = s.pid
where l.phase in ('immediate', 'delayed') and s.mode <> 'dev'
group by 1, 2, 3 order by 1, 2, 3;
```

To delete test data: `delete from sessions where pid like 'TEST%'; delete from participants where pid like 'TEST%';`
