const OUT = process.env.OUT || require('os').tmpdir();
const fs=require('fs'); const src=fs.readFileSync('/home/user/claude-s-space/slingshot/bonk.html','utf8');
fs.writeFileSync(OUT+'/bk.html',`<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${src}</body></html>`);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('file://'+OUT+'/bk.html'); await p.waitForTimeout(700);
 const run = (f)=>p.evaluate(f);
 // 1. name sky
 let r = await run(async()=>{ const t0=performance.now(); const L=await skyFromName('Grandma'); const L2=await skyFromName('Grandma');
   if(!L) return 'nameSky failed';
   const code=skyCode(L), back=readSky(code), same=skyCode(back)===code, win=flyOne(back,back.sol[0],back.sol[1],600*30).won, det=skyCode(L2)===code;
   const i=addCustom(back); load(i); return {ms:Math.round(performance.now()-t0), code, same, win, det, n:L.targets.length, name:level().name}; });
 console.log('name sky', JSON.stringify(r));
 // 2. editor fairness
 r = await run(async()=>{ const L={name:'Test',launch:[0,-1.252],bodies:[{x:0,y:0.2,...SK.b}],targets:[[-0.3,0.5],[0.3,0.5]]}; const t0=performance.now(); const s=await fairThrow(L); return {sol:s, ms:Math.round(performance.now()-t0)}; });
 console.log('fair', JSON.stringify(r));
 // 3. menu + board + editor UI
 await run(()=>{ load(0); buildMenu(); $('#menu').hidden=false; }); await p.waitForTimeout(300);
 await p.screenshot({path:OUT+'/bk-menu.png'});
 await run(()=>{ openEditor(); }); await p.waitForTimeout(200);
 await p.mouse.click(120,300); await p.mouse.click(260,250); await p.click('#editBar [data-t="t"]'); await p.mouse.click(100,200); await p.mouse.click(290,420);
 await p.waitForTimeout(300); await p.screenshot({path:OUT+'/bk-edit.png'});
 r = await run(()=>({bodies:S.edit.L.bodies.length, targets:S.edit.L.targets.length})); console.log('editor', JSON.stringify(r));
 await p.click('#editBar [data-a="try"]'); for (let k=0;k<8;k++){ await p.waitForTimeout(1000); console.log(k, await run(()=>JSON.stringify({e:!!S.edit,t:$("#toast").textContent,h:$("#toast").hidden,n:level().name,d:!!level().draft}))); }
 r = await run(()=>({edit:!!S.edit, custom:!!world().custom, name:level().name, toast:$('#toast').textContent})); console.log('after try', JSON.stringify(r));
 // 4. duel
 r = await run(()=>{ load(0); toggleDuel(); const L=level(); const out=[];
   for (let k=0;k<2;k++){ fire(L.sol[0],L.sol[1]); let f=0; while(!S.won&&f<60*60){S.time+=1/60;simulate(1/60);f++;} out.push([S.won, S.duel.turn, nextIdx()]); if(k===0) load(nextIdx()); }
   const res=$('#toast').textContent; toggleDuel(); return {out, skinDuel: 'ok'}; });
 console.log('duel', JSON.stringify(r));
 // 5. photo + card
 r = await run(()=>{ load(0); const L=level(); fire(L.sol[0],L.sol[1]); let f=0; while(!S.won&&f<60*60){S.time+=1/60;simulate(1/60);f++;}
   photo(); photoZoom(1.6, 195, 400); S.cam.x+=0.1; renderGL(); draw(); return {photo:!!S.photo, z:S.cam.z.toFixed(2)}; });
 await p.waitForTimeout(200); await p.screenshot({path:OUT+'/bk-photo.png'});
 await run(()=>{ photoEnd(); shareCard(); }); await p.waitForTimeout(500);
 console.log('photo', JSON.stringify(r));
 // 6. challenge link with ghost
 const code = await run(()=>replayCode());
 const p2=await ctx.newPage(); p2.on('pageerror',e=>errs.push('p2 '+e.message));
 await p2.goto('file://'+OUT+'/bk.html#c.'+code); await p2.waitForTimeout(700);
 r = await p2.evaluate(()=>{ releaseTitle(); const L=level(); fire(L.sol[0]*0.97,L.sol[1]); for(let f=0;f<150;f++){S.time+=1/60;simulate(1/60);} renderGL(); draw(); return {ghost:!!(S.ghostRun&&S.ghostRun.W), trail:S.ghostRun&&S.ghostRun.trail.length, eyebrow:S.title&&S.title.eyebrow}; });
 await p2.screenshot({path:OUT+'/bk-ghost.png'});
 console.log('challenge', JSON.stringify(r));
 // 7. sky link boot
 const sc = await run(()=>{ const i=ALL.findIndex(q=>q.name==='Grandma'); return skyCode(ALL[i]); });
 const p3=await ctx.newPage(); p3.on('pageerror',e=>errs.push('p3 '+e.message));
 await p3.goto('file://'+OUT+'/bk.html#s.'+sc); await p3.waitForTimeout(600);
 r = await p3.evaluate(()=>({name:level().name, custom:!!world().custom, n:level().targets.length})); console.log('sky link', JSON.stringify(r));
 console.log(errs.join('\n')||'no errors'); await b.close();})();
