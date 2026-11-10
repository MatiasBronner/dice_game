/* Rolling Die Maze v3 — shared game script. Each study URL (play/1..4/index.html) sets
   window.RDM = {mode: "dev" | "control" | "adaptive" | "help"} and loads levels.js + this file. */

/* ======================= CONFIG ======================= */
// Supabase: project URL and publishable/anon key (public by design; tables are write-only, see supabase/schema.sql).
const SUPABASE_URL="https://wxegmqwqrqdfehisuwkl.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_rWa5xKlL8iRVmuFsF6Uavg_n3aLq4w_";

const MODES={
 dev:     {session:1,group:"dev",     cond:"none",    label:"Development"},
 control: {session:1,group:"none",    cond:"none",    label:"Training session"},
 adaptive:{session:1,group:"adaptive",cond:"adaptive",label:"Training session"},
 help:    {session:1,group:"user",    cond:"user",    label:"Training session"}};
const MODE=(window.RDM&&MODES[window.RDM.mode])?window.RDM.mode:"control";let M=MODES[MODE];
const DEV=MODE=="dev";

const CFG={
 hintMoves:3,             // moves the ghost die demonstrates
 adaptiveAutoPlay:true,   // adaptive: true = hint plays as soon as the detector fires; false = bulb lights up and waits for a click
 skipAfterSecs:300,       // "Skip level" appears after this long on one level
 // --- struggle detector (see DETECTOR.md) ---
 threshold:6,             // struggle score that fires the detector
 levelGraceSecs:25,       // never fire in the first N seconds of a level
 minGapSecs:20,           // ...or within N seconds of the last hint/fire
 minGapActions:6,         // ...or within N actions of the last hint/fire
 idleSecs:25,             // idle this long counts as struggle (checked every 5 s)
 stagnationBase:8,        // actions without a new best distance before "stagnation" starts adding
 stagnationFactor:1.5,    // ...or 1.5 x the remaining optimal distance, whichever is larger
 W:{progress:-3,recovery:-1,discovery:-1,explore:.2,probe:.3,undoNoProgress:.4,stagnation:.5,idle:.5,loop:1,repeatBlock:1.5,deadend:1.5}};

const CFG_DEFAULT=JSON.parse(JSON.stringify(CFG));

/* ======================= GAME LOGIC ======================= */
const D={N:[-1,0],S:[1,0],E:[0,1],W:[0,-1]};
function roll(o,d){const[t,n,e]=o;return d=="N"?[7-n,t,e]:d=="S"?[n,7-t,e]:d=="E"?[7-e,n,t]:[e,n,7-t]}
function tileFx(o,tile){const[t,n,e]=o;return tile=="spin"?[t,7-e,n]:tile=="flip"?[7-t,7-n,e]:o}
function face(o,rule){return rule=="top"?o[0]:7-o[0]}
function tryMove(L,r,c,o,d){const nr=r+D[d][0],nc=c+D[d][1];
 if(nr<0||nc<0||nr>=L.n||nc>=L.n||L.g[nr][nc].w)return{ok:false,why:"wall"};
 let no=roll(o,d);const cell=L.g[nr][nc];
 if(cell.num&&face(no,L.rule)!=cell.num)return{ok:false,why:"num",face:face(no,L.rule),need:cell.num,nr,nc};
 if(cell.tile)no=tileFx(no,cell.tile);return{ok:true,r:nr,c:nc,o:no,tile:cell.tile||null}}
function bfs(L,r,c,o){const k=(r,c,o)=>r+","+c+","+o.join(""),seen=new Map([[k(r,c,o),null]]),q=[[r,c,o]];
 for(let i=0;i<q.length;i++){const[r,c,o]=q[i];
  if(r==L.exit[0]&&c==L.exit[1]){const p=[];let s=k(r,c,o);while(seen.get(s)){p.unshift(seen.get(s)[1]);s=seen.get(s)[0]}return p}
  for(const d in D){const m=tryMove(L,r,c,o,d);if(!m.ok)continue;const s=k(m.r,m.c,m.o);if(!seen.has(s)){seen.set(s,[k(r,c,o),d]);q.push([m.r,m.c,m.o])}}}return null}
const $=s=>document.querySelector(s),app=$("#app");
const KEY={ArrowUp:"N",ArrowDown:"S",ArrowRight:"E",ArrowLeft:"W",w:"N",s:"S",d:"E",a:"W",W:"N",S:"S",D:"E",A:"W"};
const DIRNAME={N:"up",S:"down",E:"right",W:"left"},ARROW={N:"▲",S:"▼",E:"▶",W:"◀"};
const O0=[1,2,3];
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LV=window.RDM_LEVELS;
function planFor(m){return m.session==1?[...LV.practice,...LV.training,...LV.immediate]:[...LV.delayed]}
function loadLevel(def){const g=def.rows.map(r=>[...r].map(ch=>({w:ch=="#",num:/[1-6]/.test(ch)?+ch:0,tile:ch=="S"?"spin":ch=="F"?"flip":null})));
 return{id:def.id,phase:def.phase,tier:def.tier,n:def.n,g,start:def.start,exit:def.exit,rule:def.rule,kind:def.tier,opt:def.opt}}

/* ======================= 2D ART ======================= */
const PIPS={1:[[.5,.5]],2:[[.27,.27],[.73,.73]],3:[[.27,.27],[.5,.5],[.73,.73]],4:[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],5:[[.27,.27],[.73,.27],[.5,.5],[.27,.73],[.73,.73]],6:[[.27,.25],[.73,.25],[.27,.5],[.73,.5],[.27,.75],[.73,.75]]};
function faceSVG(n){return`<svg viewBox="0 0 1 1" aria-label="${n}"><rect x=".03" y=".03" width=".94" height=".94" rx=".2" fill="#f8f3e8"/>${PIPS[n].map(([u,v])=>`<circle cx="${u}" cy="${v}" r=".09" fill="#1b2140"/>`).join("")}</svg>`}
function pips(n,m){return`<g transform="matrix(${m})">${PIPS[n].map(([u,v])=>`<circle cx="${u}" cy="${v}" r=".095" fill="#1b2140"/>`).join("")}</g>`}
function dieSVG(o){const[t,n,e]=o,s=7-n;
 return`<svg viewBox="0 0 100 100" aria-label="Die: top ${t}, front ${s}, right ${e}">
 <polygon points="8,34 70,34 92,12 30,12" fill="#fffaf0" stroke="#1b2140" stroke-width="2" stroke-linejoin="round"/>
 <polygon points="8,34 70,34 70,96 8,96" fill="#ece3d0" stroke="#1b2140" stroke-width="2" stroke-linejoin="round"/>
 <polygon points="70,34 92,12 92,74 70,96" fill="#d3c8b0" stroke="#1b2140" stroke-width="2" stroke-linejoin="round"/>
 ${pips(t,"62,0,-22,22,30,12")}${pips(s,"62,0,0,62,8,34")}${pips(e,"22,-22,0,62,70,34")}</svg>`}
const MARK=`<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="2" y="2" width="22" height="22" rx="6" fill="#f8f3e8"/><circle cx="8" cy="8" r="2.2" fill="#1b2140"/><circle cx="13" cy="13" r="2.2" fill="#ffb547"/><circle cx="18" cy="18" r="2.2" fill="#1b2140"/></svg>`;
const BULB=`<svg viewBox="0 0 24 24" aria-hidden="true"><path class="glass" stroke-width="1.6" d="M12 2.6a6.6 6.6 0 0 0-3.9 11.9c.7.5 1.1 1.3 1.1 2.1v.6h5.6v-.6c0-.8.4-1.6 1.1-2.1A6.6 6.6 0 0 0 12 2.6z"/><path class="base" fill="none" stroke="#ffb547" stroke-width="1.6" stroke-linecap="round" d="M9.4 19.4h5.2M10.2 21.6h3.6"/></svg>`;

/* ======================= 3D VIEW ======================= */
const V={ok:false,R:null,scene:null,cam:null,board:null,die:null,ghost:null,gh:null,dieS:.84,n:0,q:[],cur:null,tiles:{},flag:null,exitMat:null,parts:[],mode:"none",host:null,ro:null,flash:[],faceTex:{}};
const lin=h=>new THREE.Color(h).convertSRGBToLinear();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function roundedBox(w,h,d,r,seg=12){const g=new THREE.BoxGeometry(w,h,d,seg,seg,seg),p=g.attributes.position,nr=g.attributes.normal,uv=g.attributes.uv,a=1/3;
 const H=[w/2,h/2,d/2],remap=(t,half)=>{const s=Math.sign(t),u=Math.abs(t);return s*(u<=a?u/a*(half-r):(half-r)+(u-a)/(1-a)*r)};
 const v=new THREE.Vector3(),inn=new THREE.Vector3(),dir=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);v.set(remap(v.x/H[0],H[0]),remap(v.y/H[1],H[1]),remap(v.z/H[2],H[2]));
  inn.set(clamp(v.x,-H[0]+r,H[0]-r),clamp(v.y,-H[1]+r,H[1]-r),clamp(v.z,-H[2]+r,H[2]-r));dir.subVectors(v,inn);
  if(dir.lengthSq()<1e-12)dir.fromBufferAttribute(nr,i);dir.normalize();p.setXYZ(i,inn.x+dir.x*r,inn.y+dir.y*r,inn.z+dir.z*r);nr.setXYZ(i,dir.x,dir.y,dir.z);
  const uu=uv.getX(i)*2-1,vv=uv.getY(i)*2-1,f=r/(w/2),g2=t=>{const s=Math.sign(t),u=Math.abs(t);return s*(u<=a?u/a*(1-f):(1-f)+(u-a)/(1-a)*f)};
  uv.setXY(i,(g2(uu)+1)/2,(g2(vv)+1)/2)}
 p.needsUpdate=true;nr.needsUpdate=true;uv.needsUpdate=true;return g}
const TS=256;
function tex(draw){const c=document.createElement("canvas");c.width=c.height=TS;const x=c.getContext("2d");draw(x,TS);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=8;return t}
function grad(x,a,b){const g=x.createLinearGradient(0,0,TS,TS);g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,TS,TS);
 x.strokeStyle="rgba(255,255,255,.10)";x.lineWidth=6;x.strokeRect(14,14,TS-28,TS-28)}
function dieFaceTex(n){return tex((x,S)=>{const g=x.createRadialGradient(S/2,S/2,S*.1,S/2,S/2,S*.75);g.addColorStop(0,"#fffcf4");g.addColorStop(1,"#eadfc8");x.fillStyle=g;x.fillRect(0,0,S,S);
 PIPS[n].forEach(([u,v])=>{const cx=u*S,cy=v*S,r=S*.085,R=n==1?r*1.25:r,pg=x.createRadialGradient(cx-r*.3,cy-r*.3,r*.1,cx,cy,R);pg.addColorStop(0,n==1?"#3a2a12":"#2b3360");pg.addColorStop(1,n==1?"#0f0a04":"#0d1128");
  x.fillStyle=pg;x.beginPath();x.arc(cx,cy,R,0,7);x.fill();x.strokeStyle="rgba(255,255,255,.55)";x.lineWidth=2;x.beginPath();x.arc(cx,cy+1.5,R+1,0.2,Math.PI-0.2);x.stroke()})})}
const TT={};
function tileTextures(){if(TT.plain)return TT;
 TT.plain=tex(x=>grad(x,"#4a5580","#3a4469"));
 TT.exit=tex((x,S)=>{grad(x,"#5fe3b0","#2aa77a");x.strokeStyle="rgba(255,255,255,.55)";x.lineWidth=7;x.setLineDash([16,12]);x.strokeRect(34,34,S-68,S-68);x.setLineDash([]);
  x.fillStyle="#fff";x.fillRect(96,70,10,120);x.beginPath();x.moveTo(106,72);x.lineTo(172,96);x.lineTo(106,122);x.fill()});
 TT.spin=tex((x,S)=>{grad(x,"#9b7cf6","#6a4bd4");x.strokeStyle="#fff";x.lineWidth=18;x.lineCap="round";const c=S/2,R=64,a0=-Math.PI*1.1,a1=Math.PI*0.55;
  x.beginPath();x.arc(c,c,R,a0,a1,false);x.stroke();const ex=c+R*Math.cos(a1),ey=c+R*Math.sin(a1),tx=-Math.sin(a1),ty=Math.cos(a1);
  x.fillStyle="#fff";x.beginPath();x.moveTo(ex+tx*34,ey+ty*34);x.lineTo(ex-ty*30-tx*6,ey+tx*30-ty*6);x.lineTo(ex+ty*30-tx*6,ey-tx*30-ty*6);x.fill()});
 TT.flip=tex((x,S)=>{grad(x,"#3ad4a0","#179068");x.fillStyle="#fff";x.strokeStyle="#fff";x.lineWidth=16;x.lineCap="round";
  const arr=(cx,up)=>{const y0=up?190:66,y1=up?92:164;x.beginPath();x.moveTo(cx,y0);x.lineTo(cx,y1);x.stroke();const s=up?-1:1;x.beginPath();x.moveTo(cx,y1+s*30);x.lineTo(cx-30,y1-s*4);x.lineTo(cx+30,y1-s*4);x.fill()};arr(96,true);arr(160,false)});
 return TT}
function lockTex(n){return tex((x,S)=>{grad(x,"#5f8bff","#3556c4");x.fillStyle="rgba(255,255,255,.16)";x.beginPath();x.arc(S/2,S/2,84,0,7);x.fill();
 x.fillStyle="#fff";x.font=`800 150px "Bricolage Grotesque", "Avenir Next", system-ui, sans-serif`;x.textAlign="center";x.textBaseline="middle";x.shadowColor="rgba(0,0,30,.35)";x.shadowBlur=10;x.shadowOffsetY=4;x.fillText(n,S/2,S/2+8)})}
function quatFor(o){const N={1:[0,1,0],6:[0,-1,0],2:[0,0,-1],5:[0,0,1],3:[1,0,0],4:[-1,0,0]},v=a=>new THREE.Vector3(...a);
 const[t,n,e]=o,m=new THREE.Matrix4().makeBasis(v(N[e]),v(N[t]),v(N[n]).negate()).transpose();return new THREE.Quaternion().setFromRotationMatrix(m)}
const AX={E:[[0,0,1],-1],W:[[0,0,1],1],S:[[1,0,0],1],N:[[1,0,0],-1]};
function arrowGeo(s=1){const sh=new THREE.Shape();sh.moveTo(0,.34*s);sh.lineTo(.24*s,.06*s);sh.lineTo(.09*s,.06*s);sh.lineTo(.09*s,-.3*s);sh.lineTo(-.09*s,-.3*s);sh.lineTo(-.09*s,.06*s);sh.lineTo(-.24*s,.06*s);sh.closePath();return new THREE.ShapeGeometry(sh).rotateX(-Math.PI/2)}
function initGL(){if(V.R)return V.ok;try{
 const R=V.R=new THREE.WebGLRenderer({antialias:true,alpha:true});R.setPixelRatio(Math.min(devicePixelRatio||1,2));R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
 R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.08;
 const sc=V.scene=new THREE.Scene();V.cam=new THREE.PerspectiveCamera(32,1,.1,200);
 sc.add(new THREE.HemisphereLight(0xdfe6ff,0x1a1f38,.62));
 const key=V.key=new THREE.DirectionalLight(0xfff0d8,1.35);key.position.set(-4,10,6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0006;key.shadow.radius=4;sc.add(key);sc.add(key.target);
 const fill=new THREE.DirectionalLight(0x8ea6ff,.45);fill.position.set(6,4,-5);sc.add(fill);
 const rim=new THREE.PointLight(0xffb547,.35,30);rim.position.set(0,5,-6);sc.add(rim);
 [1,2,3,4,5,6].forEach(n=>V.faceTex[n]=dieFaceTex(n));
 const geo=roundedBox(V.dieS,V.dieS,V.dieS,.11,12),order=[3,4,1,6,5,2];
 V.die=new THREE.Mesh(geo,order.map(n=>new THREE.MeshPhysicalMaterial({map:V.faceTex[n],roughness:.34,clearcoat:.7,clearcoatRoughness:.22})));V.die.castShadow=true;sc.add(V.die);
 V.ghost=new THREE.Mesh(geo,order.map(n=>new THREE.MeshStandardMaterial({map:V.faceTex[n],transparent:true,opacity:.5,depthWrite:false,emissive:lin(0xffb547),emissiveIntensity:.35})));V.ghost.renderOrder=3;V.ghost.visible=false;sc.add(V.ghost);
 V.ring=new THREE.Mesh(new THREE.RingGeometry(.36,.47,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:lin(0xffb547),transparent:true,opacity:.9,depthWrite:false}));V.ring.visible=false;sc.add(V.ring);
 V.arrowG=arrowGeo(.8);V.trail=[];
 V.ok=true;requestAnimationFrame(loop)}catch(e){console.warn(e);V.ok=false}return V.ok}
function mount(host){if(!initGL()){host.insertAdjacentHTML("afterbegin",`<div class="nogl">This browser can't draw the 3D board (WebGL is off). Please try Chrome, Edge or Firefox with hardware acceleration on.</div>`);return}
 V.host=host;host.prepend(V.R.domElement);if(V.ro)V.ro.disconnect();V.ro=new ResizeObserver(fit);V.ro.observe(host);fit()}
function fit(){if(!V.host)return;const w=V.host.clientWidth,h=V.host.clientHeight;if(!w||!h)return;V.R.setSize(w,h,false);V.cam.aspect=w/h;
 const f=Math.tan(THREE.MathUtils.degToRad(V.cam.fov/2));
 if(V.mode=="show"){V.cam.position.set(1.5,2.1,2.6);V.cam.lookAt(0,.35,0)}
 else{const n=V.n||5,dir=new THREE.Vector3(.3,1.28,1).normalize(),dv=(n*.62)/f,dh=(n*.66)/(f*V.cam.aspect),dist=Math.max(dv,dh)+n*.35;
  V.cam.position.copy(dir.multiplyScalar(dist));V.cam.lookAt(0,-.1,n*.04)}
 V.cam.updateProjectionMatrix()}
const W=(r,c)=>[c-(V.n-1)/2,r-(V.n-1)/2];
function clearBoard(){stopGhost();if(V.board){V.scene.remove(V.board);V.board.traverse(o=>{if(o.geometry&&o.geometry!==V.arrowG)o.geometry.dispose()})}V.board=new THREE.Group();V.scene.add(V.board);
 V.parts.forEach(m=>{V.scene.remove(m);m.material.dispose()});V.parts=[];V.tiles={};V.flag=null;V.exitMat=null;V.q=[];V.cur=null;V.flash=[];if(V.ring)V.ring.visible=false}
function buildBoard(L){V.mode="play";V.n=L.n;clearBoard();const T=tileTextures(),n=L.n;
 const base=new THREE.Mesh(roundedBox(n+.55,.42,n+.55,.2,8),new THREE.MeshStandardMaterial({color:lin(0x1d2442),roughness:.85}));base.position.y=-.33;base.receiveShadow=true;V.board.add(base);
 const side=new THREE.MeshStandardMaterial({color:lin(0x2c3456),roughness:.8}),tileG=roundedBox(.93,.14,.93,.05,12),wallG=roundedBox(.93,.48,.93,.08,10);
 const wallSide=new THREE.MeshStandardMaterial({color:lin(0x151a31),roughness:.7}),wallTop=new THREE.MeshStandardMaterial({color:lin(0x2a3157),roughness:.6});
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){const e=L.g[r][c],[x,z]=W(r,c),ex=r==L.exit[0]&&c==L.exit[1];
  if(e.w){const m=new THREE.Mesh(wallG,[wallSide,wallSide,wallTop,wallSide,wallSide,wallSide]);m.position.set(x,.1,z);m.castShadow=m.receiveShadow=true;V.board.add(m);continue}
  let top;if(e.num)top=new THREE.MeshStandardMaterial({map:lockTex(e.num),roughness:.5,emissive:lin(0x000000)});
  else if(e.tile)top=new THREE.MeshStandardMaterial({map:T[e.tile],roughness:.5,emissive:lin(0x000000)});
  else if(ex)top=V.exitMat=new THREE.MeshStandardMaterial({map:T.exit,roughness:.45,emissive:lin(0x2aa77a),emissiveIntensity:.25});
  else top=new THREE.MeshStandardMaterial({map:T.plain,roughness:.75});
  const m=new THREE.Mesh(tileG,[side,side,top,side,side,side]);m.position.set(x,-.07,z);m.receiveShadow=true;V.board.add(m);V.tiles[r+","+c]=top}
 const[fx,fz]=W(...L.exit),fg=new THREE.Group();fg.position.set(fx-.3,0,fz+.3);
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.05,12),new THREE.MeshStandardMaterial({color:lin(0xeeeeee),metalness:.6,roughness:.3}));pole.position.y=.52;pole.castShadow=true;fg.add(pole);
 const fs=new THREE.Shape();fs.moveTo(0,0);fs.lineTo(.42,-.13);fs.lineTo(0,-.27);const flag=new THREE.Mesh(new THREE.ShapeGeometry(fs),new THREE.MeshStandardMaterial({color:lin(0x7ef0b8),emissive:lin(0x2aa77a),emissiveIntensity:.4,side:THREE.DoubleSide}));
 flag.position.set(.02,1.02,0);flag.castShadow=true;fg.add(flag);V.board.add(fg);V.flag=flag;
 const k=V.key;k.shadow.camera.left=k.shadow.camera.bottom=-n*.9;k.shadow.camera.right=k.shadow.camera.top=n*.9;k.shadow.camera.near=1;k.shadow.camera.far=40;k.shadow.camera.updateProjectionMatrix();
 V.die.visible=true;fit()}
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function placeMesh(m,r,c,o){const[x,z]=W(r,c);m.position.set(x,V.dieS/2,z);m.quaternion.copy(quatFor(o));m.scale.setScalar(1)}
function poseRoll(m,d,r0,c0,o0,r1,c1,p){const e=ease(p),[a,s]=AX[d],q0=quatFor(o0),p0=W(r0,c0),p1=W(r1,c1),h=V.dieS/2,lift=h*(Math.SQRT2-1);
 m.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...a),s*Math.PI/2*e).multiply(q0));
 m.position.set(p0[0]+(p1[0]-p0[0])*e,h+lift*Math.sin(Math.PI*e),p0[1]+(p1[1]-p0[1])*e)}
function poseTile(m,type,r,c,o0,p){const e=ease(p),q0=quatFor(o0),h=V.dieS/2,[x,z]=W(r,c),axis=type=="spin"?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),ang=type=="spin"?-Math.PI/2:Math.PI;
 m.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis,ang*e).multiply(q0));m.position.set(x,h+(type=="spin"?.12:.75)*Math.sin(Math.PI*p),z)}
function flashTile(key,color,ms=600){const m=V.tiles[key];if(m)V.flash.push({m,color:new THREE.Color(color),t0:performance.now(),ms,base:m===V.exitMat?.25:0})}
function aRoll(d,r0,c0,o0,r1,c1,o1){V.q.push({dur:190,step:p=>poseRoll(V.die,d,r0,c0,o0,r1,c1,p),end:()=>placeMesh(V.die,r1,c1,o1)})}
function aTile(type,r,c,o0,o1){V.q.push({dur:type=="spin"?380:460,start:()=>flashTile(r+","+c,type=="spin"?0xa78bfa:0x34d399,700),step:p=>poseTile(V.die,type,r,c,o0,p),end:()=>placeMesh(V.die,r,c,o1)})}
function aBump(d,r,c,o,lockKey){const[a,s]=AX[d],axis=new THREE.Vector3(...a),q0=quatFor(o),[x,z]=W(r,c),[dr,dc]=D[d],h=V.dieS/2;
 V.q.push({dur:300,start:()=>{if(lockKey)flashTile(lockKey,0xff4d4d,650)},step:p=>{const k=Math.sin(Math.PI*p);V.die.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis,s*.28*k).multiply(q0));
  V.die.position.set(x+dc*.1*k,h+.04*k,z+dr*.1*k)},end:()=>placeMesh(V.die,r,c,o)})}
function aSlide(r1,c1,o1){let p0,q0;const p1=W(r1,c1),q1=quatFor(o1),h=V.dieS/2;
 V.q.push({dur:220,start:()=>{p0=V.die.position.clone();q0=V.die.quaternion.clone()},step:p=>{const e=ease(p);V.die.quaternion.copy(q0.clone().slerp(q1,e));V.die.position.set(p0.x+(p1[0]-p0.x)*e,h+.35*Math.sin(Math.PI*e),p0.z+(p1[1]-p0.z)*e)},end:()=>placeMesh(V.die,r1,c1,o1)})}
function confetti(r,c){const[x,z]=W(r,c),cols=[0xffb547,0x7ef0b8,0x5f8bff,0xa78bfa,0xffffff,0xff7a7a],g=new THREE.PlaneGeometry(.07,.12);
 for(let i=0;i<90;i++){const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:lin(cols[i%cols.length]),side:THREE.DoubleSide,transparent:true}));m.position.set(x,.9,z);
  const a=Math.random()*Math.PI*2,sp=1.2+Math.random()*2.2;m.userData={v:new THREE.Vector3(Math.cos(a)*sp,3+Math.random()*3.5,Math.sin(a)*sp),w:new THREE.Vector3(Math.random()*9,Math.random()*9,Math.random()*9),t:0};V.scene.add(m);V.parts.push(m)}}
/* ghost die: demonstrates `seq` from (r,c,o), looping until stopGhost() */
function startGhost(L,r,c,o,seq){if(!V.ok)return;stopGhost();const steps=[],trail=[];let cr=r,cc=c,co=o;
 for(const d of seq){const m=tryMove(L,cr,cc,co,d);if(!m.ok)break;const mid=roll(co,d),a=[d,cr,cc,co,m.r,m.c];
  steps.push({dur:560,f:p=>poseRoll(V.ghost,a[0],a[1],a[2],a[3],a[4],a[5],p)});
  if(m.tile){const t=m.tile,rr=m.r,c2=m.c;steps.push({dur:560,f:p=>poseTile(V.ghost,t,rr,c2,mid,p)})}
  const fo=m.o,fr=m.r,fc=m.c;steps.push({dur:220,f:()=>placeMesh(V.ghost,fr,fc,fo)});
  const ar=new THREE.Mesh(V.arrowG,new THREE.MeshBasicMaterial({color:lin(0xffb547),transparent:true,opacity:.0,depthWrite:false}));const[x,z]=W(m.r,m.c);ar.position.set(x,.015,z);ar.rotation.y={N:0,W:Math.PI/2,S:Math.PI,E:-Math.PI/2}[d];V.board.add(ar);trail.push(ar);
  cr=m.r;cc=m.c;co=m.o}
 if(!steps.length)return;const lead=380,tail=900,run=steps.reduce((s,x)=>s+x.dur,0);
 V.gh={steps,lead,tail,cycle:lead+run+tail,t0:performance.now(),start:[r,c,o],end:[cr,cc,co],trail};V.trail=trail;
 const[ex,ez]=W(cr,cc);V.ring.position.set(ex,.012,ez);V.ring.visible=true;V.ghost.visible=true}
function stopGhost(){if(V.gh){V.gh.trail.forEach(a=>{if(a.parent)a.parent.remove(a);a.material.dispose()});V.gh=null}if(V.ghost)V.ghost.visible=false;if(V.ring)V.ring.visible=false}
let lastT=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-lastT)/1000);lastT=now;if(!V.host||!V.host.isConnected)return;
 if(!V.cur&&V.q.length){V.cur=V.q.shift();V.cur.t0=now;V.cur.fast=V.q.length>0?2.4:1;V.cur.start&&V.cur.start()}
 if(V.cur){const p=Math.min(1,(now-V.cur.t0)/(V.cur.dur/V.cur.fast));V.cur.step(p);if(p>=1){V.cur.end&&V.cur.end();V.cur=null}}
 if(V.mode=="show"){V.die.rotation.x+=dt*.35;V.die.rotation.y+=dt*.5;V.die.position.y=.42+Math.sin(now/700)*.06}
 if(V.gh){const g=V.gh,t=(now-g.t0)%g.cycle;let op=.55,u=t-g.lead,k=-1;
  if(t<g.lead){placeMesh(V.ghost,...g.start);op=.55*(t/g.lead)}
  else{let done=false,acc=0;for(let i=0;i<g.steps.length;i++){if(u<g.steps[i].dur){g.steps[i].f(Math.min(1,u/g.steps[i].dur));done=true;break}u-=g.steps[i].dur}
   if(!done){placeMesh(V.ghost,...g.end);op=.55*Math.max(0,1-u/g.tail)}}
  V.ghost.material.forEach(m=>m.opacity=op);
  const pulse=.5+.5*Math.sin(now/260);g.trail.forEach((a,i)=>a.material.opacity=.35+.45*(.5+.5*Math.sin(now/260-i*.9)));V.ring.material.opacity=.45+.5*pulse}
 if(V.flag)V.flag.rotation.y=Math.sin(now/420)*.35;
 if(V.exitMat&&!V.flash.some(f=>f.m===V.exitMat))V.exitMat.emissiveIntensity=.18+.22*(.5+.5*Math.sin(now/600));
 V.flash=V.flash.filter(f=>{const k=(now-f.t0)/f.ms;if(k>=1){if(f.m!==V.exitMat)f.m.emissive.setRGB(0,0,0);return false}f.m.emissive.copy(f.color);f.m.emissiveIntensity=(1-k)*.9+f.base*k;return true});
 V.parts=V.parts.filter(m=>{const u=m.userData;u.t+=dt;u.v.y-=9.8*dt;m.position.addScaledVector(u.v,dt);m.rotation.x+=u.w.x*dt;m.rotation.y+=u.w.y*dt;m.material.opacity=Math.max(0,1-u.t/1.9);
  if(u.t>1.9){V.scene.remove(m);m.material.dispose();return false}return true});
 V.R.render(V.scene,V.cam)}
function showcase(host){if(!initGL())return;V.mode="show";clearBoard();const disc=new THREE.Mesh(new THREE.CircleGeometry(1.2,48).rotateX(-Math.PI/2),new THREE.ShadowMaterial({opacity:.35}));disc.receiveShadow=true;V.board.add(disc);
 V.die.position.set(0,.42,0);V.die.rotation.set(-.4,.6,.2);V.die.visible=true;
 const k=V.key;k.shadow.camera.left=k.shadow.camera.bottom=-3;k.shadow.camera.right=k.shadow.camera.top=3;k.shadow.camera.updateProjectionMatrix();mount(host)}

/* ======================= STORAGE: browser + Supabase ======================= */
const SB={on:!!(SUPABASE_URL&&SUPABASE_ANON_KEY),status:"saved"},STL={saved:"Saved",saving:"Saving…",error:"Not synced",off:"Local only"};
function setStatus(s){SB.status=s;const el=$("#cloud");if(el){el.dataset.s=s;el.lastChild.textContent=STL[s]}}
const cloudChip=()=>`<span class="cloud" id="cloud" data-s="${SB.on?SB.status:"off"}"><i></i>${STL[SB.on?SB.status:"off"]}</span>`;
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const ACTIVE="rdm3_active_"+MODE;
function exportObj(s=S){return{key:s.key,pid:s.pid,first:s.first,last:s.last,mode:s.mode,session:s.session,group:s.group,assistance:s.cond,started:s.started,finished:s.finished||null,t0:s.t0,i:s.i,seen:s.seen,
 sbTo:s.sbTo||0,screen:s.screen,tz:s.tz,levels:s.res,quiz:s.quiz,events:s.log}}
function save(){if(S)LS.set("rdm3_"+S.key,JSON.stringify(exportObj()))}
function sessionDoc(s){return{key:s.key,pid:s.pid,firstName:s.first||null,lastName:s.last||null,mode:s.mode,session:s.session,group:s.group,assistance:s.cond,set:"v3",started:s.started,finished:s.finished||null,
 status:s.finished?"complete":"in_progress",currentLevel:s.i,levelsTotal:s.plan.length,levels:s.res,quiz:s.quiz,quizScore:s.quiz.filter(q=>q.ok).length,
 eventCount:s.log.length,skipAfter:CFG.skipAfterSecs,ua:navigator.userAgent,screen:s.screen,timezone:s.tz}}
async function sbRpc(fn,body){const txt=JSON.stringify(body);const r=await fetch(SUPABASE_URL.replace(/\/+$/,"")+"/rest/v1/rpc/"+fn,{method:"POST",keepalive:txt.length<60000,
 headers:Object.assign({apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json"},SUPABASE_ANON_KEY.startsWith("sb_")?{}:{Authorization:"Bearer "+SUPABASE_ANON_KEY}),body:txt});
 if(!r.ok)throw new Error(fn+" "+r.status+" "+(await r.text()).slice(0,300))}
function sbSync(s=S){if(!SB.on||!s)return Promise.resolve(true);if(s.sbBusy){s.sbAgain=true;return s.sbBusy}
 s.sbBusy=(async()=>{let ok=true;setStatus("saving");
  do{s.sbAgain=false;try{await sbRpc("rdm_save_session",{s:sessionDoc(s)});
    while((s.sbTo||0)<s.log.length){const from=s.sbTo||0,batch=s.log.slice(from,from+150).map((e,i)=>({...e,seq:from+i}));await sbRpc("rdm_save_events",{k:s.key,evs:batch});s.sbTo=from+batch.length}
    ok=true}catch(e){ok=false;console.warn("supabase",e)}}while(s.sbAgain&&ok);
  s.sbBusy=null;setStatus(ok?"saved":"error");if(!ok){clearTimeout(s.sbRetry);s.sbRetry=setTimeout(()=>sbSync(s),8000)}else save();return ok})();return s.sbBusy}
let flushTimer=null;
function touch(){if(!SB.on||!S)return;clearTimeout(flushTimer);flushTimer=setTimeout(()=>sbSync(),1500)}
function flush(){clearTimeout(flushTimer);return sbSync()}

/* ======================= SESSION ======================= */
let S=null,L=null,G=null,Q=null,idleTimer=null,DLG=false;
const now=()=>Date.now();
function log(type,d={}){if(!S)return;S.log.push({t:now()-S.t0,at:new Date().toISOString(),lv:S.i,levelId:L?L.id:null,kind:L?L.tier:null,...d,type});save();touch()}
const safeId=s=>String(s).replace(/[^A-Za-z0-9_-]/g,"-").slice(0,60)||"P00";
const cleanName=s=>String(s||"").replace(/\s+/g," ").trim().slice(0,60);
// participant id = normalised "first-last" (accents and case ignored), so the same person links across sessions
const nameId=(f,l)=>(cleanName(f)+" "+cleanName(l)).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"anon";
const assist=()=>!!L&&S.cond!="none"&&L.phase=="training";
function bar(right=""){return`<header class="bar"><div class="mark">${MARK}Rolling Die Maze</div><div class="barR">${right}${cloudChip()}</div></header>`}
function ask(title,body,ok="Confirm"){return new Promise(res=>{const d=document.createElement("div");d.className="dlg";d.innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><h3>${title}</h3><p class="mu">${body}</p><div class="row" style="margin-top:16px"><button class="btn-p" data-y>${ok}</button><button data-n>Cancel</button></div></div>`;
 document.body.appendChild(d);DLG=true;const done=v=>{d.remove();DLG=false;res(v)};d.querySelector("[data-y]").onclick=()=>done(true);d.querySelector("[data-n]").onclick=()=>done(false);d.querySelector("[data-n]").focus()})}

function resumable(){const k=LS.get(ACTIVE);if(!k)return null;try{const o=JSON.parse(LS.get("rdm3_"+k));if(!o||o.finished||now()-o.t0>12*3600e3)return null;return o}catch(e){return null}}

function welcome(){if(DEV)return devSetup();S=null;L=null;G=null;Q=null;V.host=null;const r=resumable();
 app.innerHTML=bar()+`<main class="screen"><div class="sheet" style="max-width:520px"><div class="eyebrow">${M.label}</div><h1 style="font-size:34px;margin:6px 0 6px">Welcome</h1>
 <p class="mu" style="margin-top:0">Please enter your name to sign in.</p>
 ${r?`<div class="note warn">You were partway through (level ${Math.min(r.i+1,planFor(M).length)} of ${planFor(M).length}) as <b>${esc(((r.first||"")+" "+(r.last||"")).trim()||r.pid)}</b>.<div class="row" style="margin-top:10px"><button class="btn-p" id="res">Continue where I left off</button></div></div>`:""}
 <form id="f" novalidate><div class="grid2"><div><label for="fn">First name</label><input id="fn" autocomplete="given-name" required></div>
 <div><label for="ln">Last name</label><input id="ln" autocomplete="family-name" required></div></div>
 <div class="err" id="er" role="alert"></div><p class="mu" style="font-size:14px">Use the same name each time you take part, so your sessions are linked.</p>
 <div class="row" style="margin-top:8px"><button class="btn-p" type="submit">${r?"Start over":"Sign in"}</button></div></form></div></main>`;
 if(r)$("#res").onclick=()=>resume(r);
 $("#f").onsubmit=e=>{e.preventDefault();const f=cleanName($("#fn").value),l=cleanName($("#ln").value);
  if(!f||!l){$("#er").textContent=!f&&!l?"Please enter your first and last name.":!f?"Please enter your first name.":"Please enter your last name.";(!f?$("#fn"):$("#ln")).focus();return}begin(f,l)};
 if(!r)$("#fn").focus()}
function newS(first,last){const st=new Date().toISOString(),pid=nameId(first,last);
 return{pid,first,last,mode:MODE,session:M.session,group:M.group,cond:M.cond,i:0,res:[],log:[],quiz:[],t0:now(),started:st,seen:{},sbTo:0,
  key:`rdm3_${safeId(pid)}_${MODE}_${st.replace(/[:.]/g,"-")}`,plan:planFor(M),
  screen:`${screen.width}x${screen.height} @${devicePixelRatio||1}x, window ${innerWidth}x${innerHeight}`,tz:(Intl.DateTimeFormat().resolvedOptions().timeZone||"")}}
function begin(first,last){S=newS(first,last);LS.set(ACTIVE,S.key);const pid=S.pid;
 log("session_start",{pid,firstName:first,lastName:last,mode:MODE,session:S.session,group:S.group,assistance:S.cond,ua:navigator.userAgent,screen:S.screen,timezone:S.tz,url:location.href});flush();intro()}
function resume(o){S={pid:o.pid,first:o.first,last:o.last,mode:MODE,session:o.session,group:o.group,cond:o.assistance,i:o.i,res:o.levels||[],log:o.events||[],quiz:[],t0:o.t0,started:o.started,seen:o.seen||{},
 sbTo:o.sbTo||0,key:o.key,plan:planFor(M),screen:o.screen,tz:o.tz};log("session_resume",{atLevel:S.i});flush();
 if(S.i>=S.plan.length)quizStart();else startLevel()}

/* ======================= TEXT SCREENS ======================= */
const faceName=rule=>rule=="top"?"top face":"bottom face (the one touching the board)";
function intro(){const s1=M.session==1,nTrain=LV.training.length,nAss=LV.immediate.length;
 const help=S.cond=="user"?`<p>Stuck? Click the lightbulb <span class="bulbDemo">${BULB}</span> in the top-right corner of the board. A ghost die will show you the next few rolls.</p>`
  :S.cond=="adaptive"?`<p>An assistant is watching. When it thinks a hint would help, the lightbulb <span class="bulbDemo">${BULB}</span> in the top-right corner lights up and a ghost die shows you the next few rolls.</p>`:"";
 app.innerHTML=bar()+`<main class="screen"><div class="sheet wide"><div class="introGrid"><div class="showcase" id="sc"></div><div>
 <div class="eyebrow">${M.label}</div><h1 class="bigtitle">Roll it.<br>Read it.<br>Get out.</h1>
 <p>Roll the die one square at a time. A <b style="color:var(--lock)">numbered</b> square can only be entered if the die's <b>top face</b> shows that number after the roll. Reach the <b style="color:var(--exit)">⚑</b> exit.</p>
 <p>Some squares have special markings. Nobody will tell you what they do. You'll have to find out.</p>${help}
 <div class="keys"><span><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to roll</span><span><kbd>Z</kbd> to undo</span><span>Swipe on touch screens</span></div>
 <p class="mu">Try to finish each level in as few moves as you can. ${s1?`You'll start with a practice level, then ${nTrain} levels that get harder as you go, then ${nAss} levels on your own and a short quiz.`:`You'll play ${S.plan.length} levels on your own, then a short quiz. No help is available in this session.`}</p>
 <button class="btn-p" id="b">Begin</button></div></div></div></main>`;
 showcase($("#sc"));$("#b").onclick=startLevel;$("#b").focus()}
function interstitial(kind){S.seen[kind]=true;log(kind=="bottom"?"rule_change_shown":"assessment_intro_shown");
 const t=kind=="bottom"?["Rule change","Now check the bottom",`For the next levels, numbered squares check the <b>bottom face</b>: the one touching the board, which you can't see. Everything else is unchanged.`]
  :["Nice work","Now on your own",`Training is done. For the last ${LV.immediate.length} levels there are no hints${S.cond!="none"?" and no lightbulb":""}. Do your best.`];
 app.innerHTML=bar()+`<main class="screen"><div class="sheet"><div class="eyebrow">${t[0]}</div><h1 style="font-size:34px;margin:6px 0 12px">${t[1]}</h1><p>${t[2]}</p>
 <div class="row" style="margin-top:14px"><button class="btn-p" id="b">Continue</button></div></div></main>`;$("#b").onclick=startLevel;$("#b").focus()}

/* ======================= LEVEL PLAY ======================= */
const skey=(r,c,o)=>r+","+c+","+o.join("");
function startLevel(){const def=S.plan[S.i];
 if(def.phase=="immediate"&&!S.seen.immediate)return interstitial("immediate");
 if(def.rule=="bottom"&&!S.seen.bottom)return interstitial("bottom");
 L=loadLevel(def);save();
 G={r:L.start[0],c:L.start[1],o:O0.slice(),hist:[],moves:0,undos:0,blocked:0,t:now(),lastAct:now(),done:false,skipped:false,
  hints:0,autoHints:0,hintMs:0,hint:null,offer:false,lastHintAt:0,actsSinceHint:99,msg:"",msgInfo:false,lastD:null,sinceProgress:0,discovered:false,
  visits:new Map(),blockSeen:new Set(),score:0,maxScore:0,recent:[],fires:0};
 G.best=dist();G.lastD=G.best;G.visits.set(skey(G.r,G.c,G.o),1);
 log("level_start",{opt:L.opt,rule:L.rule,n:L.n,phase:L.phase,tier:L.tier,assist:assist()?S.cond:"none"});buildGame();
 clearInterval(idleTimer);idleTimer=setInterval(idleTick,5000)}
function dist(){const p=bfs(L,G.r,G.c,G.o);return p?p.length:Infinity}
function act(d){if(!G||G.done||DLG)return;endHint("move");const m=tryMove(L,G.r,G.c,G.o,d);G.lastAct=now();G.actsSinceHint++;G.msgInfo=false;
 if(!m.ok){G.blocked++;const bk=skey(G.r,G.c,G.o)+d,rep=G.blockSeen.has(bk);G.blockSeen.add(bk);
  G.msg=m.why=="wall"?"Blocked: wall or edge.":`Blocked: the ${L.rule} face would show ${m.face}, not ${m.need}.`;
  if(V.ok)aBump(d,G.r,G.c,G.o,m.why=="num"?m.nr+","+m.nc:null);
  struggle(rep?"repeat_block":"probe",rep?CFG.W.repeatBlock:CFG.W.probe);log("blocked",{d,why:m.why,repeat:rep,score:+G.score.toFixed(2)});return afterAct()}
 const r0=G.r,c0=G.c,o0=G.o;G.hist.push([G.r,G.c,G.o]);G.r=m.r;G.c=m.c;G.o=m.o;G.moves++;G.msg="";
 if(V.ok){const mid=roll(o0,d);aRoll(d,r0,c0,o0,m.r,m.c,mid);if(m.tile)aTile(m.tile,m.r,m.c,mid,m.o)}
 if(m.tile){const first=!S.log.some(e=>e.type=="tile"&&e.tile==m.tile);
  if(first){G.msg="Something happened to the die on that square.";G.msgInfo=true;G.discovered=true}log("tile",{tile:m.tile,first})}
 log("move",{d,r:m.r,c:m.c,o:m.o.join("")});evalState("move")}
function undo(){if(!G||G.done||!G.hist.length||DLG)return;endHint("undo");[G.r,G.c,G.o]=G.hist.pop();G.moves++;G.undos++;G.lastAct=now();G.actsSinceHint++;G.msg="";if(V.ok)aSlide(G.r,G.c,G.o);log("undo",{});evalState("undo")}
/* ---- struggle detector v2: productive vs unproductive (see DETECTOR.md) ---- */
function evalState(kind){const W_=CFG.W,d=dist(),k=skey(G.r,G.c,G.o),v=G.visits.get(k)||0;G.visits.set(k,v+1);
 let type,w,stag=false;
 if(d==Infinity){type="deadend";w=W_.deadend}
 else if(d<G.best){G.best=d;type="progress";w=W_.progress}
 else if(kind=="undo"&&G.lastD==Infinity){type="recovery";w=W_.recovery}
 else if(v==0){type="explore";w=W_.explore}
 else{type="loop";w=W_.loop}
 if(kind=="undo"&&type!="progress"&&type!="recovery")w+=W_.undoNoProgress;
 if(type=="progress")G.sinceProgress=0;
 else{G.sinceProgress++;const budget=Math.max(CFG.stagnationBase,Math.ceil(CFG.stagnationFactor*(d==Infinity?G.best:d)));if(G.sinceProgress>budget){w+=W_.stagnation;stag=true}}
 if(G.discovered){w+=W_.discovery;G.discovered=false}
 G.lastD=d;struggle(type,w);
 log("state",{dist:d==Infinity?null:d,cls:type,revisit:v>0,stagnant:stag,sinceProgress:G.sinceProgress,score:+G.score.toFixed(2)});
 if(G.r==L.exit[0]&&G.c==L.exit[1])return finish(false);afterAct()}
function struggle(type,w){G.score=Math.max(0,G.score+w);G.maxScore=Math.max(G.maxScore,G.score);G.recent.push(type);if(G.recent.length>8)G.recent.shift()}
function idleTick(){if(!G||G.done||Q||DLG)return;const idle=(now()-G.lastAct)/1000;
 if(idle>=CFG.idleSecs&&!G.hint){struggle("idle",CFG.W.idle);log("idle",{secs:Math.round(idle),score:+G.score.toFixed(2)});checkDetector()}
 if(!G.skipShown&&(now()-G.t)/1000>=CFG.skipAfterSecs){G.skipShown=true;drawPanel()}}
function afterAct(){checkDetector();drawPanel()}
function gate(){const secs=(now()-G.t)/1000,gap=(now()-G.lastHintAt)/1000;
 if(G.done)return"level done";if(G.hint)return"hint showing";
 if(secs<CFG.levelGraceSecs)return`grace period: ${Math.ceil(CFG.levelGraceSecs-secs)} s left`;
 if(G.lastHintAt&&G.actsSinceHint<CFG.minGapActions)return`gap: ${CFG.minGapActions-G.actsSinceHint} more actions`;
 if(gap<CFG.minGapSecs)return`gap: ${Math.ceil(CFG.minGapSecs-gap)} s left`;
 if(G.score<CFG.threshold)return"below threshold";return""}
function checkDetector(){if(!gate())fire(false)}
function fire(forced){
 const live=assist()&&S.cond=="adaptive";G.fires++;log("detector_fire",{score:+G.score.toFixed(2),recent:G.recent.join(" "),cause:dominant(),will_hint:live,forced:!!forced});
 if(live){if(CFG.adaptiveAutoPlay)giveHint(true);else{G.offer=true;G.lastHintAt=now();G.actsSinceHint=0;G.score=0;log("hint_offer");drawBulb()}}
 else{G.score=0;G.lastHintAt=now();G.actsSinceHint=0}}
function dominant(){if(dist()==Infinity)return"deadend";const c={};G.recent.forEach(t=>c[t]=(c[t]||0)+1);
 for(const t of["repeat_block","loop","deadend","idle"])if((c[t]||0)>=2)return t;return G.sinceProgress>CFG.stagnationBase?"stagnation":"general"}
/* ---- hints: ghost die shows the next CFG.hintMoves optimal rolls, looping until any input ---- */
function giveHint(auto){if(!G||G.done)return;G.hints++;if(auto)G.autoHints++;G.offer=false;G.lastHintAt=now();G.actsSinceHint=0;G.score=0;
 const p=bfs(L,G.r,G.c,G.o),seq=p?p.slice(0,CFG.hintMoves):null;
 G.hint={auto,seq,deadend:!p,t0:now()};log("hint",{auto,cause:dominant(),shown:seq?seq.join(""):null,dist:p?p.length:null});
 if(seq&&V.ok)startGhost(L,G.r,G.c,G.o,seq);drawBulb();drawPanel()}
function endHint(reason){if(!G||!G.hint)return;const ms=now()-G.hint.t0;G.hintMs+=ms;log("hint_end",{reason,ms});G.hint=null;stopGhost();drawBulb()}
function hintCaption(){const h=G.hint;if(h.deadend)return`<div class="caption"><b>No way out from here.</b> Undo a few moves and try another way.<div class="dim">Any key or click hides this.</div></div>`;
 let r=G.r,c=G.c,o=G.o,note="";for(const d of h.seq){const m=tryMove(L,r,c,o,d);const cell=L.g[m.r][m.c];
  if(!note&&cell.num)note=`Watch it reach the <b>${cell.num}</b> square with ${cell.num} on the ${L.rule=="top"?"top":"bottom"}.`;
  if(!note&&cell.tile)note=`Watch what the ${cell.tile=="spin"?"↻":"⇅"} square does to it.`;r=m.r;c=m.c;o=m.o}
 return`<div class="caption"><b>${h.auto?"Here's a hint.":"Hint."}</b> The ghost die shows your next ${h.seq.length==1?"roll":h.seq.length+" rolls"}:
 <div class="seq">${h.seq.map(d=>`<span>${ARROW[d]}</span>`).join("")}</div>${note}<div class="dim">Any key or click hides this.</div></div>`}
function drawBulb(){const el=$("#bulb");if(!el||!G)return;if(!assist()||G.done){el.innerHTML="";el.removeAttribute("data-s");return}
 const ad=S.cond=="adaptive",s=G.hint?"lit":G.offer?"offer":ad?"watch":"ready";el.dataset.s=s;
 const lbl=G.hint?"":ad?(G.offer?"Hint ready":"Assistant watching"):"Hint";
 el.innerHTML=`<button class="bulbBtn" id="bulbBtn" aria-label="${ad?"Assistant hint":"Get a hint"}" ${s=="watch"?"disabled":""}>${BULB}</button>${lbl?`<div class="bulbLbl">${lbl}</div>`:""}${G.hint?hintCaption():""}`;
 const b=$("#bulbBtn");b.onclick=e=>{e.stopPropagation();if(G.hint)return;if(ad){if(G.offer){log("help_click",{offer:true});giveHint(true)}}else{log("help_click");giveHint(false)}}}
function finish(skipped){endHint(skipped?"skip":"solved");G.done=true;G.skipped=skipped;clearInterval(idleTimer);
 const e={level:S.i+1,id:L.id,phase:L.phase,tier:L.tier,kind:L.tier,rule:L.rule,solved:!skipped,skipped,moves:G.moves,opt:L.opt,efficiency:skipped?null:+(L.opt/G.moves).toFixed(3),
  undos:G.undos,blocked:G.blocked,hints:G.hints,autoHints:G.autoHints,hintMs:G.hintMs,detectorFires:G.fires,maxStruggle:+G.maxScore.toFixed(2),
  uniqueStates:G.visits.size,secs:Math.round((now()-G.t)/1000)};S.res.push(e);log(skipped?"level_skipped":"level_done",e);flush();
 if(!skipped&&V.ok)V.q.push({dur:60,step:()=>{},end:()=>confetti(G.r,G.c)});
 drawPanel();drawBulb();setTimeout(drawDone,skipped?0:450)}
function next(){S.i++;G=null;save();if(S.i<S.plan.length)startLevel();else quizStart()}

/* ---------- game screen ---------- */
function buildGame(){
 app.innerHTML=bar(`<span class="chip">Numbers check the&nbsp;<b style="color:var(--ink)">${L.rule} face</b></span>`)+
 `<main class="game"><section class="stage" id="stage" aria-label="Game board"><div class="bulb" id="bulb"></div>${DEV?`<div class="hud" id="hud"></div>`:""}
  <div class="legend"><span><i class="sw" style="background:var(--lock)">4</i>Number lock</span><span><i class="sw" style="background:var(--spin)">↻</i>?</span><span><i class="sw" style="background:var(--flip)">⇅</i>?</span><span><i class="sw" style="background:var(--exit);color:#0b3324">⚑</i>Exit</span></div>
 </section><aside class="panel" id="panel"></aside></main>`;
 const st=$("#stage");mount(st);if(V.ok){buildBoard(L);placeMesh(V.die,G.r,G.c,G.o)}
 let sx=null,sy=null;st.onpointerdown=e=>{if(e.target.closest(".bulb,.doneOv,.hud"))return;if(G&&G.hint)endHint("click");sx=e.clientX;sy=e.clientY};
 st.onpointerup=e=>{if(sx==null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;if(Math.max(Math.abs(dx),Math.abs(dy))<28)return;act(Math.abs(dx)>Math.abs(dy)?(dx>0?"E":"W"):(dy>0?"S":"N"))};
 drawPanel();drawBulb()}
function levelLabel(){const same=S.plan.filter(x=>x.phase==L.phase),idx=same.findIndex(x=>x.id==L.id)+1;
 if(L.phase=="practice")return{lbl:"Practice",num:"P",of:"",same,idx};
 return{lbl:L.phase=="immediate"?"On your own":L.phase=="delayed"?"Level":"Level",num:idx,of:" / "+same.length,same,idx}}
function netHTML(o){const[t,n,e]=o,chk=L.rule=="top"?"top":"bottom",F=(cls,v,name)=>`<div class="f ${cls}${cls==chk?" chk":""}">${faceSVG(v)}<span>${name}</span></div>`;
 return`<div class="net" aria-label="Unfolded die: top ${t}, bottom ${7-t}, front ${7-n}, back ${n}, left ${7-e}, right ${e}">${F("back",n,"Back")}${F("left",7-e,"Left")}${F("top",t,"Top")}${F("right",e,"Right")}${F("front",7-n,"Front")}${F("bottom",7-t,"Bottom")}</div>
 <div class="netcap">The die unfolded. Highlighted: the face numbers check.</div>`}
function drawPanel(){const pn=$("#panel");if(!pn||!G)return;const dn=G.done,ll=levelLabel();
 const track=L.phase=="practice"?"":`<div class="track" aria-hidden="true">${ll.same.map((def,i)=>{const r=S.res.filter(x=>x.id==def.id).pop();return`<i class="${r?(r.skipped?"skip":"ok"):i+1==ll.idx?"now":""}"></i>`}).join("")}</div>`;
 pn.innerHTML=`<div class="lvhead"><div><div class="lbl">${ll.lbl}${L.phase=="training"?`<span class="tierTag ${L.tier}">${L.tier}</span>`:""}</div><div class="lvnum">${ll.num}<small>${ll.of}</small></div></div>
  <div class="moves"><span class="lbl">Moves</span><b>${G.moves}</b></div></div>${track}
 <div class="rule"><span class="sw">#</span><div>Numbered squares check the <b>${L.rule=="top"?"top face":"bottom face"}</b>${L.rule=="bottom"?" (touching the board)":""}.</div></div>
 ${netHTML(G.o)}
 <div class="pad"><button class="n" data-d="N" aria-label="Roll up">▲</button><button class="w" data-d="W" aria-label="Roll left">◀</button><button class="s" data-d="S" aria-label="Roll down">▼</button><button class="e" data-d="E" aria-label="Roll right">▶</button></div>
 <div class="acts"><button id="un" ${dn||!G.hist.length?"disabled":""}>↶ Undo</button>${!dn&&G.skipShown?`<button id="sk" class="btn-ghost">Skip level</button>`:""}</div>
 <div class="msg ${G.msgInfo?"info":""}" role="status">${G.msg}</div>`;
 pn.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>act(b.dataset.d));
 $("#un").onclick=undo;if(DEV)drawHud();
 if($("#sk"))$("#sk").onclick=async()=>{if(await ask("Skip this level?","It will be recorded as unsolved.","Skip level"))finish(true)}}
function drawDone(){const st=$("#stage");if(!st||!G||!G.done||$("#doneOv"))return;const isPrac=L.phase=="practice",eff=G.skipped?0:Math.min(1,L.opt/G.moves),C=2*Math.PI*52;
 const el=document.createElement("div");el.className="doneOv";el.id="doneOv";el.setAttribute("role","dialog");el.setAttribute("aria-label","Level complete");
 el.innerHTML=`<div class="donecard">${G.skipped?`<h2 style="font-size:26px">Level skipped</h2><p class="mu">On to the next one.</p>`:`<div class="eyebrow">${isPrac?"Practice complete":"Solved"}</div>
 <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="${eff>=1?"#7ef0b8":"#ffb547"}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C*eff} ${C}"/></svg><div><span>${G.moves}<small>moves</small></span></div></div>
 <p style="margin:0">Best possible: <b>${L.opt}</b></p>${isPrac?`<p class="mu" style="margin:6px 0 0">That's the practice done. The real levels start now.</p>`:""}`}
 <button class="btn-p" id="nx" style="margin-top:16px;min-width:180px">${S.i+1<S.plan.length?"Next level":"Continue"}</button></div>`;
 st.appendChild(el);$("#nx").onclick=next;$("#nx").focus()}
document.addEventListener("keydown",e=>{if(DLG||!G||!L||Q||!$("#stage"))return;
 if(G.done){if(e.key=="Enter"&&$("#nx")){e.preventDefault();$("#nx").click()}return}
 if(G.hint&&!["Shift","Control","Alt","Meta","Tab"].includes(e.key))endHint("key");
 if(e.target&&e.target.tagName=="BUTTON"&&(e.key=="Enter"||e.key==" "))return;
 const d=KEY[e.key];if(d){e.preventDefault();act(d)}else if(e.key=="z"||e.key=="Z"||e.key=="Backspace"){e.preventDefault();undo()}});

/* ======================= QUIZ ======================= */
function quizStart(){const R=rng(13+S.session*1000);const pick=a=>a[Math.floor(R()*a.length)];
 const randO=()=>{let o=O0.slice();for(let k=0;k<25;k++){const r=R();o=r<.8?roll(o,pick("NSEW")):tileFx(o,"spin")}return o};
 const qs=[];
 for(let i=0;i<3;i++){const o=randO(),ds=[...Array(2+i)].map(()=>pick("NSEW"));let c=o;ds.forEach(d=>c=roll(c,d));qs.push({type:"top",o,ds,ask:"top",a:c[0]})}
 {const o=randO(),ds=[pick("NSEW"),pick("NSEW")];let c=o;ds.forEach(d=>c=roll(c,d));qs.push({type:"bottom",o,ds,ask:"bottom",a:7-c[0]})}
 {const o=randO(),d=pick("NSEW");const c=tileFx(roll(o,d),"spin");qs.push({type:"spin",o,ds:[d],tile:"spin",ask:"right",a:c[2]})}
 {const o=randO(),d=pick("NSEW");const c=tileFx(roll(o,d),"flip");qs.push({type:"flip",o,ds:[d],tile:"flip",ask:"top",a:c[0]})}
 S.quiz=[];Q={i:0,qs};L=null;G=null;V.host=null;clearInterval(idleTimer);log("quiz_start");qNext()}
function qNext(){if(Q.i>=Q.qs.length)return end();const q=Q.qs[Q.i];
 const askTxt=q.ask=="top"?"on <b>top</b>":q.ask=="bottom"?"on the <b>bottom</b> (touching the board)":"facing <b>right</b>";
 const seq=q.ds.map(d=>DIRNAME[d]+" "+ARROW[d]).join(", then ");
 app.innerHTML=bar()+`<main class="screen"><div class="sheet"><div class="eyebrow">Quick check</div><h1 style="font-size:28px;margin:4px 0 10px">Question ${Q.i+1} of ${Q.qs.length}</h1>
 <div class="qprog">${Q.qs.map((_,i)=>`<i class="${i<=Q.i?"on":""}"></i>`).join("")}</div>
 <p class="mu" style="margin-top:0">Work it out in your head.</p>
 <div class="row" style="gap:20px;align-items:center"><div class="qdie">${dieSVG(q.o)}</div>
 <p style="flex:1;min-width:220px;margin:0">The die shows <b>${q.o[0]}</b> on top, <b>${7-q.o[1]}</b> on the front and <b>${q.o[2]}</b> on the right.<br>It rolls <b>${seq}</b>${q.tile?`, landing on a <b style="color:var(--${q.tile})">${q.tile=="spin"?"↻":"⇅"}</b> square`:""}.<br>What number is now ${askTxt}?</p></div>
 <div class="nums">${[1,2,3,4,5,6].map(n=>`<button data-n="${n}">${n}</button>`).join("")}</div><p class="mu" style="margin-top:14px;font-size:14px">"Up" means away from you, toward the back of the board.</p></div></main>`;
 const shown=now();app.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{const ok=+b.dataset.n==q.a;S.quiz.push({q:Q.i+1,type:q.type,answer:+b.dataset.n,correct:q.a,ok,secs:+((now()-shown)/1000).toFixed(1)});log("quiz",{q:Q.i+1,qtype:q.type,ans:+b.dataset.n,ok});Q.i++;qNext()})}

/* ======================= END ======================= */
async function end(){S.finished=new Date().toISOString();log("session_end");Q=null;const s=S;
 app.innerHTML=bar()+`<main class="screen"><div class="sheet"><div class="eyebrow">Session complete</div><h1 class="bigtitle" style="font-size:44px">All done. Thank you!</h1>
 <p>You've finished this session.</p><div id="sync" class="note">Saving your results… please keep this page open.</div></div></main>`;
 let ok=!SB.on;for(let i=0;i<4&&!ok;i++){ok=await sbSync(s);if(!ok)await sleep(2500)}
 const el=$("#sync");
 if(ok){LS.del(ACTIVE);el.className="note ok";el.textContent=SB.on?"Your results are saved. You can close this page.":"Saved in this browser.";
  if(DEV)el.insertAdjacentHTML("afterend",`<div class="row" style="margin-top:14px"><button class="btn-p" id="again">Back to dev setup</button></div>`),$("#again").onclick=devSetup}
 else{el.className="note bad";el.innerHTML=`We couldn't reach the server. Please click below to download your results file and send it to the researcher.<div class="row" style="margin-top:10px"><button class="btn-p" id="dl">Download results file</button><button id="rt">Try saving again</button></div>`;
  $("#dl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(exportObj(s),null,1)],{type:"application/json"}));a.download=s.key+".json";document.body.appendChild(a);a.click();a.remove()};
  $("#rt").onclick=async()=>{$("#rt").disabled=true;if(await sbSync(s)){LS.del(ACTIVE);el.className="note ok";el.textContent="Your results are saved. You can close this page."}else $("#rt").disabled=false}}}

/* ======================= DEVELOPMENT LINK ======================= */
const DEVK="rdm3_dev_prefs";let devTimer=null;
function devPrefs(){try{return JSON.parse(LS.get(DEVK))||{}}catch(e){return{}}}
function applyCfg(c){if(!c)return;for(const k in CFG_DEFAULT){if(k=="W"){for(const w in CFG_DEFAULT.W)if(c.W&&typeof c.W[w]=="number")CFG.W[w]=c.W[w]}else if(c[k]!==undefined&&typeof c[k]==typeof CFG_DEFAULT[k])CFG[k]=c[k]}}
const CFG_HELP={hintMoves:"moves the ghost shows",adaptiveAutoPlay:"adaptive: play hint automatically",skipAfterSecs:"Skip button appears after (s)",threshold:"struggle score that fires",levelGraceSecs:"no firing in first N s",minGapSecs:"min s between fires",minGapActions:"min actions between fires",idleSecs:"idle counts after N s",stagnationBase:"stagnation after N actions…",stagnationFactor:"…or this × remaining distance"};
function devSetup(){clearInterval(devTimer);clearInterval(idleTimer);S=null;L=null;G=null;Q=null;V.host=null;const pr=devPrefs();applyCfg(pr.cfg);
 const conds=[["control","Control (no help)"],["adaptive","Adaptive help"],["help","Help always available"]];
 const num=(id,v,step)=>`<input id="${id}" type="number" step="${step}" value="${v}">`;
 app.innerHTML=bar(`<span class="chip">Development</span>`)+`<main class="screen"><div class="sheet wide">
 <div class="eyebrow">Development link</div><h1 style="font-size:32px;margin-top:4px">Test the game and settings</h1>
 <p class="mu">Sessions from this link are saved with <code>mode = 'dev'</code> and <code>grp = 'dev'</code>, so filter them out of the study data with <code>where mode &lt;&gt; 'dev'</code>. Settings changed here apply only in this browser. To make them the study defaults, copy them into <code>CFG</code> in app.js.</p>
 <div class="grid2"><div>
  <label for="dc">Condition</label><select id="dc">${conds.map(([k,t])=>`<option value="${k}" ${pr.cond==k?"selected":""}>${t}</option>`).join("")}</select>
  <label for="dl">Start at</label><select id="dl"></select>
  <div class="grid2" style="gap:0 12px"><div><label for="dfn">First name</label><input id="dfn" value="${esc(pr.first||"Dev")}"></div><div><label for="dln">Last name</label><input id="dln" value="${esc(pr.last||"Tester")}"></div></div>
 </div><div>
  <label class="tog"><input type="checkbox" id="dh" ${pr.hud!==false?"checked":""}> Show detector panel on the board</label>
  <label class="tog"><input type="checkbox" id="ds" ${pr.save!==false?"checked":""}> Save to Supabase</label>
  <label class="tog"><input type="checkbox" id="di" ${pr.intro?"checked":""}> Show intro and rule-change screens</label>
 </div></div>
 <h3 style="font-size:18px;margin-top:22px">Hint and detector settings</h3>
 <div class="cfg">${Object.keys(CFG_DEFAULT).filter(k=>k!="W").map(k=>`<div><label for="c_${k}">${k}</label>${typeof CFG[k]=="boolean"?`<select id="c_${k}"><option value="true" ${CFG[k]?"selected":""}>true</option><option value="false" ${CFG[k]?"":"selected"}>false</option></select>`:num("c_"+k,CFG[k],k=="stagnationFactor"?.1:1)}<div class="hint2">${CFG_HELP[k]||""}${CFG[k]!==CFG_DEFAULT[k]?` · default ${CFG_DEFAULT[k]}`:""}</div></div>`).join("")}</div>
 <h3 style="font-size:18px;margin-top:18px">Struggle weights <span class="mu" style="font-size:14px;font-weight:400">(see DETECTOR.md)</span></h3>
 <div class="cfg">${Object.keys(CFG_DEFAULT.W).map(k=>`<div><label for="w_${k}">${k}</label>${num("w_"+k,CFG.W[k],.1)}${CFG.W[k]!==CFG_DEFAULT.W[k]?`<div class="hint2">default ${CFG_DEFAULT.W[k]}</div>`:""}</div>`).join("")}</div>
 <div class="row" style="margin-top:20px"><button class="btn-p" id="go">Start</button><button id="rs">Reset settings to defaults</button><button id="cp">Copy settings as code</button></div>
 <textarea id="code" readonly style="display:none;margin-top:12px"></textarea></div></main>`;
 if(!MODES[pr.cond]||MODES[pr.cond].session!=1)pr.cond="control";
 const fillLevels=()=>{const m=MODES[$("#dc").value],pl=planFor(m);$("#dl").innerHTML=pl.map((d,i)=>`<option value="${i}" ${pr.cond==$("#dc").value&&pr.start==i?"selected":""}>${d.id} · ${d.phase}${d.phase=="training"?" · "+d.tier:d.phase=="practice"?"":" · "+d.tier}${d.rule=="bottom"?" (bottom rule)":""} · ${d.n}×${d.n}, best ${d.opt}</option>`).join("")};
 fillLevels();$("#dc").onchange=fillLevels;
 const read=()=>{const c={W:{}};for(const k in CFG_DEFAULT){if(k=="W")continue;const el=$("#c_"+k);c[k]=typeof CFG_DEFAULT[k]=="boolean"?el.value=="true":+el.value}for(const k in CFG_DEFAULT.W)c.W[k]=+$("#w_"+k).value;return c};
 const store=()=>{const c=read();applyCfg(c);const p={cond:$("#dc").value,start:+$("#dl").value,first:cleanName($("#dfn").value)||"Dev",last:cleanName($("#dln").value)||"Tester",hud:$("#dh").checked,save:$("#ds").checked,intro:$("#di").checked,cfg:c};LS.set(DEVK,JSON.stringify(p));return p};
 $("#rs").onclick=()=>{const p=devPrefs();delete p.cfg;LS.set(DEVK,JSON.stringify(p));for(const k in CFG_DEFAULT)CFG[k]=k=="W"?{...CFG_DEFAULT.W}:CFG_DEFAULT[k];devSetup()};
 $("#cp").onclick=async()=>{store();const t="const CFG="+JSON.stringify(CFG,null,1).replace(/\n\s*/g," ")+";";const ta=$("#code");ta.style.display="block";ta.value=t;ta.select();try{await navigator.clipboard.writeText(t);$("#cp").textContent="Copied"}catch(e){$("#cp").textContent="Select and copy below"}};
 $("#go").onclick=()=>{const p=store();devStart(p)}}
function devStart(p){M={...MODES[p.cond],label:"Development · "+p.cond};
 SB.on=!!(SUPABASE_URL&&SUPABASE_ANON_KEY)&&p.save;S=newS(p.first,p.last);S.group="dev";S.mode="dev";S.devHud=p.hud;S.i=p.start;
 if(!p.intro)S.seen={immediate:true,bottom:true};
 log("session_start",{pid:S.pid,firstName:S.first,lastName:S.last,mode:"dev",devCondition:p.cond,session:S.session,group:"dev",assistance:S.cond,startAt:p.start,cfg:JSON.parse(JSON.stringify(CFG)),url:location.href});flush();
 clearInterval(devTimer);devTimer=setInterval(()=>{if(G&&!G.done)drawHud()},1000);
 if(p.intro&&p.start==0)intro();else startLevel()}
function devGo(i){if(!S)return;if(G)endHint("dev_jump");i=Math.max(0,Math.min(S.plan.length-1,i));log("dev_jump",{from:S.i,to:i});S.i=i;G=null;startLevel()}
function drawHud(){const el=$("#hud");if(!el||!G||!S)return;if(!S.devHud){el.style.display="none";return}
 if(!el.dataset.built){el.dataset.built=1;el.innerHTML=`<button class="hudMin" id="hudMin" aria-label="Collapse detector panel">–</button><div id="hudS"></div><div class="hudb"><button data-h="hint">Hint now</button><button data-h="fire">Fire detector</button><button data-h="solve">Solve</button><button data-h="restart">Restart</button>
  <button data-h="prev">◀ Prev</button><button data-h="next">Next ▶</button><button data-h="quiz">Quiz</button><button data-h="setup">Setup</button></div>`;
  $("#hudMin").onclick=e=>{e.stopPropagation();S.hudMin=!S.hudMin;el.classList.toggle("min",S.hudMin);$("#hudMin").textContent=S.hudMin?"+":"–"};if(S.hudMin){el.classList.add("min");$("#hudMin").textContent="+"}
  el.querySelectorAll("[data-h]").forEach(b=>b.onclick=e=>{e.stopPropagation();if(!G||!S)return;const h=b.dataset.h;
   if(h=="hint"){if(!G.done)giveHint(false)}else if(h=="fire"){if(!G.done)fire(true)}else if(h=="solve"){if(!G.done){endHint("dev");(bfs(L,G.r,G.c,G.o)||[]).forEach(d=>act(d))}}
   else if(h=="restart")devGo(S.i);else if(h=="prev")devGo(S.i-1);else if(h=="next")devGo(S.i+1);else if(h=="quiz"){endHint("dev");G=null;quizStart()}
   else if(h=="setup"){flush();devSetup()}})}
 const d=G.lastD,budget=Math.max(CFG.stagnationBase,Math.ceil(CFG.stagnationFactor*(d==Infinity||d==null?G.best:d))),g=gate(),pct=Math.min(100,G.score/CFG.threshold*100);
 const last=G.recent[G.recent.length-1]||"–",live=assist()&&S.cond=="adaptive";
 $("#hudS").innerHTML=`<div class="hudh"><b>Detector</b><span>${L.id} · ${L.phase}/${L.tier} · best ${L.opt}</span></div>
 <div class="meter"><i style="width:${pct}%"></i></div>
 <div class="hudg"><span>Score</span><b>${G.score.toFixed(1)} / ${CFG.threshold}</b><span>Last action</span><b>${last}</b>
 <span>Moves left (optimal)</span><b>${d==Infinity?"dead end":d} <span class="mu">· best ${G.best}</span></b><span>Since progress</span><b>${G.sinceProgress} / ${budget}</b>
 <span>Fires · hints</span><b>${G.fires} · ${G.hints}</b><span>Would fire?</span><b>${g?`<span class="mu">no: ${g}</span>`:"yes"}</b>
 <span>On fire</span><b>${live?(CFG.adaptiveAutoPlay?"show hint":"offer hint"):"log only"}</b></div>
 <div class="hudr">${G.recent.map(t=>`<i class="${t}">${t.replace("_"," ")}</i>`).join("")}</div>`}

document.addEventListener("visibilitychange",()=>{if(document.visibilityState=="hidden"&&S)flush()});
window.__rdm={CFG,MODE,devGo,get S(){return S},get G(){return G},get L(){return L},bfs,act,undo,giveHint,V};
if(!LV){app.innerHTML=`<p style="padding:30px">Levels failed to load. Please reload the page.</p>`}else welcome();
