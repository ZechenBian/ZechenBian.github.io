// 共享物理模块：游戏和关卡求解器都用这一份代码
const PH=(function(){
const W=1000,H=600,DT=0.25,SUB=4,MAXT=1400;
const VE=6,M0=1;               // 喷气速度 / 探测器干质量（火箭方程用）
const AST_M=220,AST_R=5;       // 小行星质量（被行星吸积时加到行星上）/ 半径
const K=0.05,MAXDRAG=180;      // 发射拖拽 → 速度
const KT=0.02,MAXDV=3;         // 点火拖拽 → Δv
const STAR_R=20;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function orbitPos(o,t){const a=o.phase+t*2*Math.PI/o.period;return[o.cx+o.R*Math.cos(a),o.cy+o.R*Math.sin(a)];}
function ppos(p,t){return p.orbit?orbitPos(p.orbit,t):[p.x,p.y];}
function tpos(L,t){return L.target.orbit?orbitPos(L.target.orbit,t):[L.target.x,L.target.y];}
// 行星质量随时间变化：脉冲、蒸发、吸积
function pmass(p,t,extra){let m=p.m;if(p.pulse)m*=1+p.pulse.amp*Math.sin(2*Math.PI*t/p.pulse.period+(p.pulse.phase||0));if(p.decay)m*=Math.exp(-t/p.decay);return m+(extra||0);}
// 视觉/碰撞半径随质量变化（体积 ∝ 质量）
function prad(p,m){const f=Math.cbrt(Math.max(.15,Math.abs(m)/Math.abs(p.m)));return p.r*Math.max(.55,Math.min(1.6,f));}
function makeWorld(L,seed){
  const w={t:0,extra:L.planets.map(()=>0),ast:[]};
  const rnd=mulberry32(seed||1);
  for(const b of (L.belts||[])){
    const p=L.planets[b.around];const[px,py]=ppos(p,0);
    for(let i=0;i<b.n;i++){
      const r=b.rmin+(b.rmax-b.rmin)*rnd(),a=rnd()*Math.PI*2;
      const v=Math.sqrt(Math.abs(p.m)/r)*(b.vf||1)*(0.95+0.1*rnd())*(b.dir||1);
      w.ast.push({x:px+r*Math.cos(a),y:py+r*Math.sin(a),vx:-v*Math.sin(a),vy:v*Math.cos(a),alive:true,rot:rnd()*6,drag:(b.drag||0)*(.25+1.5*rnd())});
    }
  }
  return w;
}
function addRandomAsteroids(w,L,n,seed){
  const rnd=mulberry32(seed);let k=0,tries=0;
  while(k<n&&tries<600){tries++;const x=rnd()*W,y=rnd()*H;
    if(Math.hypot(x-L.launch[0],y-L.launch[1])<140)continue;
    let ok=true;for(const p of L.planets){const[px,py]=ppos(p,0);if(Math.hypot(px-x,py-y)<p.r+50)ok=false;}
    const[tx,ty]=tpos(L,0);if(Math.hypot(tx-x,ty-y)<L.target.r+50)ok=false;
    if(!ok)continue;
    let best=null,bd=1e9;for(const p of L.planets){if(p.m<=0)continue;const[px,py]=ppos(p,0);const d=Math.hypot(px-x,py-y);if(d<bd){bd=d;best=[px,py,p.m];}}
    let vx,vy;
    if(best){const[px,py,m]=best;const a=Math.atan2(y-py,x-px);const v=Math.sqrt(m/bd)*(.85+.3*rnd())*(rnd()<.5?1:-1);vx=-v*Math.sin(a);vy=v*Math.cos(a);}
    else{const a=rnd()*Math.PI*2,sp=.3+rnd()*1.1;vx=sp*Math.cos(a);vy=sp*Math.sin(a);}
    w.ast.push({x,y,vx,vy,alive:true,random:true,rot:rnd()*6,drag:0});k++;}
}
function accel(L,w,x,y,t){let ax=0,ay=0;for(let i=0;i<L.planets.length;i++){const p=L.planets[i];const[px,py]=ppos(p,t);const m=pmass(p,t,w.extra[i]);const dx=px-x,dy=py-y;const r2=dx*dx+dy*dy;const r=Math.sqrt(r2);const f=m/(r2*r);ax+=f*dx;ay+=f*dy;}return[ax,ay];}
// 世界前进一个 DT；probe 可为 null。返回探测器事件：null | 'crash' | 'win' | 'lost' | 'timeout'
function step(L,w,probe){
  const t=w.t;
  for(const a of w.ast){if(!a.alive)continue;const[ax,ay]=accel(L,w,a.x,a.y,t);a.vx+=ax*DT;a.vy+=ay*DT;if(a.drag){const f=1-a.drag*DT;a.vx*=f;a.vy*=f;}a.x+=a.vx*DT;a.y+=a.vy*DT;}
  if(probe){const[ax,ay]=accel(L,w,probe.x,probe.y,t);probe.vx+=ax*DT;probe.vy+=ay*DT;probe.x+=probe.vx*DT;probe.y+=probe.vy*DT;}
  w.t=t+DT;const t2=w.t;let ev=null;
  for(let i=0;i<L.planets.length;i++){const p=L.planets[i];const[px,py]=ppos(p,t2);const rr=prad(p,pmass(p,t2,w.extra[i]));
    for(const a of w.ast){if(a.alive&&Math.hypot(px-a.x,py-a.y)<rr+AST_R){a.alive=false;if(p.accrete){w.extra[i]+=AST_M;if(w.flash)w.flash.push({x:a.x,y:a.y,t:t2});}}}
    if(probe&&!ev&&Math.hypot(px-probe.x,py-probe.y)<rr+4)ev='crash';}
  for(const a of w.ast){if(a.alive&&(a.x<-300||a.x>W+300||a.y<-300||a.y>H+300))a.alive=false;}
  if(probe&&!ev){for(const a of w.ast){if(a.alive&&Math.hypot(a.x-probe.x,a.y-probe.y)<AST_R+5){ev='crash';break;}}}
  if(probe&&!ev){const[tx,ty]=tpos(L,t2);
    if(Math.hypot(tx-probe.x,ty-probe.y)<L.target.r)ev='win';
    else if(probe.x<-150||probe.x>W+150||probe.y<-150||probe.y>H+150)ev='lost';
    else if(t2-probe.t0>MAXT)ev='timeout';}
  return ev;
}
// 火箭方程：Δv = VE·ln(m0/m1)。燃料越少质量越小，同样的 Δv 消耗的燃料更少
function maxDv(probe){return Math.min(MAXDV,Math.max(0,VE*Math.log(probe.m/M0)));}
function burn(probe,dvx,dvy){const dv=Math.hypot(dvx,dvy);if(dv<1e-9)return 0;const d=Math.min(dv,maxDv(probe));probe.vx+=dvx/dv*d;probe.vy+=dvy/dv*d;probe.m*=Math.exp(-d/VE);return d;}
function cloneWorld(w){return{t:w.t,extra:w.extra.slice(),ast:w.ast.map(a=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,alive:a.alive}))};}
function newProbe(L,w,vx,vy){return{x:L.launch[0],y:L.launch[1],vx,vy,t0:w.t,m:M0+(L.fuel||0)};}
function dragVel(sx,sy,x,y){let dx=sx-x,dy=sy-y;const len=Math.hypot(dx,dy);const c=Math.min(len,MAXDRAG);if(len>0){dx*=c/len;dy*=c/len;}return{vx:dx*K,vy:dy*K,v:c*K,len:c};}
return{W,H,DT,SUB,MAXT,VE,M0,K,MAXDRAG,KT,MAXDV,AST_R,STAR_R,mulberry32,ppos,tpos,pmass,prad,makeWorld,addRandomAsteroids,step,burn,maxDv,cloneWorld,newProbe,dragVel};
})();
if(typeof module!=='undefined')module.exports=PH;
