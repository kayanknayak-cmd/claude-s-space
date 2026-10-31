// Renders Kenney models from straight above (or from the +z side with FRONT=1) (north = -z at the top, red tick marks +x) into one PNG grid, to see
// which way tiles face. Usage: node tools/peek.mjs out.png <zip> <dir/in/zip> name1 name2 ...
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const [out, zip, dir, ...names] = process.argv.slice(2);
const Z = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../assets/kenney', zip);
const get = f => execFileSync('unzip', ['-p', Z, f], { maxBuffer: 1 << 26 });
let tex = null; try { tex = get(dir + '/Textures/colormap.png').toString('base64'); } catch {}
const models = names.map(n => get(dir + '/' + n + '.glb').toString('base64'));
const html = `<body style="margin:0;background:#fff"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const M=${JSON.stringify(models)}, N=${JSON.stringify(names)}, TEX=${JSON.stringify(tex)};
const C=4, S=220, R=Math.ceil(M.length/C);
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); r.setSize(C*S,R*(S+18)); document.body.appendChild(r.domElement); r.setScissorTest(true);
const mgr=new THREE.LoadingManager(); mgr.setURLModifier(u=>TEX?'data:image/png;base64,'+TEX:u); const L=new GLTFLoader(mgr);
const b=s=>{const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a.buffer};
const scenes=await Promise.all(M.map(m=>new Promise(res=>L.parse(b(m),'',g=>res(g.scene)))));
r.setClearColor('#ffffff'); r.clear();
scenes.forEach((o,i)=>{const sc=new THREE.Scene(); sc.add(o,new THREE.AmbientLight('#fff',2.5),new THREE.DirectionalLight('#fff',1.5));
 const bb=new THREE.Box3().setFromObject(o), sz=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3()), h=Math.max(sz.x,sz.z,sz.y)*.62;
 const cam=new THREE.OrthographicCamera(-h,h,h,-h,.01,100); if(${!!process.env.FRONT}){cam.position.set(c.x+h*.0,c.y+h*.6,bb.max.z+20); cam.up.set(0,1,0); cam.lookAt(c.x,c.y,c.z);} else {cam.position.set(c.x,bb.max.y+10,c.z); cam.up.set(0,0,-1); cam.lookAt(c.x,0,c.z);}
 const tick=new THREE.Mesh(new THREE.BoxGeometry(h*.25,.01,h*.04),new THREE.MeshBasicMaterial({color:'red'})); tick.position.set(c.x+h*.85,bb.max.y+1,c.z); sc.add(tick);
 const x=(i%C)*S, y=(R-1-Math.floor(i/C))*(S+18)+18; r.setViewport(x,y,S,S); r.setScissor(x,y,S,S); r.render(sc,cam);});
document.title='done';
</script></body>`;
const tmp = path.join(path.dirname(out), 'peek.html'); fs.writeFileSync(tmp, html);
const b = await chromium.launch({ proxy: { server: process.env.https_proxy }, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 4 * 220, height: Math.ceil(names.length / 4) * 238 } });
await p.goto('file://' + tmp); await p.waitForFunction(() => document.title === 'done', null, { timeout: 60000 });
await p.screenshot({ path: out }); await b.close();
const lab = names.map((n, i) => `-annotate +${(i % 4) * 220 + 4}+${Math.floor(i / 4) * 238 + 14} "${n}"`).join(' ');
execFileSync('bash', ['-c', `convert "${out}" -pointsize 13 ${lab} "${out}"`]);
console.log('wrote', out);
