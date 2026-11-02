// ---------- start ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const evs = stepWorld(dt);
  effects(evs, dt);
  passive(dt, evs);
  knockProps(car, dt);
  stepTrain(performance.now());
  if (Math.random() < .01) tidyProps(car);
  poseCar(carMesh, car, dt);
  if (race) race.cars.slice(0, race.n).forEach((c, k) => poseCar(aiMeshes[k], c, dt));
  if (ghost) {
    poseCar(ghost.mesh, ghost.c, dt);
    const d = Math.hypot(ghost.c.x - car.x, ghost.c.z - car.z), o = THREE.MathUtils.clamp((d - 3) / 10, .1, 1) * .45;
    ghost.mesh.traverse(m => { if (m.isMesh) m.material.opacity = o; });
  }
  engineSound(car, input.th > 0 ? 1 : 0);
  camera3(dt);
  aimSun(camAt); sky.position.copy(camera.position);
  cullChunks(camera.position);
  // beams pulse gently and fade as you reach them, so they never become a wall of light
  for (const b of beams) { const d = Math.hypot(b.position.x - camera.position.x, b.position.z - camera.position.z); b.material.opacity = (.22 + .08 * Math.sin(performance.now() / 400)) * THREE.MathUtils.clamp((d - 8) / 40, 0, 1); }
  for (const h of EV.heads) if (h.mesh.visible) h.mesh.rotation.y += dt * .6;
  stepParts(dt);
  uiTick();
  if (frame.n++ % 3 === 0) drawMini();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame.n = 0;

async function start() {
  const msg = $('loadmsg'), t0 = performance.now(), lap = n => console.log('[drive]', n, Math.round(performance.now() - t0), 'ms');
  msg.textContent = 'Building the island';
  await new Promise(r => setTimeout(r, 30));
  W = makeWorld(); EV = makeEvents(W); lap('world');
  msg.textContent = 'Unpacking models';
  await loadModels(f => { msg.textContent = `Unpacking models ${Math.round(f * 100)}%`; });
  lap('models');
  msg.textContent = 'Planting trees';
  await new Promise(r => setTimeout(r, 30));
  const root = new THREE.Group(); scene.add(root);
  buildTerrain(root); lap('terrain'); buildWorld(root); lap('instances'); buildProps(); buildEvents(); buildTrain(); lap('props+events');
  scene.add(skidMesh);
  drawMapImage(); lap('map');
  if (!unlocked(save.car)) save.car = 'sedan-sports';
  car = makeCar(W, W.spawn, save.car, setupOf(save.car));
  carMesh = carModel(car.model);
  camMode = save.cam || 0;
  camPos.set(car.x - car.hx * 10, car.y + 5, car.z - car.hz * 10); camAt.set(car.x, car.y, car.z);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  uiHeads(); uiCredits(0); setupTouch();
  if (!save.helped) $('help').hidden = false;
  $('load').classList.add('gone');
  readLink(); online();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__drive = { scene, renderer, THREE, get car() { return car; }, get mode() { return mode; }, keys, begin: id => begin(EV.list.find(e => e.id === id)), get W() { return W; }, cam: v => { camMode = v; },
  // test hook: put the car just before gate n of the running event, moving through it
  go() { countT = 3; return 1; },
  toGate(n) { gate.gi = n; gate.prev = undefined; const g = active.gates[n]; Object.assign(car, { x: g[0] - g[2] * 5, z: g[1] - g[3] * 5, hx: g[2], hz: g[3], vx: g[2] * 20, vz: g[3] * 20 }); return n; } };
start();
