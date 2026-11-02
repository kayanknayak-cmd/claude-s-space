// ---------- scene: renderer, sky, light, terrain, water, roads, buildings and nature ----------
const $ = id => document.getElementById(id);
// ?lite: no shadows and a short view, for the headless test browser (software GL)
const LITE = /lite/.test(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// no tone mapping: Kenney's palette is meant to be shown as is (ACES washed it out)
const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#cfe6ee'), ZENITH = new THREE.Color('#4f9fd9');
scene.fog = new THREE.Fog(HORIZON, 240, 860);
const camera = new THREE.PerspectiveCamera(62, 1, .5, 1400);

// sky dome: vertical gradient and a warm glow around the sun
const SUN_DIR = new THREE.Vector3(-.55, .62, .56).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: ZENITH }, bot: { value: HORIZON }, sun: { value: SUN_DIR } },
  vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, bot, sun; varying vec3 v;
    void main(){ float h = clamp(v.y * 1.6, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, .7));
      float s = max(dot(v, sun), 0.0); c += vec3(1.0, .82, .55) * (pow(s, 24.0) * .5 + pow(s, 900.0) * 2.0);
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -1;
scene.add(sky);
scene.add(new THREE.HemisphereLight('#d6ecff', '#7f9468', .95));
const sun = new THREE.DirectionalLight('#fff0d4', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 70;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
sun.shadow.bias = -.0005; sun.shadow.normalBias = .06;
scene.add(sun, sun.target);
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
  const l = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity, side: m.side });
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
  const D = T / HG, per = TS / D, mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
    new THREE.MeshPhongMaterial({ color: '#2e8fc9', shininess: 90, specular: '#cfefff', transparent: true, opacity: .9 }));
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
