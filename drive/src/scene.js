// ---------- scene: renderer, sky, light, terrain, water, roads, buildings and nature ----------
const $ = id => document.getElementById(id);
// ?lite: no shadows and a short view, for the headless test browser (software GL)
const LITE = /lite/.test(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Filmic tone mapping with a colour grade afterwards (see post below), so the sky can be physically bright and
// Kenney's colours still come through rich.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .7;
const GFX = (() => { try { return localStorage.getItem('sundaydrive.gfx') || 'auto'; } catch { return 'auto'; } })();
let quality = LITE ? 'low' : GFX === 'auto' ? 'high' : GFX;
if (quality === 'low') { renderer.setPixelRatio(1); renderer.toneMappingExposure = 1; }
const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#b8d2e2');
scene.fog = new THREE.FogExp2(HORIZON, .0008);
const camera = new THREE.PerspectiveCamera(62, 1, .5, 2200);

// a physically based sky (Preetham); it also lights everything through an environment map
const SUN_DIR = new THREE.Vector3(-.55, .5, .56).normalize();
const sky = new Sky();
sky.scale.setScalar(1800);
Object.assign(sky.material.uniforms.turbidity, { value: 3.2 }); sky.material.uniforms.rayleigh.value = 1.1;
sky.material.uniforms.mieCoefficient.value = .004; sky.material.uniforms.mieDirectionalG.value = .86;
sky.material.uniforms.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene(), s2 = new Sky();
  s2.scale.setScalar(1000); for (const k in sky.material.uniforms) s2.material.uniforms[k].value = sky.material.uniforms[k].value;
  env.add(s2);
  scene.environment = pm.fromScene(env, 0, .1, 2000).texture;
  scene.environmentIntensity = .5;
}
scene.add(new THREE.HemisphereLight('#fff0d8', '#8c8466', .55));
const sun = new THREE.DirectionalLight('#ffe9cc', 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
const SH = 70;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
sun.shadow.bias = -.0005; sun.shadow.normalBias = .06; sun.shadow.radius = 3;
scene.add(sun, sun.target);

// clouds: soft procedural sprites high up, drifting slowly with the wind
const cloudTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const cx = 40 + Math.random() * 176, cy = 64 + (Math.random() - .5) * 30, r = 18 + Math.random() * 30;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
})();
const clouds = [];
for (let i = 0; i < 46; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: .85 }));
  s.position.set(Math.random() * 4400 - 800, 380 + Math.random() * 200, Math.random() * 4400 - 800);
  s.scale.set(380 + Math.random() * 260, 150 + Math.random() * 90, 1);
  scene.add(s); clouds.push(s);
}
function stepClouds(dt) { for (const s of clouds) { s.position.x += dt * 4; if (s.position.x > 3600) s.position.x -= 4400; } }

// post: ambient occlusion (high), a touch of bloom, a colour grade (saturation, contrast, warmth, vignette)
const GRADE = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.15 }, con: { value: 1.06 }, vig: { value: .32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con, vig; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(.2126, .7152, .0722));
      c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - .5) * con + .5; c.rgb *= vec3(1.04, 1.0, .95);
      vec2 d = vUv - .5; c.rgb *= 1.0 - vig * dot(d, d) * 1.6; gl_FragColor = c; }`,
};
let composer = null, aoPass = null;
function setupPost() {
  if (quality === 'low') { composer = null; return; }
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
  aoPass.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
  aoPass.blendIntensity = .8; aoPass.enabled = quality === 'high';
  composer.addPass(aoPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .16, .45, .95));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));
}
function render() { if (composer) composer.render(); else renderer.render(scene, camera); }
// keep frame rate up: step quality down after a few slow seconds (only when set to auto)
let fpsAvg = 60, slowT = 0;
function watchFps(dt) {
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * .05;
  if (GFX !== 'auto' || LITE) return;
  slowT = fpsAvg < (quality === 'high' ? 45 : 36) ? slowT + dt : 0;
  if (slowT > 4 && quality !== 'low') {
    slowT = 0;
    if (quality === 'high') { quality = 'medium'; aoPass.enabled = false; }
    else { quality = 'low'; composer = null; renderer.setPixelRatio(1); }
    toast(`Graphics set to ${quality} to keep it smooth.`, 2500);
  }
}
function setQuality(q) {
  try { localStorage.setItem('sundaydrive.gfx', q); } catch {}
  location.reload();
}
// The shadow box follows the car but moves in whole shadow texels, so edges don't crawl or flicker.
const LR = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize(), LU = new THREE.Vector3().crossVectors(SUN_DIR, LR);
function aimSun(p) {
  const tex = 2 * SH / 2048, u = p.dot(LR), v = p.dot(LU), w = p.dot(SUN_DIR);
  const q = LR.clone().multiplyScalar(Math.round(u / tex) * tex).addScaledVector(LU, Math.round(v / tex) * tex).addScaledVector(SUN_DIR, w);
  sun.target.position.copy(q); sun.position.copy(q).addScaledVector(SUN_DIR, 200);
}

// ---------- models ----------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
// The compressed models carry a 1x1 stand-in texture whose transform undoes the UV quantization; each mesh gets its
// kit's real colormap with that same transform. The colormaps are decoded before any model is built.
const kitImg = {};
async function loadKitImages() {
  await Promise.all(Object.entries(TEX).map(async ([name, b64]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); kitImg[name] = im;
  }));
}
function kitTexture(name, like) {
  if (!name || !kitImg[name]) return null;
  const t = new THREE.Texture(kitImg[name]);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  if (like) { t.offset.copy(like.offset); t.repeat.copy(like.repeat); t.rotation = like.rotation; t.center.copy(like.center); t.channel = like.channel; }
  t.needsUpdate = true;
  return t;
}
const proto = {};
const bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
const matCache = new Map();
// Kenney's materials become Lambert (cheap, and it keeps their flat colours honest under the sun)
function lambert(m) {
  const key = m.uuid + (m.map ? m.map.uuid : '');
  if (matCache.has(key)) return matCache.get(key);
  const l = quality === 'low' ? new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side })
    : new THREE.MeshStandardMaterial({ color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side, roughness: .82, metalness: 0 });
  matCache.set(key, l);
  return l;
}
async function loadModels(onProgress) {
  const keys = Object.keys(MODELS);
  let done = 0;
  await loadKitImages();
  await Promise.all(keys.map(k => new Promise((res, rej) => loader.parse(bytes(MODELS[k].b), '', g => {
    const seenMat = new Map();
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      if (!seenMat.has(o.material)) {
        const m = o.material;
        if (m.map && MODELS[k].tex) m.map = kitTexture(MODELS[k].tex, m.map);
        seenMat.set(m, lambert(m));
      }
      o.material = seenMat.get(o.material); o.castShadow = o.receiveShadow = true;
    });
    proto[k] = g.scene; onProgress(++done / keys.length); res();
  }, rej))));
}
// every mesh of a model, its geometry baked into the model's own space
const partsCache = {};
// compressed models store positions and normals as normalized integers; turn them back into floats before baking a
// transform in, or anything past +-1 gets clipped
function floatGeo(g) {
  const out = g.clone();
  for (const name of Object.keys(out.attributes)) {
    const a = out.attributes[name];
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  return out;
}
function parts(key) {
  if (partsCache[key]) return partsCache[key];
  const root = proto[key]; root.updateMatrixWorld(true);
  const out = [];
  root.traverse(m => { if (m.isMesh) out.push({ geo: floatGeo(m.geometry).applyMatrix4(m.matrixWorld), mat: m.material }); });
  return partsCache[key] = out;
}
function mk(key) { const o = proto[key].clone(true); return o; }

// Instanced batches: (group, key) -> matrices; flush() turns each into InstancedMeshes
const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
function batcher() {
  const by = new Map();
  return {
    add(key, x, y, z, yaw, s, sy = s) {
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(new THREE.Matrix4().compose(V3.set(x, y, z), Q4.setFromAxisAngle(UPV, yaw), S3.set(s, sy, s)));
    },
    flush(parent, shadow = true) {
      for (const [key, mats] of by) for (const p of parts(key)) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = shadow; im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
      }
    },
  };
}

// ---------- water ----------
let water = null;
// a tiling normal map from summed sine ripples, drawn once
function waterNormals() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), img = x.createImageData(n, n), h = new Float32Array(n * n);
  const waves = Array.from({ length: 9 }, () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6), Math.random() * 6.28, .4 + Math.random()]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let v = 0; for (const [a, b, p, w] of waves) v += Math.sin((i * a + j * b) / n * 6.2832 + p) * w; h[j * n + i] = v; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = h[j * n + (i + 1) % n] - h[j * n + (i + n - 1) % n], dz = h[((j + 1) % n) * n + i] - h[((j + n - 1) % n) * n + i], k = (j * n + i) * 4;
    const l = Math.hypot(dx, dz, 2); img.data[k] = (-dx / l * .5 + .5) * 255; img.data[k + 1] = (-dz / l * .5 + .5) * 255; img.data[k + 2] = (2 / l * .5 + .5) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function stepWater(dt) { if (water) { water.material.normalMap.offset.x += dt * .004; water.material.normalMap.offset.y += dt * .0025; } }

// ---------- terrain ----------
const TC = 8, TS = SIZE / TC;          // 8 x 8 chunks of 360 m
const GROUND = { F: '#5f9a4e', m: '#87956a', f: '#9fb85c', b: '#e6d49c', s: '#7fb45c', d: '#a8aca2', i: '#a3a298', p: '#74b257', r: '#7eb85e', '~': '#d9c88f' };
const FIELDS = ['#c8b456', '#9cbf5a', '#7fa84e', '#a77d55', '#d1c06a'];
const groundCol = {};
for (const k in GROUND) groundCol[k] = new THREE.Color(GROUND[k]);
function terrainColor(x, z, h, out) {
  const i = Math.floor(x / T), j = Math.floor(z / T), d = district(i, j);
  out.copy(groundCol[d] || groundCol.s);
  if (d === 'f') out.set(FIELDS[Math.floor(hash(Math.floor(i / 7), Math.floor(j / 5), 5) * FIELDS.length)]);
  const lv = W.landv(x, z);
  if (lv < .62 && h < 1.8) out.lerp(groundCol.b, Math.min(1, (.62 - lv) * 9));
  if (h < -1.2) out.lerp(groundCol['~'], .7);
  if (d === 'm' || h > 18) {
    const slope = Math.abs(groundAt(W, x + 3, z) - groundAt(W, x - 3, z)) + Math.abs(groundAt(W, x, z + 3) - groundAt(W, x, z - 3));
    if (slope > 4.5) out.lerp(new THREE.Color('#8d8a80'), Math.min(1, (slope - 4.5) / 4));
    if (h > 52) out.lerp(new THREE.Color('#f4f6f8'), Math.min(1, (h - 52) / 8));
  }
  const n = .93 + .14 * hash(Math.floor(x / 9), Math.floor(z / 9), 77);
  out.multiplyScalar(n);
  return out;
}
function buildTerrain(root) {
  const D = T / HG, per = TS / D, mat = quality === 'low' ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95, metalness: 0 });
  const col = new THREE.Color();
  for (let cj = 0; cj < TC; cj++) for (let ci = 0; ci < TC; ci++) {
    const geo = new THREE.PlaneGeometry(TS, TS, per, per).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k) + (ci + .5) * TS, z = pos.getZ(k) + (cj + .5) * TS;
      const a = Math.round(x / D), b = Math.round(z / D), h = W.H[b * HN + a];
      pos.setY(k, h - .06);
      terrainColor(x, z, h, col);
      colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set((ci + .5) * TS, 0, (cj + .5) * TS);
    m.receiveShadow = true;
    root.add(m);
  }
  // the sea, past the island in every direction; shiny enough to catch the sun
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, SIZE * 3).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#175a80', roughness: .16, metalness: 0, envMapIntensity: .55, normalMap: waterNormals(), normalScale: new THREE.Vector2(.45, .45), transparent: true, opacity: .93 }));
  sea.material.normalMap.repeat.set(220, 220);
  water = sea;
  sea.position.set(SIZE / 2, WATER, SIZE / 2);
  sea.receiveShadow = true;
  root.add(sea);
}

// ---------- roads, lights, pillars, buildings, nature, circuit, ramps ----------
const CH = 16, NC = N / CH;           // instancing chunks: 16 x 16 tiles (192 m)
const chunks = [];
function buildWorld(root) {
  const B = Array.from({ length: NC * NC }, () => batcher()), Bfar = Array.from({ length: NC * NC }, () => batcher());
  const chunkOf = (x, z) => Math.min(NC - 1, Math.max(0, Math.floor(z / T / CH))) * NC + Math.min(NC - 1, Math.max(0, Math.floor(x / T / CH)));
  const ROADKEY = { 1: 'rStraight', 2: 'rBend', 3: 'rT', 4: 'rCross', 5: 'rEnd', 6: 'rCross' };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!W.road[k]) continue;
    const x = (i + .5) * T, z = (j + .5) * T, b = B[chunkOf(x, z)];
    b.add(ROADKEY[W.kind[k]], x, .02, z, W.rot[k] * Math.PI / 2, T);
    const g = W.H[(j * HG + 1) * HN + i * HG + 1];
    if (g < -.8 && (i + j) % 2 === 0) b.add('pillar', x, g - .5, z, W.rot[k] * Math.PI / 2 + Math.PI / 2, T * .5, (-g + .4) / .52 * 1.0);
  }
  for (const [key, x, z, rot, s] of W.items) {
    const y = groundAt(W, x, z), small = /^(crop|rock|treeS)/.test(key);
    (small ? Bfar : B)[chunkOf(x, z)].add(key, x, y - .05, z, rot * Math.PI / 2, s);
  }
  // the race circuit: racing-kit tiles placed piece by piece (left corners use the right-corner tile from its exit)
  const C = W.circuit;
  for (const pc of C.pieces) {
    const key = pc.type === 'start' ? 'cStart' : pc.type === 'straight' ? 'cStraight' : 'cCorner' + pc.size;
    const inner = mk(key); inner.position.set(.35, 0, .65);
    const g1 = new THREE.Group(); g1.add(inner);
    const left = pc.type === 'corner' && pc.turn < 0, entry = left ? [pc.size, -(pc.size - .5)] : [.5, 0], hl = left ? [-1, 0] : [0, -1];
    g1.position.set(-entry[0], 0, -entry[1]);
    const g2 = new THREE.Group(); g2.add(g1);
    let yaw = 0;
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, x = hl[0] * Math.cos(a) + hl[1] * Math.sin(a), z = -hl[0] * Math.sin(a) + hl[1] * Math.cos(a); if (Math.abs(x - pc.d[0]) < 1e-6 && Math.abs(z - pc.d[1]) < 1e-6) yaw = a; }
    g2.rotation.y = yaw; g2.position.set(pc.A[0], .03, pc.A[1]); g2.scale.setScalar(C.S);
    root.add(g2);
  }
  // guard rails along causeways: a row of road barriers on each edge that faces open water
  for (const [x, z, alongZ] of W.rails) for (const o of [-.33, 0, .33]) {
    const bx = x + (alongZ ? 0 : o * T), bz = z + (alongZ ? o * T : 0);
    B[chunkOf(bx, bz)].add('guard', bx, .02, bz, alongZ ? Math.PI / 2 : 0, T * .9);
  }
  // the railway: one 12 m track piece per tile, turned to run east-west (the model sits one unit low)
  for (let i = W.rail.i0; i <= W.rail.i1; i++) {
    const x = i * T, z = (W.rail.j + .5) * T;
    B[chunkOf(x, z)].add('rail', x, groundAt(W, x + T / 2, z) + 3.04, z, Math.PI / 2, 3);
  }
  // street lights along every other main-road tile, on alternate sides (knockable, so they live with the props)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!W.road[k] || W.kind[k] !== 1 || (i + j) % 3) continue;
    const horiz = W.road[k + 1] && W.road[k - 1], side = (i + j) % 2 ? 1 : -1;
    const x = (i + .5) * T + (horiz ? 0 : side * T * .43), z = (j + .5) * T + (horiz ? side * T * .43 : 0);
    if (!W.land(i, j)) continue;
    W.props.push(['light', x, z, horiz ? (side > 0 ? 2 : 0) : (side > 0 ? 3 : 1), T]);
  }
  for (let c = 0; c < NC * NC; c++) {
    const g = new THREE.Group(), gf = new THREE.Group();
    B[c].flush(g); Bfar[c].flush(gf);
    g.userData = { cx: (c % NC + .5) * CH * T, cz: (Math.floor(c / NC) + .5) * CH * T, far: gf };
    root.add(g, gf);
    chunks.push(g);
  }
  // ramps: a wedge with a chevron deck and two dark sides
  const chev = document.createElement('canvas'); chev.width = 64; chev.height = 128;
  const cx = chev.getContext('2d'); cx.fillStyle = '#3b3f4a'; cx.fillRect(0, 0, 64, 128);
  cx.strokeStyle = '#ffc21a'; cx.lineWidth = 9;
  for (let y = -40; y < 160; y += 32) { cx.beginPath(); cx.moveTo(4, y + 24); cx.lineTo(32, y); cx.lineTo(60, y + 24); cx.stroke(); }
  const ct = new THREE.CanvasTexture(chev); ct.colorSpace = THREE.SRGBColorSpace; ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  for (const r of W.ramps) {
    const g = new THREE.BufferGeometry(), w = r.w, L = r.len, H = r.h;
    const v = [-w, 0, 0, w, 0, 0, -w, H, L, w, H, L, -w, 0, L, w, 0, L];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, L / 6, 2, L / 6, 0, 0, 0, 0], 2));
    g.setIndex([0, 2, 1, 1, 2, 3, 0, 4, 2, 1, 3, 5, 2, 4, 3, 3, 4, 5]);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: ct, side: THREE.DoubleSide }));
    m.position.set(r.x, groundAt(W, r.x - r.d[0], r.z - r.d[1]) - .02, r.z);
    m.rotation.y = Math.atan2(r.d[0], r.d[1]);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
}
// draw only chunks near the camera; small things (crops, rocks, little trees) only close up
function cullChunks(p) {
  for (const g of chunks) {
    const d = Math.hypot(g.userData.cx - p.x, g.userData.cz - p.z);
    g.visible = d < (LITE ? 450 : 900); g.userData.far.visible = d < (LITE ? 200 : 380);
    // only chunks near the car go into the shadow map
    const cast = d < 230;
    if (g.userData.cast !== cast) { g.userData.cast = cast; for (const m of g.children) m.castShadow = cast; for (const m of g.userData.far.children) m.castShadow = cast; }
  }
}
