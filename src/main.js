import * as THREE from 'three';
import './atmosphere/heightFog.js';
import { generateCityData, buildCityMeshes } from './world/city.js';
import { DISTRICTS, districtAt } from './world/districts.js';
import { createSigns } from './world/signs.js';
import { createTraffic } from './world/traffic.js';
import { createHolograms } from './world/holograms.js';
import { createTrains } from './world/trains.js';
import { createKit } from './world/kit.js';
import { createRain } from './fx/rain.js';
import { createSplashes } from './fx/splashes.js';
import { createSteam, createSparks } from './fx/particles.js';
import { createFlares } from './fx/flares.js';
import { createPost } from './core/postfx.js';
import { input } from './core/input.js';
import { Car } from './car/car.js';
import { CameraRig } from './car/cameras.js';
import { Windshield } from './car/windshield.js';
import { Weather, WEATHER } from './atmosphere/weather.js';
import { createSky } from './atmosphere/sky.js';
import { createAudio } from './audio/audio.js';
import { createMusic } from './audio/music.js';
import { loadLibrary } from './audio/library.js';
import { STATIONS, PLAYLIST_ID, PLAYLIST_NAME } from './audio/playlist.js';
import { createRadio } from './ui/radio.js';
import { createDrawer, slider, select, check, button } from './ui/drawer.js';
import { choosePads, clearPadRoofs, makePadMesh } from './world/pads.js';
import { createCityLights } from './world/lights.js';
import { createFireworks } from './fx/fireworks.js';
import { createAutopilot } from './car/autopilot.js';
import { createSanctuary } from './ui/sanctuary.js';
import { createBuilder } from './ui/builder.js';
import { createMap } from './ui/map.js';
import { createGarage } from './ui/garage.js';
import { createPhoto } from './ui/photo.js';
import { cityLogHTML } from './ui/citylog.js';
import { chooseFragments, choosePhotoSpots, createFragments, inShot, LORE } from './world/fragments.js';
import { load, store, exportSave, importSave, resetAll } from './core/save.js';
import { bindings, saveBindings, resetBindings } from './core/input.js';

const seed = Number(new URLSearchParams(location.search).get('seed')) || 2049;
const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// Graphics presets: render resolution, rain density, how often the reflection cube refreshes (frames; 0 = once).
const GFX = {
  low: { label: 'Low', pr: 0.75, rain: 0.35, env: 0 },
  medium: { label: 'Medium', pr: 1, rain: 0.65, env: 60 },
  high: { label: 'High', pr: 1.5, rain: 1, env: 24 },
  ultra: { label: 'Ultra', pr: 2, rain: 1, env: 8 },
};
const prefs = { gfx: 'high', ...load('nd.settings', {}) };
if (!GFX[prefs.gfx]) prefs.gfx = 'high';renderer.setPixelRatio(Math.min(devicePixelRatio, GFX[prefs.gfx].pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a1420, 0.0042);
const hemi = new THREE.HemisphereLight(0x5a74a8, 0x1a1020, 2.2);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8fa8ff, 0.9);
moon.position.set(-300, 500, 200);
scene.add(moon);

const weather = new Weather('steady');
const sky = createSky(scene, hemi);

// ---- World ----
const city = generateCityData(seed);
const pads = choosePads(city);
clearPadRoofs(city, pads); // before anything builds roof props
const cityMeshes = buildCityMeshes(city);
// Shared by every animated thing; uPulse is driven by the music's bass in Phase 4.
const worldU = { uTime: cityMeshes.uniforms.uTime, uPulse: { value: 0 }, uScale: { value: 400 } };
const signs = createSigns(city.signs, worldU);
const traffic = createTraffic(340, seed, city);
const holos = createHolograms(city, worldU);
const trains = createTrains();
const steam = createSteam(city.vents, worldU);
const sparks = createSparks(city.sparks, worldU);
const kit = createKit(city.clutter);
scene.add(cityMeshes.group, signs, traffic.group, holos.group, trains.group, steam, sparks, kit.group);
for (const p of pads) scene.add(makePadMesh(p));
const lights = createCityLights(city, cityMeshes, signs);
const fireworks = createFireworks(worldU);
scene.add(fireworks.object);

const flareSources = city.signs.filter((s) => s.big).sort((a, b) => b.y - a.y).slice(0, 6).map((s) => {
  const m = Math.max(...s.color);
  return { x: s.x + s.nx * 2, y: s.y, z: s.z + s.nz * 2, color: s.color.map((c) => (c / m) * 0.3) };
});
const flares = createFlares(flareSources, city);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2200);
const car = new Car();
const windshield = new Windshield();
car.group.add(windshield.mesh); // fallback flat pane; the Blender car puts the drops on its real glass instead
car.onModel = () => {
  if (!car.drops) return;
  car.drops.material = windshield.mesh.material;
  car.drops.renderOrder = 2;
  windshield.onGlass = true;
};
scene.add(car.group);
const rig = new CameraRig(camera, car, canvas, city);
const autopilot = createAutopilot(city);

const rain = createRain(9000);
const splashes = createSplashes(500, city);
scene.add(rain.object, splashes.object);

// Wet reflections: a low-res cube map of the city around the camera. Its six faces are rendered one per
// frame instead of all six in one frame (that was a full-city render ×6 spike every 20 frames).
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(1, 1500, cubeRT);
scene.environmentIntensity = 0.7;
const envHide = () => [rain.object, splashes.object, car.group, steam, sparks, fireworks.object];
function updateEnv() { // all six faces at once: first frame, and the Low preset's single capture
  const hide = envHide();
  hide.forEach((o) => (o.visible = false));
  scene.environment = null; // a texture can't be sampled while it's being rendered into
  cubeCam.position.copy(camera.position);
  cubeCam.update(renderer, scene);
  scene.environment = cubeRT.texture;
  hide.forEach((o) => (o.visible = true));
}
let envFace = 6, envWait = 0;
function stepEnv() {
  const every = GFX[prefs.gfx].env;
  if (envFace >= 6) {
    if (!every || ++envWait < every) return;
    envWait = 0; envFace = 0;
    cubeCam.position.copy(camera.position);
    cubeCam.updateMatrixWorld();
  }
  // Reflections off while capturing: otherwise each capture reflects the last one, and a single bad pixel
  // (overflow/NaN) feeds back forever and spreads through bloom into a permanently black screen.
  const hide = envHide(), prev = renderer.getRenderTarget();
  hide.forEach((o) => (o.visible = false));
  scene.environment = null;
  renderer.setRenderTarget(cubeRT, envFace);
  renderer.render(scene, cubeCam.children[envFace]);
  renderer.setRenderTarget(prev);
  scene.environment = cubeRT.texture;
  hide.forEach((o) => (o.visible = true));
  if (++envFace === 6) cubeRT.texture.needsPMREMUpdate = true;
}

const post = createPost(renderer, scene, camera);
rain.setDensity(GFX[prefs.gfx].rain);
function setGraphics(k) {
  prefs.gfx = k;
  store('nd.settings', prefs);
  renderer.setPixelRatio(Math.min(devicePixelRatio, GFX[k].pr));
  renderer.setSize(innerWidth, innerHeight);
  post.composer.setPixelRatio(renderer.getPixelRatio());
  post.setSize(innerWidth, innerHeight);
  rain.setDensity(GFX[k].rain);
  updateEnv();
}

// ---- Progress: memory fragments, photo spots, places docked (per seed) ----
const progKey = `nd.progress.${seed}`, rawProg = load(progKey, {});
const ids = (a, n) => new Set((Array.isArray(a) ? a : []).filter((i) => Number.isInteger(i) && i >= 0 && i < n));
const fragList = chooseFragments(city), spots = choosePhotoSpots(city);
const prog = {
  fragments: ids(rawProg.fragments, fragList.length), photos: ids(rawProg.photos, spots.length),
  docked: new Set((Array.isArray(rawProg.docked) ? rawProg.docked : []).filter((s) => typeof s === 'string').slice(0, 64)),
};
const saveProg = () => store(progKey, { fragments: [...prog.fragments], photos: [...prog.photos], docked: [...prog.docked] });
const frags = createFragments(fragList, prog.fragments);
scene.add(frags.group);

let audio = null, music = null, radio = null;
weather.onThunder = (delay, strength) => audio?.thunder(delay, strength);
const camLocal = new THREE.Vector3();
function onPass(npc) {
  camLocal.copy(npc.pos).applyMatrix4(camera.matrixWorldInverse);
  audio?.whoosh(camLocal.x / 20, Math.min(1, (npc.speed + car.speed) / 60));
}

// ---- UI ----
const hud = {
  root: document.getElementById('hud'),
  spd: document.getElementById('spd'),
  alt: document.getElementById('alt'),
  cam: document.getElementById('cam'),
  wx: document.getElementById('wx'),
  fps: document.getElementById('fps'),
  district: document.getElementById('district'),
  status: document.getElementById('status'),
  toast: document.getElementById('toast'),
};
let toastT = 0;
function toast(kicker, text) {
  hud.toast.querySelector('.k').textContent = kicker;
  hud.toast.querySelector('.v').textContent = text;
  hud.toast.classList.add('show');
  toastT = 5;
}
const WIPER = ['WIPERS OFF', 'WIPERS INT', 'WIPERS LOW', 'WIPERS HIGH'];

const drawer = createDrawer();
const director = drawer.addTab('City Director');
director.append(Object.assign(document.createElement('h3'), { textContent: 'WEATHER' }));
const wxSelect = select(director, 'Weather',
  [['auto', 'Auto (drifting)'], ...Object.entries(WEATHER).map(([k, v]) => [k, v.name])], 'auto',
  (v) => { weather.auto = v === 'auto'; if (v !== 'auto') weather.set(v); });
button(director, 'Lightning strike', () => weather.strike(1));
director.append(Object.assign(document.createElement('h3'), { textContent: 'EVENTS' }));
let blackoutD = 0, surgeT = 0;
const blackoutSel = select(director, 'District', DISTRICTS.map((d, i) => [String(i), d.name]), '0', (v) => (blackoutD = Number(v)));
button(director, 'Blackout', () => lights.blackout(blackoutD));
button(director, 'Traffic surge (2 min)', () => (surgeT = 120));
check(director, 'Festival night', false, (v) => { fireworks.target = v ? 1 : 0; holos.festival.visible = v; });
director.append(Object.assign(document.createElement('h3'), { textContent: 'TIME' }));
const timeSlider = slider(director, 'Night ↔ pre-dawn', { min: 0, max: 0.999, step: 0.001, value: sky.t }, (v) => (sky.t = v));
check(director, 'Slow time cycle (20 min)', sky.cycle, (v) => (sky.cycle = v));
director.append(Object.assign(document.createElement('h3'), { textContent: 'WORLD SEED' }));
const seedIn = Object.assign(document.createElement('input'), { type: 'number', value: seed, className: 'name' });
director.append(seedIn);
let reloading = false;
const reseed = (v) => { reloading = true; location.search = `?seed=${Math.max(1, Math.floor(Math.abs(v))) || 1}`; };
button(director, 'Rebuild city', () => reseed(Number(seedIn.value)));
button(director, 'Random seed', () => reseed(Math.floor(Math.random() * 99999) + 1));

const builder = createBuilder({ scene, camera, city, pads, lights, uniforms: worldU });
builder.fillTab(drawer.addTab('World Builder'));
const mapTab = drawer.addTab('Map');
mapTab.append(Object.assign(document.createElement('h3'), { textContent: 'AUTOPILOT (T) · CLICK A PAD' }));
const map = createMap(mapTab, { seed, pads, car, onPick: (p) => { autopilot.start(p, car); drawer.toggle(); } });

const radioTab = drawer.addTab('Radio');
radioTab.append(Object.assign(document.createElement('h3'), { textContent: 'TUNE IN' }));
for (const s of [{ id: PLAYLIST_ID, name: PLAYLIST_NAME }, ...STATIONS]) button(radioTab, s.name, () => music?.setSource(s.id));
radioTab.append(Object.assign(document.createElement('h3'), { textContent: 'PLAYER' }));
button(radioTab, 'Open full player (R)', () => { drawer.toggle(); radio?.toggle(); });

const trafficLabel = (k) => (k < 0.4 ? 'Light' : k < 1 ? 'Moderate' : k < 1.6 ? 'Busy' : 'Gridlocked sky');
function cityInfo() {
  const D = DISTRICTS[Math.max(0, districtIdx)];
  return { clock: gameClock(), weather: weather.name, district: D, traffic: trafficLabel(D.traffic * (surgeT > 0 ? 2 : 1)), nowPlaying: car.nowPlaying };
}
const logHTML = () => cityLogHTML(cityInfo(), prog, spots, [...prog.docked]);
const logTab = drawer.addTab('City Log');
const sanct = createSanctuary({
  scene, camera, city, uniforms: worldU, get audio() { return audio; }, getInfo: cityInfo, logHTML, visited: prog.docked,
});
sanct.onExit = () => music?.setRoom(false);
createGarage(drawer.addTab('Garage'), car);
const photo = createPhoto({ camera, renderer, scene, post, input, canvas, car });

// ---- Settings: graphics, save file, controls ----
const settings = drawer.addTab('Settings');
settings.append(Object.assign(document.createElement('h3'), { textContent: 'GRAPHICS' }));
select(settings, 'Preset', Object.entries(GFX).map(([k, v]) => [k, v.label]), prefs.gfx, setGraphics);
settings.append(Object.assign(document.createElement('p'), { className: 'dim', textContent: 'Volumes live in the radio player (R).' }));
settings.append(Object.assign(document.createElement('h3'), { textContent: 'SAVE' }));
settings.append(Object.assign(document.createElement('p'), { className: 'dim', textContent: 'Everything autosaves in this browser. Export to back it up or move it; music files are not included.' }));
button(settings, 'Export save', exportSave);
const fileIn = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
fileIn.onchange = async () => {
  const f = fileIn.files[0];
  if (!f) return;
  try { await importSave(f); reloading = true; location.reload(); } catch (err) { alert(`Import failed: ${err.message}`); }
  fileIn.value = '';
};
settings.append(fileIn);
button(settings, 'Import save…', () => fileIn.click());
button(settings, 'Reset everything', () => {
  if (!confirm('Erase your car, world edits, progress, playlist edits and settings? Music files stay.')) return;
  resetAll(); reloading = true; location.reload();
});
settings.append(Object.assign(document.createElement('h3'), { textContent: 'CONTROLS' }));
const padLine = Object.assign(document.createElement('p'), { className: 'dim' });
settings.append(padLine);
const ACTIONS = {
  forward: 'Thrust', back: 'Reverse', left: 'Turn left', right: 'Turn right', up: 'Climb', down: 'Descend', strafeL: 'Strafe left',
  strafeR: 'Strafe right', boost: 'Boost', camera: 'Camera', wipers: 'Wipers', autopilot: 'Autopilot', dock: 'Land / leave',
  builder: 'Builder', place: 'Place', map: 'Map', photo: 'Photo mode', radio: 'Radio', next: 'Next track', hud: 'Hide HUD',
};
const KEY_NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ControlLeft: 'Ctrl', ControlRight: 'Ctrl' };
const keyName = (c) => KEY_NAMES[c] ?? c.replace(/^(Key|Digit)/, '').replace(/^(Shift|Alt|Meta)(Left|Right)$/, '$1');
let rebinding = null;
const bindBtns = {};
for (const [a, label] of Object.entries(ACTIONS)) {
  const row = Object.assign(document.createElement('div'), { className: 'bind' });
  row.append(Object.assign(document.createElement('span'), { textContent: label }));
  const b = Object.assign(document.createElement('button'), { className: 'act' });
  b.onclick = () => { rebinding = a; b.textContent = 'press a key…'; b.classList.add('wait'); };
  bindBtns[a] = b;
  row.append(b);
  settings.append(row);
}
const showBinds = () => { for (const [a, b] of Object.entries(bindBtns)) { b.textContent = [...new Set(bindings[a].map(keyName))].join(' / '); b.classList.remove('wait'); } };
showBinds();
button(settings, 'Reset controls', () => { resetBindings(); showBinds(); });
// Capture phase, so the key being bound never reaches the game.
addEventListener('keydown', (e) => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape') { bindings[rebinding] = [e.code]; saveBindings(); }
  rebinding = null;
  showBinds();
}, true);

// In-game clock for the DJ: deep night ≈ 1:00 AM, pre-dawn haze ≈ 5:30 AM.
function gameClock() {
  const mins = Math.floor(60 + sky.dawn * 270);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} AM`;
}

let started = false;
document.getElementById('title').addEventListener('click', async (e) => {
  e.currentTarget.classList.add('gone');
  hud.root.classList.remove('hidden');
  started = true;
  try { audio = createAudio(); audio.resume(); } catch (err) { console.warn('Audio unavailable', err); return; } // never block play on audio
  music = createMusic(audio, (id) => radio.resolveQueue(id));
  await loadLibrary();
  radio = createRadio({
    audio, music, car,
    getInfo: () => ({ clock: gameClock(), weather: weather.name, district: DISTRICTS[districtIdx]?.name ?? 'the city' }),
  });
  radio.start();
});
// Ctrl is "descend"; guard against Ctrl+W closing the tab mid-flight.
const desktop = navigator.userAgent.includes('Electron');
// In the browser, guard against Ctrl+W mid-flight. The desktop app has no Ctrl+W, and the guard would block quitting.
addEventListener('beforeunload', (e) => { if (started && !reloading && !desktop) e.preventDefault(); });
if (desktop) button(settings, 'Quit game', () => window.close());
// CC-BY requires this credit in-game; everything else in CREDITS.md is CC0/OFL.
settings.insertAdjacentHTML('beforeend', '<p class="credits">Rain-on-window sound: "Rain on Window Loop" by alxl (CC-BY 4.0). Models, textures and sounds: Kenney, Poly Haven, Quaternius, ambientCG, Ylmir, WuxiaScrub (CC0).</p>');
addEventListener('click', (e) => { if (e.target.closest?.('button')) audio?.click(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
updateEnv();

// District tracking: banner on entry, fog tint eases toward the district's haze.
let districtIdx = -1, bannerT = 0;
const tint = [0, 0, 0];
function updateDistrict(dt) {
  const di = districtAt(car.pos.x, car.pos.z, seed);
  if (di !== districtIdx) {
    districtIdx = di;
    const D = DISTRICTS[di];
    car.districtName = D.name;
    hud.district.querySelector('.name').textContent = D.name.toUpperCase();
    hud.district.querySelector('.flav').textContent = D.flavour;
    if (started) { hud.district.classList.add('show'); bannerT = 5; }
  }
  if (bannerT > 0 && (bannerT -= dt) <= 0) hud.district.classList.remove('show');
  const k = Math.min(1, dt * 0.4);
  DISTRICTS[di].fog.forEach((v, i) => (tint[i] += (v - tint[i]) * k));
}

const idle = { axis: () => 0, held: () => false };
const clock = new THREE.Clock();
let time = 0, frames = 0, fpsT = 0, frameNo = 0, autoCine = null;
const FLY = ['forward', 'back', 'left', 'right', 'up', 'down', 'strafeL', 'strafeR'];

// Nearest pad you could land on: close by and not far above it.
function padInReach() {
  let best = null, bd = 45;
  for (const p of pads) {
    const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z), dy = car.pos.y - p.y;
    if (d < bd && dy > -3 && dy < 70) { bd = d; best = p; }
  }
  return best;
}
function dockAt(p) {
  sanct.enter(p);
  prog.docked.add(p.name); saveProg();
  music?.setRoom(true);
  if (builder.active) builder.toggle();
}
function takePhoto() {
  photo.capture(() => post.render(time));
  const got = spots.map((s, i) => i).filter((i) => !prog.photos.has(i) && inShot(camera, spots[i]));
  got.forEach((i) => prog.photos.add(i));
  if (got.length) { saveProg(); photo.say(`Photo spot logged: ${got.map((i) => spots[i].name).join(', ')}`); }
  else photo.say('Saved.');
}
photo.onShot = takePhoto; // the panel's Save PNG button

function frame(fixedDt) {
  const dt = fixedDt ?? Math.min(clock.getDelta(), 0.05);
  input.poll();

  // Photo mode: the world holds still (time doesn't advance); only the free camera moves.
  if (photo.active) {
    if (input.pressed('photo') || input.pressed('menu')) photo.exit();
    else if (input.pressed('place')) takePhoto();
    photo.update(dt);
    post.render(time);
    flares.render(renderer, camera, 0, scene.fog.density);
    input.endFrame();
    return;
  }
  time += dt;

  // Idle on autopilot for 30 s: the cinematic camera takes over until you touch anything.
  if (autoCine && input.idle < 0.5) { rig.setMode(autoCine); autoCine = null; hud.cam.textContent = `${rig.mode.toUpperCase()} CAM`; }
  if (autopilot.on && !autoCine && rig.mode !== 'cinematic' && input.idle > 30 && !sanct.active) {
    autoCine = rig.mode; rig.setMode('cinematic'); hud.cam.textContent = 'CINEMATIC CAM';
  }
  const nearPad = !autopilot.on && !sanct.active ? padInReach() : null;
  if (started && input.pressed('photo') && !drawer.open && !radio?.open) { photo.enter(); input.endFrame(); return; }
  if (started && sanct.active) {
    if (input.pressed('dock')) sanct.exit();
  } else if (started) {
    if (input.pressed('camera')) hud.cam.textContent = `${rig.cycle().toUpperCase()} CAM`;
    if (input.pressed('autopilot')) { if (autopilot.on) autopilot.stop(); else autopilot.start(null, car); }
    if (input.pressed('builder')) builder.toggle();
    if (input.pressed('place') && builder.active) builder.place();
    if (input.pressed('dock') && nearPad) autopilot.start(nearPad, car); // the autopilot does the landing
    if (input.pressed('map')) { if (!drawer.open) drawer.toggle(); drawer.show('Map'); map.renderList(); }
  }
  if (started) {
    if (input.pressed('hud')) hud.root.classList.toggle('hidden');
    if (input.pressed('wipers')) windshield.cycle();
    if (input.pressed('menu')) { if (radio?.open) radio.toggle(); else { drawer.toggle(); if (drawer.open) { map.renderList(); logTab.innerHTML = logHTML(); } } }
    if (input.pressed('radio')) radio?.toggle();
    if (input.pressed('next')) music?.next(true);
  }
  const manual = started && !drawer.open && !radio?.open && !sanct.active;
  if (autopilot.on && manual && FLY.some((a) => input.held(a))) autopilot.stop(); // touching the controls takes over
  if (autopilot.update(dt, car) === 'docked') dockAt(autopilot.dest);
  if (!sanct.active) {
    const got = frags.update(time, car.pos);
    if (got >= 0) {
      prog.fragments.add(got); saveProg(); audio?.chime();
      toast(`MEMORY FRAGMENT ${prog.fragments.size}/${LORE.length}`, LORE[got][0]);
    }
  }
  if (toastT > 0 && (toastT -= dt) <= 0) hud.toast.classList.remove('show');
  car.update(dt, autopilot.on ? autopilot.input : manual ? input : idle, city);
  sanct.update(dt, weather.p.rain * (1 - weather.p.flake * 0.7));
  if (!sanct.active) rig.update(dt);
  updateDistrict(dt);

  weather.update(dt);
  sky.update(dt, weather, cityMeshes.uniforms, tint);
  const w = weather.p;
  cityMeshes.uniforms.uTime.value = time;
  cityMeshes.uniforms.uRain.value = w.rain * (1 - w.flake);
  worldU.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

  rain.update(time, camera.position, car.vel, w);
  splashes.update(dt, camera, w.rain * (1 - w.flake), renderer.domElement.height);
  windshield.update(dt, w.rain * (1 - w.flake * 0.7), car.speed);
  windshield.mesh.visible = !windshield.onGlass && rig.mode === 'cockpit' && !sanct.active;
  car.setWipers(windshield.angle);
  if (surgeT > 0) surgeT -= dt;
  traffic.update(dt, time, camera.position, (1 - sky.dawn * 0.35) * (surgeT > 0 ? 2.2 : 1), onPass);
  holos.update(time, dt);
  lights.update(dt);
  builder.update(time);
  fireworks.update(dt, time, (x, y, z) => {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    audio?.firework(d / 340, Math.min(0.6, 260 / d));
  });
  trains.update(time);
  kit.update(dt, camera.position);
  if (music) {
    music.update(dt);
    worldU.uPulse.value = music.pulse; // neon signs + holograms throb with the bass
    car.eq = music.freq;
  }
  radio?.update(dt);
  audio?.update(dt, {
    rain: w.rain, flake: w.flake, speed: car.speed, cockpit: rig.mode === 'cockpit' || sanct.active,
    thrust: sanct.active ? 0 : (autopilot.on ? autopilot.input : input).axis('forward', 'back'), district: DISTRICTS[districtIdx].id, alt: car.pos.y,
    tone: car.look.engine,
  });

  frameNo++;
  stepEnv();
  post.render(time);
  flares.render(renderer, camera, dt, scene.fog.density);
  input.endFrame();

  frames++; fpsT += dt;
  if (fpsT > 0.5) {
    hud.fps.textContent = `${Math.round(frames / fpsT)} fps`;
    hud.spd.textContent = Math.round(car.speed * 3.6);
    hud.alt.textContent = Math.round(car.pos.y);
    hud.wx.textContent = `${DISTRICTS[districtIdx].name} · ${weather.name}${weather.auto ? ' (auto)' : ''} · ${sky.label()} · ${WIPER[windshield.mode]}`;
    if (sky.cycle) timeSlider.value = sky.t;
    if (document.activeElement !== wxSelect) wxSelect.value = weather.auto ? 'auto' : weather.key;
    hud.status.textContent = sanct.active ? ''
      : autopilot.on ? `AUTOPILOT · ${autopilot.label}${autopilot.state === 'landing' ? ' · landing' : ''} · T or any flight key takes over`
      : nearPad ? `G · LAND AT ${nearPad.name.toUpperCase()}`
      : surgeT > 0 ? `TRAFFIC SURGE · ${Math.ceil(surgeT)} s` : lights.blackedOut ? 'BLACKOUT · power returning block by block' : '';
    if (drawer.open) { map.draw(); if (!logTab.hidden) logTab.innerHTML = logHTML(); }
    padLine.textContent = input.gamepad ? `Gamepad: ${input.gamepad.slice(0, 40)}` : 'No gamepad connected (press a button on it to wake it).';
    [...blackoutSel.options].forEach((o, i) => (o.textContent = DISTRICTS[i].name));
    frames = 0; fpsT = 0;
  }
}
renderer.setAnimationLoop(() => frame());

// Debug handle; step() advances frames with a fixed dt (handy when the tab is hidden and rAF is paused).
window.__nd = {
  car, rig, city, renderer, weather, sky, windshield, traffic, camera, worldU, scene,
  pads, autopilot, sanct, builder, lights, fireworks, holos, dockAt, photo, prog, fragList, spots, post, setGraphics, cubeRT,
  get audio() { return audio; }, get music() { return music; }, get radio() { return radio; },
  step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); },
};
