// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// usage: node texcheck.js build/paper-map.json story.html
const fs=require('fs'), path=require('path');
function loadKatex(){ const c=[process.env.KATEX_DIST?path.dirname(process.env.KATEX_DIST.replace(/\/$/,'')):null,'katex',path.join(__dirname,'node_modules','katex'),'/opt/npm-tools/node_modules/katex'].filter(Boolean);
  for(const x of c){ try{ return require(x); }catch(e){} } console.error('KaTeX not found: run `npm install katex` next to texcheck.js, or set KATEX_DIST'); process.exit(2); }
const katex=loadKatex();
const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const storyPath=process.argv[3];
const macros={'\\Spec':'\\operatorname{Spec}','\\Bun':'\\operatorname{Bun}','\\Hom':'\\operatorname{Hom}','\\End':'\\operatorname{End}','\\Ind':'\\operatorname{Ind}','\\Coh':'\\operatorname{Coh}','\\QCoh':'\\operatorname{QCoh}'};
const segs=s=>{const o=[];const re=/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;let x;while((x=re.exec(s)))o.push(x[1]||x[2]);return o;};
const texts=[]; m.nodes.forEach(n=>['statement','intuition'].forEach(f=>{if(n[f])texts.push([n.id+'.'+f,n[f]]);}));
m.batch.forEach(b=>(b.doubtful||[]).forEach((d,i)=>texts.push([b.key+'.doubtful'+i,d.what+' '+d.why])));
((m.corpus&&m.corpus.gaps)||[]).forEach(g=>texts.push(['gap '+g.id,[g.title,g.statement,g.type,g.why,g.test,g.tools,g.notes,(g.novelty||{}).found].concat((g.sources||[]).map(x=>x.note)).concat((g.related||[]).map(x=>(x.title||'')+' '+(x.note||''))).filter(Boolean).join(' ')]));
if(storyPath&&fs.existsSync(storyPath)) texts.push(['story',fs.readFileSync(storyPath,'utf8').replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')]);
let n=0,bad=[]; const warn=console.warn; console.warn=()=>{};
texts.forEach(([k,s])=>{ if(((s.replace(/\$\$/g,'').match(/\$/g)||[]).length)%2) bad.push([k,'odd number of $']); segs(s).forEach(t=>{n++;try{katex.renderToString(t,{throwOnError:true,strict:'ignore',macros:Object.assign({},macros)});}catch(e){bad.push([k,e.message.slice(0,90)]);}});});
console.warn=warn; console.log('formulas',n,'errors',bad.length); bad.slice(0,20).forEach(b=>console.log(JSON.stringify(b)));
