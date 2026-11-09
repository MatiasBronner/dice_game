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

- **Hosted version:** published as a Claude artifact with a database, so sessions save automatically when it's opened on claude.ai while signed in.
- **Locally:** open `index.html` in a browser. Without the hosted database, sessions are saved in the browser's localStorage and can be exported from the end screen or the *Collected data* tab.

## Data

When the database is available:

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
