const OUT = process.env.OUT || require('os').tmpdir();
// full-size reels are too slow for the container's software GL, so this renders them at 270x480
{ const fs=require('fs'); const src=fs.readFileSync('/home/user/claude-s-space/bonk.html','utf8').replace('const vw = 1080, vh = 1920, fps = 60;','const vw = 270, vh = 480, fps = 60;');
  fs.writeFileSync(OUT+'/bk-small.html',`<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${src}</body></html>`); }
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{ const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1]));
 await p.goto('file://'+OUT+'/bk-small.html'); await p.waitForTimeout(600); const iv=setInterval(async()=>{ try{ console.log('progress', await p.evaluate(()=>[$('#toast').textContent, S.tick, CLIP, (performance.now()/1000).toFixed(0)].join(' | '))); }catch(e){} }, 15000);
 const info = await p.evaluate(async()=>{
   let idx=-1; for (let i=0;i<40;i++){ const L=ALL[i]; const r=flyOne(L,L.sol[0],L.sol[1],600*40); if(r.won && r.ticks>1500){idx=i;break;} }
   load(idx); releaseTitle(); const L=level();
   // one crash first: aim straight at the first star
   const B=L.bodies[0], dx=B.x-L.launch[0], dy=B.y-L.launch[1], d=Math.hypot(dx,dy); fire(dx/d*0.5, dy/d*0.5);
   let f=0; while(S.comets.some(c=>c.alive)&&f<60*40){S.time+=1/60;simulate(1/60);f++;}
   for(let j=0;j<30;j++){S.time+=1/60;simulate(1/60);}
   fire(L.sol[0],L.sol[1]); f=0; while(!S.won&&f<60*80){S.time+=1/60;simulate(1/60);f++;}
   window.__files=[]; window.shareFile=(file,blob,name)=>window.__files.push({name,size:blob.size,blob});
   const out={idx, won:S.won, throws:S.throws.length};
   const t0=performance.now(); await makeClip(); out.best=((performance.now()-t0)/1000).toFixed(1)+'s';
   $('#toast').querySelector('button')?.click();
   const t1=performance.now(); await makeClip('oops'); out.oops=((performance.now()-t1)/1000).toFixed(1)+'s';
   $('#toast').querySelector('button')?.click();
   out.files=window.__files.map(f=>[f.name,f.size]); return out; });
 console.log(JSON.stringify(info));
 // frames from the best reel: the opening hook and the closing caption
 for (const [k,ts] of [[0,[0.4,1.6]],[1,[0.8,-1.2]]]) {
   const shots = await p.evaluate(async([k,ts])=>{ const f=window.__files[k]; if(!f) return 'nofile'; const v=document.createElement('video'); v.muted=true; v.src=URL.createObjectURL(f.blob); await new Promise(r=>v.onloadedmetadata=r);
     const dur=v.duration, out=[dur.toFixed(1)]; for(const t of ts){ v.currentTime=t<0?dur+t:t; await new Promise(r=>v.onseeked=r); const c=document.createElement('canvas'); c.width=270;c.height=480; c.getContext('2d').drawImage(v,0,0,270,480); out.push(c.toDataURL('image/jpeg',0.8)); } return out; },[k,ts]);
   if (typeof shots==='string') { console.log(shots); continue; }
   console.log('reel',k,'duration',shots[0]);
   shots.slice(1).forEach((u,i)=>require('fs').writeFileSync(OUT+`/bkreel-${k}-${i}.jpg`, Buffer.from(u.split(',')[1],'base64')));
 }
 clearInterval(iv); console.log(errs.join('\n')||'no errors'); await b.close(); })();
