#!/usr/bin/env node
/* Struggle-detector simulator.
   Runs the REAL detector and hint code from app.js (pulled out by function name, so it always tests the
   current file) against simulated players on every training level, and reports how often the detector
   fires and how much of each solution the hints give away.

   Simulated players are crude: at each step they make the optimal move with probability `skill`,
   otherwise a random direction; they sometimes undo, think, or go idle. Use the numbers to compare
   settings with each other, not as a prediction of real fire rates. Pilot data is the real test.

   Usage: node tools/sim_detector.js [app.js] [--runs N] [--cond control|adaptive] [--cfg '{"threshold":8}']  */
const fs = require("fs"), path = require("path"), vm = require("vm");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const appPath = args[0] && !args[0].startsWith("--") ? args[0] : path.join(__dirname, "..", "app.js");
const RUNS = +opt("--runs", 40), COND = opt("--cond", "control"), OVR = JSON.parse(opt("--cfg", "{}"));
const src = fs.readFileSync(appPath, "utf8");

// A top-level statement starts at column 0; its continuation lines are indented.
function chunk(re) {
  const lines = src.split("\n"), i = lines.findIndex(l => re.test(l));
  if (i < 0) return "";
  let j = i + 1; while (j < lines.length && /^\s/.test(lines[j]) && lines[j].trim()) j++;
  return lines.slice(i, j).join("\n");
}
const fn = n => chunk(new RegExp("^function " + n + "\\("));
const cst = n => chunk(new RegExp("^const " + n + "\\s*="));
const NAMES = ["rec", "followEnd", "followStep", "roll", "tileFx", "face", "tryMove", "bfs", "loadLevel", "dist", "act", "restart", "undo", "evalState", "struggle",
  "idleTick", "afterAct", "gate", "checkDetector", "fire", "dominant", "hintLen", "giveHint", "endHint"];
// the per-level state, taken from startLevel() so the sim always starts a level the way the game does
const sl = fn("startLevel"), gInit = sl.slice(sl.indexOf(" G={"), sl.indexOf("\n", sl.indexOf("G.visits.set(")));
const code = [cst("CFG"), cst("D"), cst("O0"), cst("skey"), cst("hintLocked"), cst("DIRW"), cst("posx"), ...NAMES.map(fn)].filter(Boolean).join("\n");

const LV = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(path.dirname(appPath), "levels.js"), "utf8"), { window: w }); return w.RDM_LEVELS; })();
const SETS = { A: [], B: [] }; // levels in the order and tier the study uses; set doesn't matter here
const levels = LV.training;

function makeWorld(seed) {
  let clock = 0, a = seed;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ctx = {
    now: () => clock, Math, Map, Set, JSON, Infinity, setTimeout: () => 0, clearTimeout: () => {}, clearInterval: () => {},
    V: { ok: false, gh: null }, DLG: null, Q: null, idleTimer: 0, events: [],
    log: (type, d) => { const e = { type, t: clock, ...d }; ctx.events.push(e); if (type === "tile") ctx.S.log.push(e); }, drawPanel() {}, drawBulb() {}, finish: () => { ctx.G.done = true; },
    levelHash: () => "", assist: () => true, startGhost: (L, r, c, o, seq) => { ctx.V.gh = { cycle: 700 + 1100 * seq.length }; },
    stopGhost: () => { ctx.V.gh = null; }, S: { cond: COND, log: [] }, window: {}, document: { visibilityState: "visible" },
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\nthis.CFG=CFG;this.api={act,undo,restart,idleTick,dist,bfs,loadLevel,tryMove,giveHint};", ctx);
  Object.assign(ctx.CFG, OVR, { W: { ...ctx.CFG.W, ...(OVR.W || {}) } });
  return { ctx, rnd, adv: ms => { clock += ms; }, get clock() { return clock; } };
}

function playLevel(w, def, p) {
  const { ctx, rnd } = w, A = ctx.api;
  ctx.L = A.loadLevel(def); ctx.events.length = 0;
  vm.runInContext(gInit + ";this.G=G;", ctx);
  const G = ctx.G, t0 = w.clock, DIRS = ["N", "S", "E", "W"];
  let nextIdle = 1000, follow = [], hintMoves = 0, acts = 0, firesAfterProgress = 0, lastProgressAct = -99;
  const tick = ms => { // advance the clock, running the 1 s idle check like the game does
    const end = w.clock + ms;
    while (w.clock < end) { const step = Math.min(end - w.clock, t0 + nextIdle - w.clock); w.adv(step); if (w.clock - t0 >= nextIdle) { A.idleTick(); nextIdle += 1000; } }
  };
  while (!G.done && acts < 400 && w.clock - t0 < 300000) {
    const before = ctx.events.length;
    // think time: mostly 1-3.5 s, sometimes a long think
    tick(rnd() < p.longThink ? 15000 + rnd() * 35000 : 1000 + rnd() * 2500);
    if (G.hint && G.hint.lockUntil && w.clock < G.hint.lockUntil) tick(G.hint.lockUntil - w.clock + 50);
    if (G.done) break;
    const d = A.dist(); let did;
    if (follow.length && rnd() < p.followHint) { did = follow.shift(); A.act(did); hintMoves++; }
    else {
      follow = [];
      if (d === Infinity && G.hist.length && rnd() < p.undoDeadend) { A.undo(); did = "undo"; }
      else if (G.hist.length && rnd() < p.undo) { A.undo(); did = "undo"; }
      else { const path = A.bfs(ctx.L, G.r, G.c, G.o); did = path && rnd() < p.skill ? path[0] : DIRS[Math.floor(rnd() * 4)]; A.act(did); }
    }
    acts++;
    for (const e of ctx.events.slice(before)) {
      if (e.type === "state" && e.cls === "progress") lastProgressAct = acts;
      if (e.type === "detector_fire" && acts - lastProgressAct <= 2) firesAfterProgress++;
      if (e.type === "hint" && e.shown) follow = e.shown.split("");
    }
  }
  const ev = ctx.events, fires = ev.filter(e => e.type === "detector_fire");
  // "recovered anyway": after a fire, did the player make new progress within 5 actions? (only meaningful in control)
  let recovered = 0;
  fires.forEach(f => { const i = ev.indexOf(f); let n = 0; for (let j = i + 1; j < ev.length && n < 5; j++) { if (ev[j].type === "state" || ev[j].type === "blocked") n++; if (ev[j].type === "state" && ev[j].cls === "progress") { recovered++; break; } } });
  const causes = {}; fires.forEach(f => causes[f.cause] = (causes[f.cause] || 0) + 1);
  return { tier: def.tier, opt: def.opt, solved: G.done, secs: (w.clock - t0) / 1000, fires: fires.length, recovered, firesAfterProgress, causes,
    hints: ev.filter(e => e.type === "hint").length, hintLens: ev.filter(e => e.type === "hint").map(e => e.len), hintMoves, moves: G.moves };
}

const PLAYERS = [ // three rough skill levels
  { name: "weak", skill: .35, undo: .08, undoDeadend: .5, longThink: .06, followHint: .85 },
  { name: "mid", skill: .55, undo: .08, undoDeadend: .6, longThink: .05, followHint: .85 },
  { name: "strong", skill: .75, undo: .06, undoDeadend: .7, longThink: .04, followHint: .85 },
];
const res = [];
for (let run = 0; run < RUNS; run++) for (const p of PLAYERS) {
  const w = makeWorld(run * 7919 + p.skill * 1000);
  for (const def of levels) res.push({ p: p.name, ...playLevel(w, def, p) });
}
const avg = (a, f) => a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0;
const out = { cfg: OVR, cond: COND, byTier: {}, byPlayer: {}, causes: {} };
for (const t of ["easy", "medium", "hard"]) {
  const r = res.filter(x => x.tier === t), fires = r.reduce((s, x) => s + x.fires, 0);
  out.byTier[t] = { firesPerLevel: +avg(r, x => x.fires).toFixed(2), levelsWithFire: +avg(r, x => x.fires > 0).toFixed(2),
    firesPerMin: +(fires / (r.reduce((s, x) => s + x.secs, 0) / 60)).toFixed(2), recoveredAnyway: +(r.reduce((s, x) => s + x.recovered, 0) / Math.max(1, fires)).toFixed(2),
    solved: +avg(r, x => x.solved).toFixed(2), mins: +avg(r, x => x.secs / 60).toFixed(1),
    hintsPerLevel: +avg(r, x => x.hints).toFixed(2), hintMovesShareOfOpt: +avg(r, x => x.hintMoves / x.opt).toFixed(2) };
}
for (const p of PLAYERS) { const r = res.filter(x => x.p === p.name); out.byPlayer[p.name] = { firesPerLevel: +avg(r, x => x.fires).toFixed(2), solved: +avg(r, x => x.solved).toFixed(2) }; }
res.forEach(x => { for (const c in x.causes) out.causes[c] = (out.causes[c] || 0) + x.causes[c]; });
console.log(JSON.stringify(out, null, 1));
