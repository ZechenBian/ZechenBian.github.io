// 暴力验证每关纯弹道（不点火）可解，并沿真实可赢轨迹放置星星
const PH=require('./physics.js');const LEVELS=require('./levels.js');const fs=require('fs');
const {W,H,DT,SUB,MAXT,STAR_R}=PH;
function run(L,vx,vy,t0,stars){
  const w=PH.makeWorld(L,L.seed||1);
  // 让世界先跑到 t0
  while(w.t<t0-1e-9)PH.step(L,w,null);
  const p=PH.newProbe(L,w,vx,vy);const path=[];const got=stars?stars.map(()=>false):[];
  for(let i=0;i<MAXT/DT/SUB+2;i++){
    for(let k=0;k<SUB;k++){const ev=PH.step(L,w,p);
      if(stars)stars.forEach(([sx,sy],j)=>{if(Math.hypot(sx-p.x,sy-p.y)<STAR_R)got[j]=true;});
      if(ev)return{ev,path,got};}
    path.push([p.x,p.y]);
  }
  return{ev:'timeout',path,got};
}
function sweep(L,t0,stars){
  const wins=[];let n=0;
  for(let ang=0;ang<360;ang+=2)for(let s=1.5;s<=9.001;s+=.25){n++;
    const a=ang*Math.PI/180;const r=run(L,s*Math.cos(a),s*Math.sin(a),t0,stars);
    if(r.ev==='win')wins.push(r);}
  return{wins,n};
}
function clear(L,x,y){
  if(!(40<x&&x<W-40&&40<y&&y<H-40))return false;
  for(const p of L.planets){
    if(p.orbit){if(Math.abs(Math.hypot(x-p.orbit.cx,y-p.orbit.cy)-p.orbit.R)<p.r+26)return false;}
    else if(Math.hypot(p.x-x,p.y-y)<p.r*((p.pulse||p.decay||L.belts)?1.6:1)+30)return false;}
  for(const b of (L.belts||[])){const p=L.planets[b.around];const d=Math.hypot(p.x-x,p.y-y);if(d>b.rmin-30&&d<b.rmax+30)return false;}
  const T=L.target;if(T.orbit){if(Math.abs(Math.hypot(x-T.orbit.cx,y-T.orbit.cy)-T.orbit.R)<T.r+30)return false;}
  else if(Math.hypot(T.x-x,T.y-y)<T.r+30)return false;
  if(Math.hypot(L.launch[0]-x,L.launch[1]-y)<90)return false;
  return true;
}
const out=[];
for(const L of LEVELS){
  const t=Date.now();const {wins,n}=sweep(L,0,null);
  let line=`${L.name.zh.padEnd(5,'　')} wins=${wins.length}/${n} (${(100*wins.length/n).toFixed(2)}%)`;
  if(!wins.length){console.log(line+'  ✗ 无解');out.push(Object.assign({},L,{stars:[]}));continue;}
  wins.sort((a,b)=>a.path.length-b.path.length);
  // 在同一条可赢路径上放下全部星星（这样"一发集齐"由构造保证）
  let stars=[];
  const idx=[.6,.75,.45,.9,.3,.99,.15,.5].map(f=>Math.min(wins.length-1,Math.floor(wins.length*f)));
  for(const i of idx){const path=wins[i].path,m=path.length;const s=[];
    for(const f of [.35,.65,.5,.25,.75,.45,.55,.3,.7,.2,.8,.4,.6,.15,.85]){const[x,y]=path[Math.floor(m*f)];
      if(clear(L,x,y)&&s.every(([cx,cy])=>Math.hypot(x-cx,y-cy)>110))s.push([Math.round(x),Math.round(y)]);
      if(s.length>=L.nstars)break;}
    if(s.length>stars.length)stars=s;if(stars.length>=L.nstars)break;}
  const best=stars.length;
  // 动态关卡：晚一点发射还有解吗？
  let later='';if(L.planets.some(p=>p.orbit||p.pulse||p.decay)||L.belts||L.target.orbit){
    const ws=[80,160,240,320].map(t0=>sweep(L,t0,null).wins.length);later='  t0=80/160/240/320 → '+ws.join('/');}
  console.log(line+`  stars=${best}/${stars.length}${later}  ${((Date.now()-t)/1000).toFixed(1)}s`);
  const Lc=Object.assign({},L,{stars});delete Lc.nstars;out.push(Lc);
}
fs.writeFileSync(require("path").join(__dirname,"levels.json"),JSON.stringify(out));
