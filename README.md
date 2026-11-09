# Rolling Die Maze

A 3D puzzle game for a study on AI assistance and skill acquisition. Players roll a die through a maze. Numbered squares can only be entered when the right face is showing, and special squares (↻, ⇅) change the die in ways players discover by experimenting.

**Research question:** Does adaptive AI intervention that preserves productive struggle lead to better independent learning and long-term skill retention than user-initiated assistance or no assistance?

## Conditions

| Group | Session 1 (training) | Session 2 (delayed test) |
|---|---|---|
| `none` | No assistance | No assistance |
| `user` | Help button, 3 hint tiers (Nudge, Concept, Next move) | No assistance |
| `adaptive` | Automatic hints when the struggle detector fires | No assistance |

The struggle detector runs in every group and is logged (`detector_fire`). Only the adaptive group sees hints, so you can compare when it *would* have fired in the other groups.

Session 2 includes retention levels, near-transfer levels (new layouts with ↻/⇅ squares) and far-transfer levels (numbers check the bottom face). Level sets A and B allow counterbalancing.

## Running it

`index.html` is a single self-contained page (Three.js r128 loaded from cdnjs).

- **GitHub Pages (with Supabase):** https://matiasbronner.github.io/dice_game/. Sessions save to your Supabase project once it's configured (see below).
- **Claude artifact:** the claude.ai version saves to its own built-in database when opened while signed in. It can't reach Supabase, because claude.ai pages block outside connections.
- **Locally:** open `index.html` in a browser.

Every session is also kept in the browser's localStorage as a backup and can be exported from the end screen or the *Collected data* tab.

## Supabase setup

1. Create a project at https://supabase.com.
2. In **SQL Editor → New query**, paste `supabase/schema.sql` and click **Run**.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
4. Paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of the script in `index.html`, then commit.

The anon key is designed to be public. All tables have row-level security turned on with no policies, so the page can only write through the `rdm_save_session` and `rdm_save_events` functions. Nobody can read data through the API. You view and export data in the Supabase dashboard (**Table Editor → Export to CSV**), or from analysis scripts using the service-role key, which you should never commit.

### Supabase tables

| Table | One row per |
|---|---|
| `participants` | participant (ID, group) |
| `sessions` | session (group, assistance, level set, start/finish, status, quiz score, device info) |
| `level_results` | level played (moves, optimal, efficiency, undos, blocks, hints, detector fires, time) |
| `quiz_answers` | quiz question |
| `events` | logged action: every move, block, undo, tile, hint, idle, detector fire, quiz answer. The full event is in `data` (jsonb) |

Example query (efficiency on Session 2 transfer levels by group):

```sql
select s.grp, l.kind, avg(l.efficiency) as eff, avg(l.secs) as secs, count(*)
from level_results l join sessions s using (session_key)
where s.session = 2 group by 1, 2 order by 1, 2;
```

## Claude artifact database

When the claude.ai version's database is available:

- `sessions/{key}`: metadata, per-level results, quiz answers, status
- `sessions/{key}/events/c0000…`: full event log in chunks of 250 events
- `participants/{pid}`: assigned group and session history

Exports: per-session JSON and CSVs for levels, events, quiz answers, and a summary of all sessions.

### Detector settings (`CFG` in `index.html`)

| Setting | Default | Meaning |
|---|---|---|
| `threshold` | 6 | Struggle score that triggers the detector |
| `levelGraceSecs` | 25 | No firing in the first N seconds of a level |
| `autoMinGapSecs` | 20 | Minimum seconds between hints |
| `autoMinGapActions` | 6 | Minimum actions between hints |
| `idleSecs` | 25 | Idle time that counts as struggle |

Score weights: progress −3, dead end +1.5, repeated block +1.5, loop +1, idle +0.5, new state +0.3, first block +0.3, undo without progress +0.4.
