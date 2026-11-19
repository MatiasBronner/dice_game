# Struggle detector: productive vs. unproductive struggle

The adaptive condition gives a hint only when the detector decides the player is struggling *unproductively*. The detector runs in **every** condition and logs `detector_fire` events, but only the adaptive group sees a hint. That gives you a counterfactual: in the control and help-always groups you can see when the adaptive assistant *would* have stepped in, and compare those moments across groups.

## Core idea

Because every level is solved exactly (BFS over position × die orientation), the game knows the **true remaining distance** to the exit after every action. That gives an objective progress signal, so the detector doesn't have to guess from timing alone.

| Productive struggle (lowers the score) | Unproductive struggle (raises the score) |
|---|---|
| Reaching a **new best** distance to the exit | **Revisiting** a die position+orientation you've already been in (looping) |
| **Discovering** a special tile for the first time | Repeating the **same blocked move** from the same state (not learning from the feedback) |
| **Recovering** from a dead end with Undo | Being in a **dead end** (exit unreachable without undoing) |
| Trying a move once and getting blocked (testing a rule) | Many actions **without any new progress** (stagnation) |
| Exploring **new states** (only a small cost, so long aimless wandering eventually adds up) | **Idling**: no input (a little for every 10 s) |

## Scoring

The detector keeps a struggle score per level (never below 0). Each action adds its weight:

| Event | Weight | Notes |
|---|---|---|
| `progress` (new best distance) | **−3** | Also resets the stagnation counter |
| `recovery` (undo out of a dead end) | −1 | |
| `discovery` (first time on ↻ or ⇅ in the session) | −1 | Learning the hidden mechanics is the point |
| `explore` (new state, no progress) | +0.2 | Free at first, adds up when wandering |
| `probe` (first block of this move from this state) | +0.3 | Testing a hypothesis |
| `undo` without progress | +0.4 | Added to the state's own weight |
| `stagnation` | +0.5 per action | Once actions since the last progress exceed max(8, 1.5 × remaining optimal distance) |
| `idle` | +0.05 per 10 s | For every full 10 s without any input, from the player's last action, always (no grace period) |
| `loop` (revisited state) | +1 | |
| `repeat_block` (same blocked move again) | +1.5 | |
| `deadend` (exit unreachable) | +1.5 | Per action while stuck |

**Restart** doesn't change the struggle score. It does reset progress tracking (best distance, the stagnation count and revisits) to the start square, so a fresh attempt can earn "progress" again and walking back over the opening isn't counted as looping.

## When a hint fires

All of these must hold:

- score ≥ **6**
- at least **25 s** into the level (grace period for reading the board)
- at least **20 s** and **6 actions** since the last hint or fire
- no hint currently showing

After a fire, the score resets to 0. Every fire is logged with the score, the last 8 action types, and a `cause` label (`loop`, `repeat_block`, `deadend`, `idle`, `stagnation` or `general`).

## What the hint is

A **ghost die** demonstrates the next moves of an optimal solution from the player's current state, including what special tiles do: **2 moves on easy levels, 3 on medium, 5 on hard** (`hintMovesEasy`, `hintMovesMedium`, `hintMovesHard`; this applies to both hint conditions). It loops until the player does anything (a key, a click or a swipe). A caption lists the moves and points out the key moment, such as reaching a number square with the right face up. In a dead end, the hint says to undo instead.

- **Help-always (link 4):** the lightbulb is always available; clicking it starts the ghost.
- **Adaptive (link 3):** the bulb is dim ("Assistant watching"). When the detector fires, the hint **plays straight away** (`adaptiveAutoPlay = true`), and the player **can't move, undo, restart or skip until the ghost has played the demonstration twice** (`adaptiveLockLoops = 2`; one play is about 2.8 s for a 2-move hint, so the lock is roughly 5.7 s on easy, 8.4 s on medium and 10.4 s on hard, a bit longer when a special square is involved). The pad and buttons are greyed out and the caption says to watch. After that the caption says "Your turn", and the ghost keeps looping until any input. A dead-end hint ("undo a few moves") has no demonstration, so it doesn't lock. Logged: `hint` (with `len` and `lockMs`) and `hint_unlocked`. To go back to offering the hint and waiting for a click, set `adaptiveAutoPlay = false`.
- Hints only exist in the 15 levels of each set. The practice level never shows them.

## Tuning

The quickest way to tune is the **development link** (`/play/1/`). Edit the weights and thresholds on its setup screen, then play while watching the detector panel. It shows the score, each action's classification, and the reason a fire is or isn't allowed right now. **Fire detector** and **Hint now** let you check the hint without having to struggle first.

All weights and thresholds are in `CFG` at the top of `app.js`. Suggested approach: run a pilot in the **control** condition, then look at `detector_fire` events against later outcomes, for example whether the player solved the level, how many more moves they needed, or whether they skipped. A good threshold fires where players would otherwise stall or skip, and stays quiet where they recover on their own.

Useful queries:

```sql
-- How often the detector fires per level, by condition (counterfactual in control/help)
select s.mode, l.tier, avg(l.detector_fires) fires, avg(l.hints) hints, avg(l.efficiency) eff
from level_results l join sessions s using (session_key)
where l.phase = 'training' and s.mode <> 'dev' group by 1, 2 order by 1, 2;

-- What triggered each fire
select s.mode, e.data->>'cause' cause, count(*)
from events e join sessions s using (session_key)
where e.type = 'detector_fire' and s.mode <> 'dev' group by 1, 2 order by 1, 3 desc;
```

## Open design questions

- **Hint length.** Set by tier (2 / 3 / 5). On easy levels 2 moves is still up to half a short solution; on hard levels 5 moves is about a third.
- **Offered vs. automatic.** The study now plays the hint automatically and makes the player watch it twice. That makes sure the hint is seen at the moment the detector picks, at the cost of the player's control over timing. The offered version (`adaptiveAutoPlay = false`) is still available; it logs `hint_offer`, `help_click.waitedMs`, and `hintOffers` / `hintOfferUnused` on each `level_done` event.
- **Help-always overuse.** Unlimited hints let a player chain them to the exit. All hint use is logged (`hints`, `hint_ms`), so you can measure it; capping hints per level would change the condition.
