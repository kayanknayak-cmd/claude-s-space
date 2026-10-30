const OUT = process.env.OUT || require('os').tmpdir();
const fs=require('fs'); const src=fs.readFileSync('/home/user/claude-s-space/slingshot/'+(process.argv[2]||'slingshot-phone')+'.html','utf8');
fs.writeFileSync(OUT+'/ph.html',`<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${src}</body></html>`);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('file://'+OUT+'/ph.html'); await p.waitForTimeout(800);
 const r = await p.evaluate(()=>{ const out=[];
   // every level's stored hint must actually clear it in the game (par 1) or at least hit something
   for (let i=0;i<ALL.length;i++){ const L=ALL[i]; if(!L.sol){out.push([i,'nosol']);continue;}
     load(i,{throws:[[0,L.sol[0],L.sol[1]]],hint:true}); releaseTitle(); let f=0; while(!S.won && f<60*80){ S.time+=1/60; simulate(1/60); f++; if(!S.comets.length && S.replay.throws.every(q=>q.done)) break; }
     out.push([i, L.par, S.won?1:0, S.order.length+'/'+L.targets.length, S.tricks.map(t=>t[0]).join('|')]); }
   buildMenu(); return out; });
 const bad=r.filter(x=>x[1]===1&&!x[2]);
 console.log('levels', r.length, 'par1 hints failing:', JSON.stringify(bad));
 console.log('tricks seen:', [...new Set(r.flatMap(x=>(x[4]||'').split('|')).filter(Boolean))].join(', '));
 console.log(errs.join('\n')||'no errors'); await b.close();})();
