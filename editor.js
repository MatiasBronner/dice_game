/* Rolling Die Maze — level editor (development link only, play/1/).
   Edits are kept in this browser until you export a new levels.js and publish it to GitHub.
   Uses the game's own loadLevel / bfs / D from app.js, so the solver here is the one the game uses. */
(function(){
"use strict";
const EK="rdm3_level_edits",ORIG=JSON.parse(JSON.stringify(window.RDM_LEVELS));
const SHOWN=["practice","training","immediate"],GL={practice:"Practice",training:"Training",immediate:"End-of-session test"};
const TIERS={easy:[4,8],medium:[9,13],hard:[13,20]};
const PUBLISH_URL="https://github.com/MatiasBronner/dice_game/edit/main/levels.js";
const TOOLS=[[".","Empty","0"],["#","Wall","w"],["1","1","1"],["2","2","2"],["3","3","3"],["4","4","4"],["5","5","5"],["6","6","6"],["S","↻ Spin","r"],["F","⇅ Flip","f"],["start","Start","s"],["exit","Exit","x"]];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- storage ---------- */
const orig=id=>{for(const g in ORIG)for(const l of ORIG[g])if(l.id==id)return l;return null};
const key=d=>JSON.stringify([d.n,d.rule,d.start,d.exit,d.rows,d.tier]);
function edits(){let e={};try{e=JSON.parse(localStorage.getItem(EK))||{}}catch(_){}
 for(const id in e){const o=orig(id);if(!o||key(o)==key({...o,...e[id]}))delete e[id]}return e}
function putEdit(d){const e=edits(),o=orig(d.id);if(key(o)==key(d))delete e[d.id];else e[d.id]={n:d.n,rule:d.rule,start:d.start,exit:d.exit,rows:d.rows,tier:d.tier};
 try{localStorage.setItem(EK,JSON.stringify(e))}catch(_){}}
function dropEdit(id){const e=edits();delete e[id];try{localStorage.setItem(EK,JSON.stringify(e))}catch(_){}}
function current(id){const o=orig(id),e=edits()[id];return e?{...clone(o),...clone(e)}:clone(o)}
function withMetrics(d){const m=analyze(d);if(!m.solvable)return d;const{solvable,...rest}=m;return{...d,opt:m.opt,metrics:rest}}
function merged(){const e=edits(),out={};for(const g in ORIG)out[g]=ORIG[g].map(l=>e[l.id]?withMetrics({...clone(l),...clone(e[l.id])}):l);return out}

/* ---------- analysis (same measures as tools/gen_levels.py) ---------- */
function analyze(d){const st=d.start,solve=def=>bfs(loadLevel(def),st[0],st[1],[1,2,3]);
 const bad=validate(d);if(bad)return{solvable:false,why:bad};
 const p=solve(d);if(!p)return{solvable:false,why:"No way to reach the exit from the start."};
 const pf=solve({...d,rows:d.rows.map(r=>r.replace(/[1-6]/g,"."))});
 let r=st[0],c=st[1],on=0;const uses=new Set(),cells=[[r,c]];
 for(const m of p){r+=D[m][0];c+=D[m][1];cells.push([r,c]);const ch=d.rows[r][c];if(/[1-6]/.test(ch))on++;if(ch=="S"||ch=="F")uses.add(ch)}
 const needed={};for(const t of["S","F"])if(d.rows.some(x=>x.includes(t))){const pa=solve({...d,rows:d.rows.map(x=>x.split(t).join("."))});needed[t]=!pa||pa.length>p.length}
 const cnt=re=>d.rows.join("").split("").filter(ch=>re.test(ch)).length;
 return{solvable:true,opt:p.length,lockCost:p.length-(pf?pf.length:p.length),onPath:on,locks:cnt(/[1-6]/),walls:cnt(/#/),
  uses:[...uses].sort().join(""),needed,manhattan:Math.abs(st[0]-d.exit[0])+Math.abs(st[1]-d.exit[1]),path:p.join(""),cells}}
function validate(d){const n=d.n,inb=([r,c])=>r>=0&&c>=0&&r<n&&c<n;
 if(!inb(d.start)||!inb(d.exit))return"Start or exit is off the board.";
 if(d.start[0]==d.exit[0]&&d.start[1]==d.exit[1])return"Start and exit are on the same square.";
 if(d.rows[d.start[0]][d.start[1]]!=".")return"The start square must be empty.";
 if(d.rows[d.exit[0]][d.exit[1]]!=".")return"The exit square must be empty.";return""}

/* ---------- change summary ---------- */
function changes(d){const o=orig(d.id),out=[];if(!o)return out;
 if(o.n!=d.n)out.push(`Board ${o.n}×${o.n} → ${d.n}×${d.n}`);
 let k=0;for(let r=0;r<Math.max(o.n,d.n);r++)for(let c=0;c<Math.max(o.n,d.n);c++){const a=(o.rows[r]||"")[c],b=(d.rows[r]||"")[c];if(a!==undefined&&b!==undefined&&a!==b)k++}
 if(k)out.push(`${k} square${k>1?"s":""} changed`);
 if(o.start+""!=d.start+"")out.push("Start moved");if(o.exit+""!=d.exit+"")out.push("Exit moved");
 if(o.rule!=d.rule)out.push(`Rule ${o.rule} → ${d.rule}`);if(o.tier!=d.tier)out.push(`Tier ${o.tier} → ${d.tier}`);
 return out}

/* ---------- editor UI ---------- */
const E={id:null,d:null,tool:"#",path:true,painting:false,last:null};
function open(id){if(typeof devStop=="function")devStop();E.id=id&&orig(id)?id:(E.id||"T01");E.d=current(E.id);
 try{history.replaceState(null,"","#editor")}catch(_){}render()}
function listHTML(){const e=edits();return SHOWN.map(g=>`<div class="elg">${GL[g]}</div>`+ORIG[g].map(l=>{const c=e[l.id]?{...l,...e[l.id]}:l;
 return`<button class="eli${l.id==E.id?" on":""}" data-id="${l.id}"><span>${l.id}</span><span class="mu">${c.tier}${c.rule=="bottom"?" · bottom":""}</span>${e[l.id]?`<i class="edot" title="Edited"></i>`:""}</button>`}).join("")).join("")}
function render(){const d=E.d,n=d.n,nEd=Object.keys(edits()).length;
 app.innerHTML=bar(`<span class="chip">Development · Level editor</span>`)+`<main class="editor">
 <aside class="elist">${listHTML()}</aside>
 <section class="ecenter">
  <div class="etop"><div><div class="lbl">${GL[d.phase]||d.phase}</div><h2 class="eid">${d.id}</h2></div>
   <div class="eopts"><label>Size<select id="esz">${[4,5,6,7,8].map(k=>`<option ${k==n?"selected":""}>${k}</option>`).join("")}</select></label>
   <label>Numbers check<select id="erule"><option value="top" ${d.rule=="top"?"selected":""}>top face</option><option value="bottom" ${d.rule=="bottom"?"selected":""}>bottom face</option></select></label>
   ${d.phase=="training"?`<label>Tier<select id="etier">${["easy","medium","hard"].map(t=>`<option ${t==d.tier?"selected":""}>${t}</option>`).join("")}</select></label>`:""}</div></div>
  <div class="tools" role="toolbar" aria-label="Paint tools">${TOOLS.map(([k,l,s])=>`<button class="tool t${k=="."?"empty":k=="#"?"wall":/\d/.test(k)?"lock":k}${E.tool==k?" on":""}" data-t="${k}" title="${l} (key ${s.toUpperCase()})">${l}</button>`).join("")}</div>
  <div class="egrid" id="egrid" style="grid-template-columns:repeat(${n},1fr)">${Array.from({length:n*n},(_,i)=>`<div class="ecell" data-r="${Math.floor(i/n)}" data-c="${i%n}"></div>`).join("")}</div>
  <p class="mu ehelp">Click or drag to paint. Keys: <kbd>W</kbd> wall, <kbd>1</kbd>–<kbd>6</kbd> numbers, <kbd>R</kbd> ↻, <kbd>F</kbd> ⇅, <kbd>S</kbd> start, <kbd>X</kbd> exit, <kbd>0</kbd> empty, <kbd>P</kbd> show/hide solution.</p>
 </section>
 <aside class="eside" id="eside"></aside></main>`;
 app.querySelectorAll(".eli").forEach(b=>b.onclick=()=>open(b.dataset.id));
 app.querySelectorAll(".tool").forEach(b=>b.onclick=()=>{E.tool=b.dataset.t;app.querySelectorAll(".tool").forEach(x=>x.classList.toggle("on",x===b))});
 $("#esz").onchange=e=>resize(+e.target.value);$("#erule").onchange=e=>{E.d.rule=e.target.value;changed()};
 if($("#etier"))$("#etier").onchange=e=>{E.d.tier=e.target.value;changed()};
 const g=$("#egrid"),at=e=>{const el=document.elementFromPoint(e.clientX,e.clientY);return el&&el.closest&&el.closest(".ecell")};
 g.onpointerdown=e=>{const c=e.target.closest(".ecell");if(!c)return;e.preventDefault();E.painting=true;E.last=null;paint(c)};
 g.onpointermove=e=>{if(!E.painting)return;const c=at(e);if(c)paint(c)};
 window.onpointerup=()=>{if(E.painting){E.painting=false;changed()}};
 changed(true)}
function paint(cell){const r=+cell.dataset.r,c=+cell.dataset.c,k=r+","+c;if(E.last==k)return;E.last=k;const d=E.d,t=E.tool;
 const isS=d.start[0]==r&&d.start[1]==c,isX=d.exit[0]==r&&d.exit[1]==c,set=ch=>{d.rows[r]=d.rows[r].slice(0,c)+ch+d.rows[r].slice(c+1)};
 if(t=="start"){if(isX)return;d.start=[r,c];set(".")}
 else if(t=="exit"){if(isS)return;d.exit=[r,c];set(".")}
 else{if(isS||isX)return;set(t)}
 drawCells(null)}
function resize(n){const d=E.d,o=d.n;d.rows=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>r<o&&c<o?d.rows[r][c]:".").join(""));d.n=n;
 const cl=([r,c])=>[Math.min(r,n-1),Math.min(c,n-1)];d.start=cl(d.start);d.exit=cl(d.exit);
 if(d.start+""==d.exit+"")d.exit=[n-1,n-1]+""==d.start+""?[0,0]:[n-1,n-1];
 [d.start,d.exit].forEach(([r,c])=>{d.rows[r]=d.rows[r].slice(0,c)+"."+d.rows[r].slice(c+1)});putEdit(d);render()}
function drawCells(m){const d=E.d,steps={};
 if(m&&m.solvable&&E.path)m.cells.forEach(([r,c],i)=>{if(i){(steps[r+","+c]=steps[r+","+c]||[]).push(i)}});
 app.querySelectorAll(".ecell").forEach(el=>{const r=+el.dataset.r,c=+el.dataset.c,ch=d.rows[r][c],isS=d.start[0]==r&&d.start[1]==c,isX=d.exit[0]==r&&d.exit[1]==c;
  el.className="ecell "+(isS?"cstart":isX?"cexit":ch=="#"?"cwall":/[1-6]/.test(ch)?"clock":ch=="S"?"cspin":ch=="F"?"cflip":"");
  const st=steps[r+","+c];
  el.innerHTML=`<b>${isS?"Start":isX?"⚑":ch=="#"||ch=="."?"":ch=="S"?"↻":ch=="F"?"⇅":ch}</b>${st?`<span class="step">${st.join(",")}</span>`:""}`})}
function changed(first){const d=E.d,m=analyze(d),o=orig(d.id),om=analyze(o);if(!first)putEdit(d);drawCells(m);
 const ch=changes(d),isEd=ch.length>0,[lo,hi]=TIERS[d.tier]||[0,99],nEd=Object.keys(edits()).length;
 const needTxt=t=>!d.rows.some(x=>x.includes(t))?"not on board":m.solvable&&m.needed[t]?"needed":`<span class="warn">not needed</span>`;
 const delta=m.solvable&&om.solvable&&m.opt!=om.opt?` <span class="mu">(was ${om.opt}, ${m.opt>om.opt?"+":""}${m.opt-om.opt})</span>`:"";
 $("#eside").innerHTML=`
 <div class="estat ${m.solvable?"ok":"bad"}">${m.solvable?"Solvable":"Not solvable"}</div>
 ${m.solvable?`<div class="ebig"><b>${m.opt}</b> moves in the best solution${delta}</div>
 <div class="hudg emetrics"><span>Lock detour</span><b>${m.lockCost} <span class="mu">extra moves forced by numbers</span></b>
 <span>Numbers crossed</span><b>${m.onPath} of ${m.locks}</b><span>Walls</span><b>${m.walls}</b>
 <span>↻ square</span><b>${needTxt("S")}</b><span>⇅ square</span><b>${needTxt("F")}</b>
 <span>Best path</span><b class="epath">${m.path.split("").map(x=>({N:"▲",S:"▼",E:"▶",W:"◀"}[x])).join("")}</b></div>
 ${d.phase=="training"&&(m.opt<lo||m.opt>hi)?`<div class="note warn">${m.opt} moves is outside the usual ${d.tier} range (${lo}–${hi}).</div>`:""}
 ${[..."SF"].some(t=>d.rows.some(x=>x.includes(t))&&!m.needed[t])?`<div class="note warn">A special square that isn't needed can be ignored, so players may never discover it.</div>`:""}`
 :`<div class="note bad">${esc(m.why)}</div>`}
 <label class="tog" style="margin-top:12px"><input type="checkbox" id="epath" ${E.path?"checked":""}> Show best solution on the board</label>
 <h3 class="eh">Changes from the published level</h3>
 ${isEd?`<ul class="echg">${ch.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p class="mu" style="margin:4px 0">None. This is the published version.</p>`}
 <div class="ebtns"><button class="btn-p" id="eplay" ${m.solvable?"":"disabled"}>▶ Play test</button><button id="erev" ${isEd?"":"disabled"}>Revert level</button></div>
 <div class="ebtns"><button id="eall">All changes${nEd?` (${nEd})`:""} & publish</button><button class="btn-ghost" id="eback">Dev setup</button></div>`;
 $("#epath").onchange=e=>{E.path=e.target.checked;drawCells(m)};
 $("#eplay").onclick=()=>{if(typeof devPlaytest=="function")devPlaytest(d.id)};
 $("#erev").onclick=async()=>{if(await ask("Revert "+d.id+"?","Your changes to this level will be discarded.","Revert")){dropEdit(d.id);open(d.id)}};
 $("#eall").onclick=summary;$("#eback").onclick=()=>{try{history.replaceState(null,"",location.pathname)}catch(_){}devSetup()};
 const it=app.querySelector(`.eli[data-id="${d.id}"]`);if(it){const has=!!edits()[d.id];let dot=it.querySelector(".edot");if(has&&!dot)it.insertAdjacentHTML("beforeend",`<i class="edot" title="Edited"></i>`);if(!has&&dot)dot.remove()}}

/* ---------- all changes + export ---------- */
function levelsJS(){const m=merged(),groups=Object.keys(m);
 return"// Rolling Die Maze levels: one level per line. Generated by tools/gen_levels.py, then edited with the\n// level editor (development link → Level editor). Re-running the generator replaces hand edits.\n"+
  "window.RDM_LEVELS={\n"+groups.map(g=>JSON.stringify(g)+":[\n"+m[g].map(l=>JSON.stringify(l)).join(",\n")+"\n]").join(",\n")+"\n};\n"}
function summary(){const e=edits(),ids=Object.keys(e).sort();
 const rows=ids.map(id=>{const d=current(id),a=analyze(orig(id)),b=analyze(d);
  return`<tr><td><b>${id}</b></td><td>${changes(d).map(esc).join(" · ")}</td><td>${a.solvable?a.opt:"–"} → ${b.solvable?b.opt:`<span class="warn">unsolvable</span>`}</td><td><button data-o="${id}">Open</button> <button data-rv="${id}">Revert</button></td></tr>`}).join("");
 const bad=ids.filter(id=>!analyze(current(id)).solvable);
 const dl=document.createElement("div");dl.className="dlg";dl.innerHTML=`<div class="sheet wide" role="dialog" aria-modal="true" style="max-height:90vh;overflow:auto">
 <div class="eyebrow">Level editor</div><h2 style="font-size:26px;margin:4px 0 10px">Your changes</h2>
 ${ids.length?`<div class="tbl"><table><tr><th>Level</th><th>What changed</th><th>Best moves</th><th></th></tr>${rows}</table></div>`:`<p class="mu">You haven't changed any levels.</p>`}
 ${bad.length?`<div class="note bad">${bad.join(", ")} can't be solved. Fix ${bad.length>1?"them":"it"} before publishing.</div>`:""}
 <p class="mu" style="font-size:14px;margin-top:14px">Changes live only in this browser until you publish them. Participants keep playing the published levels until then.</p>
 ${ids.length?`<h3 style="font-size:17px;margin:16px 0 6px">Publish to the live game</h3>
 <ol class="steps"><li>Click <b>Copy new levels.js</b>.</li><li>Open <a href="${PUBLISH_URL}" target="_blank" rel="noopener">levels.js on GitHub</a> (you'll be in edit mode).</li><li>Select all the text there, paste, then click <b>Commit changes</b>.</li></ol>
 <p class="mu" style="font-size:14px">The live game updates within a couple of minutes. GitHub's commit view shows exactly which levels changed, one line per level.</p>`:""}
 <div class="row" style="margin-top:14px">${ids.length?`<button class="btn-p" id="xcopy" ${bad.length?"disabled":""}>Copy new levels.js</button><button id="xdl" ${bad.length?"disabled":""}>Download levels.js</button><button id="xall">Revert all</button>`:""}<button id="xclose">Close</button></div>
 <textarea id="xta" readonly style="display:none;margin-top:12px;height:160px"></textarea></div>`;
 document.body.appendChild(dl);DLG=true;const close=()=>{dl.remove();DLG=false};
 dl.querySelector("#xclose").onclick=close;
 dl.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{close();open(b.dataset.o)});
 dl.querySelectorAll("[data-rv]").forEach(b=>b.onclick=()=>{dropEdit(b.dataset.rv);close();open(E.id);summary()});
 const xa=dl.querySelector("#xall");if(xa)xa.onclick=()=>{try{localStorage.removeItem(EK)}catch(_){}close();open(E.id)};
 const xc=dl.querySelector("#xcopy");if(xc)xc.onclick=async()=>{const t=levelsJS(),ta=dl.querySelector("#xta");ta.value=t;try{await navigator.clipboard.writeText(t);xc.textContent="Copied"}catch(_){ta.style.display="block";ta.select();xc.textContent="Select and copy below"}};
 const xd=dl.querySelector("#xdl");if(xd)xd.onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([levelsJS()],{type:"text/javascript"}));a.download="levels.js";document.body.appendChild(a);a.click();a.remove()}}

document.addEventListener("keydown",e=>{if(DLG||!$("#egrid")||e.target.matches("input,select,textarea"))return;const k=e.key.toLowerCase();
 if(k=="p"){E.path=!E.path;const cb=$("#epath");if(cb)cb.checked=E.path;changed(true);return}
 const t=TOOLS.find(x=>x[2]==k);if(t){E.tool=t[0];app.querySelectorAll(".tool").forEach(b=>b.classList.toggle("on",b.dataset.t==t[0]))}});

window.RDM_EDITOR={open,merged,original:()=>clone(ORIG),count:()=>Object.keys(edits()).length,edited:id=>!!edits()[id],analyze};
})();
