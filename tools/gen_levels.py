#!/usr/bin/env python3
"""Generate Rolling Die Maze levels and write levels.js.

Every candidate board is solved exactly (BFS over position x die orientation).
A board is kept only if it meets its slot's targets:

  opt        shortest solution length (moves)
  lockCost   opt minus the shortest solution with all number locks removed:
             how many extra moves the locks force (the "orientation planning" load)
  onPath     number of lock squares the shortest solution crosses
  needed     each special tile (spin/flip) on the board is necessary: removing it
             makes the level longer or unsolvable

Run:  python3 tools/gen_levels.py  (deterministic; change SEED for new boards)
"""
import json, random, sys
from collections import deque

SEED = 20261109
D = {"N": (-1, 0), "S": (1, 0), "E": (0, 1), "W": (0, -1)}

def roll(o, d):
    t, n, e = o
    return {"N": (7 - n, t, e), "S": (n, 7 - t, e), "E": (7 - e, n, t), "W": (e, n, 7 - t)}[d]

def tile_fx(o, tile):
    t, n, e = o
    if tile == "S": return (t, 7 - e, n)
    if tile == "F": return (7 - t, 7 - n, e)
    return o

def face(o, rule):
    return o[0] if rule == "top" else 7 - o[0]

def solve(rows, start, exit_, rule, o0=(1, 2, 3)):
    n = len(rows)
    s0 = (start[0], start[1], o0)
    prev = {s0: None}
    q = deque([s0])
    while q:
        s = q.popleft()
        r, c, o = s
        if (r, c) == tuple(exit_):
            path = []
            while prev[s]:
                s, d = prev[s]
                path.append(d)
            return path[::-1]
        for d, (dr, dc) in D.items():
            nr, nc = r + dr, c + dc
            if not (0 <= nr < n and 0 <= nc < n): continue
            ch = rows[nr][nc]
            if ch == "#": continue
            no = roll(o, d)
            if ch in "123456" and face(no, rule) != int(ch): continue
            if ch in "SF": no = tile_fx(no, ch)
            ns = (nr, nc, no)
            if ns not in prev:
                prev[ns] = (s, d)
                q.append(ns)
    return None

def replace(rows, pred, to="."):
    return ["".join(to if pred(ch) else ch for ch in row) for row in rows]

def metrics(rows, start, exit_, rule):
    p = solve(rows, start, exit_, rule)
    if p is None: return None
    free = solve(replace(rows, lambda ch: ch in "123456"), start, exit_, rule)
    r, c = start; on = 0; specials = set()
    for d in p:
        r += D[d][0]; c += D[d][1]
        ch = rows[r][c]
        if ch in "123456": on += 1
        if ch in "SF": specials.add(ch)
    needed = {}
    for t in "SF":
        if any(t in row for row in rows):
            alt = solve(replace(rows, lambda ch, t=t: ch == t), start, exit_, rule)
            needed[t] = alt is None or len(alt) > len(p)
    return {"opt": len(p), "lockCost": len(p) - len(free), "onPath": on,
            "locks": sum(ch in "123456" for row in rows for ch in row),
            "walls": sum(ch == "#" for row in rows for ch in row),
            "uses": "".join(sorted(specials)), "needed": needed,
            "manhattan": abs(start[0] - exit_[0]) + abs(start[1] - exit_[1]), "path": "".join(p)}

def make(rng, n, pw, pl, spin, flip):
    while True:
        cells = [(r, c) for r in range(n) for c in range(n)]
        start, exit_ = rng.sample(cells, 2)
        if abs(start[0] - exit_[0]) + abs(start[1] - exit_[1]) < n - 1: continue
        g = [["."] * n for _ in range(n)]
        free = [x for x in cells if x not in (start, exit_)]
        rng.shuffle(free)
        k = 0
        for _ in range(spin): r, c = free[k]; g[r][c] = "S"; k += 1
        for _ in range(flip): r, c = free[k]; g[r][c] = "F"; k += 1
        for r, c in free[k:]:
            x = rng.random()
            if x < pw: g[r][c] = "#"
            elif x < pw + pl: g[r][c] = str(rng.randint(1, 6))
        return ["".join(row) for row in g], list(start), list(exit_)

def find(rng, spec, used, tries=60000):
    for _ in range(tries):
        rows, st, ex = make(rng, spec["n"], spec["pw"], spec["pl"], spec.get("spin", 0), spec.get("flip", 0))
        key = "".join(rows)
        if key in used: continue
        m = metrics(rows, st, ex, spec["rule"])
        if not m: continue
        lo, hi = spec["opt"]
        if not (lo <= m["opt"] <= hi): continue
        if m["lockCost"] < spec.get("lockCost", 0): continue
        if m["lockCost"] > spec.get("lockCostMax", 99): continue
        if m["onPath"] < spec.get("onPath", 0): continue
        if spec.get("spin") and not m["needed"].get("S"): continue
        if spec.get("flip") and not m["needed"].get("F"): continue
        used.add(key)
        return {"n": spec["n"], "rule": spec["rule"], "start": st, "exit": ex, "opt": m["opt"], "rows": rows, "metrics": m}
    raise SystemExit(f"no level found for {spec}")

def S(n, opt, lockCost=0, onPath=0, pw=.14, pl=.3, spin=0, flip=0, rule="top", lockCostMax=99):
    return dict(n=n, opt=opt, lockCost=lockCost, onPath=onPath, pw=pw, pl=pl, spin=spin, flip=flip, rule=rule, lockCostMax=lockCostMax)

# ---- the plan --------------------------------------------------------------
TRAINING = (
    # Easy 1-10: 5x5. Locks first, then the spin tile is discovered at level 8.
    [("easy", S(5, (4, 5), 0, 1, pl=.18, lockCostMax=1))] * 2 +
    [("easy", S(5, (5, 6), 1, 1, pl=.22, lockCostMax=2))] * 2 +
    [("easy", S(5, (6, 7), 2, 2, pl=.28, lockCostMax=3))] * 3 +
    [("easy", S(5, (6, 8), 1, 1, pl=.24, spin=1))] * 3 +
    # Medium 11-20: 6x6. The flip tile is discovered at level 13.
    [("medium", S(6, (9, 11), 3, 2, pl=.3))] * 2 +
    [("medium", S(6, (9, 12), 2, 2, pl=.28, flip=1))] * 2 +
    [("medium", S(6, (10, 12), 3, 2, pl=.3, spin=1))] * 2 +
    [("medium", S(6, (10, 13), 3, 2, pl=.3, flip=1))] * 2 +
    [("medium", S(6, (11, 13), 4, 3, pl=.32))] * 2 +
    # Hard 21-30: 6x6 then 7x7, longer, more locks, both special tiles.
    [("hard", S(6, (13, 16), 5, 3, pl=.34, spin=1))] * 2 +
    [("hard", S(6, (13, 16), 5, 3, pl=.34, flip=1))] * 2 +
    [("hard", S(6, (14, 17), 5, 3, pl=.34, spin=1, flip=1))] * 2 +
    [("hard", S(7, (15, 19), 6, 4, pl=.34))] * 2 +
    [("hard", S(7, (16, 20), 6, 4, pl=.34, spin=1, flip=1))] * 2
)
# Assessment (no help for anyone). Immediate and delayed sets are built in matched
# pairs from the same spec, so they're parallel in difficulty but use new boards.
ASSESS = [
    ("retention", S(6, (11, 13), 4, 3, pl=.32)),
    ("retention", S(6, (12, 14), 4, 3, pl=.32, spin=1)),
    ("near", S(7, (14, 17), 5, 3, pl=.32, spin=1, flip=1)),
    ("near", S(7, (14, 17), 5, 3, pl=.32, spin=1, flip=1)),
    ("far", S(6, (9, 12), 3, 2, pl=.3, rule="bottom")),
    ("far", S(6, (10, 13), 3, 2, pl=.3, rule="bottom", spin=1)),
]
PRACTICE = {"id": "P0", "phase": "practice", "tier": "practice", "rule": "top", "n": 4, "start": [2, 1], "exit": [1, 3], "opt": 3, "rows": ["....", "....", "....", "..#."]}

def main():
    rng = random.Random(SEED)
    used = set()
    out = {"practice": [PRACTICE], "training": [], "immediate": [], "delayed": []}
    for i, (tier, spec) in enumerate(TRAINING, 1):
        lv = find(rng, spec, used)
        out["training"].append({"id": f"T{i:02d}", "phase": "training", "tier": tier, **lv})
        print(f"T{i:02d} {tier:6} n={lv['n']} opt={lv['opt']:2} lockCost={lv['metrics']['lockCost']} onPath={lv['metrics']['onPath']} uses={lv['metrics']['uses']}", file=sys.stderr)
    for i, (tier, spec) in enumerate(ASSESS, 1):
        a = find(rng, spec, used)
        # matched partner: same spec, and opt and lockCost within 1 of the first
        for _ in range(200):
            b = find(rng, spec, used)
            if abs(b["opt"] - a["opt"]) <= 1 and abs(b["metrics"]["lockCost"] - a["metrics"]["lockCost"]) <= 1: break
        out["immediate"].append({"id": f"I{i}", "phase": "immediate", "tier": tier, **a})
        out["delayed"].append({"id": f"D{i}", "phase": "delayed", "tier": tier, **b})
        print(f"I{i}/D{i} {tier:9} opt={a['opt']}/{b['opt']} lockCost={a['metrics']['lockCost']}/{b['metrics']['lockCost']}", file=sys.stderr)
    with open("levels.js", "w") as f:
        f.write("// Generated by tools/gen_levels.py. Do not edit by hand.\n")
        f.write("window.RDM_LEVELS=" + json.dumps(out, separators=(",", ":")) + ";\n")

if __name__ == "__main__":
    main()
