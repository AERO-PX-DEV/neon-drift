import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveCollision, HALF } from '../world/city.js';

// Blender model (blender/car.blend → public/models/car.glb). Material names map to game materials;
// emissive parts become HDR so bloom catches them. If the file is missing, the procedural car stays.
const GLOW = { HeadLight: [7, 7, 6.2], TailLight: [7, 0.25, 0.35], Neon: [0.4, 3.4, 4.2], Thruster: [0.4, 1.6, 4], InteriorGlow: [0.8, 0.34, 0.12] }; // cabin glow stays below bloom: cozy, not glare
// Blender nodes that make up the outside of the coupe; everything else (seats, dash, yoke...) is the cockpit,
// which the cab and cruiser shells reuse so every body keeps the detailed interior.
const EXTERIOR = /^X_/; // Blender naming: X_ = bodywork (hidden under the cab/cruiser shells), the rest is cockpit
const UP = new THREE.Vector3(0, 1, 0); // Blender's local Z (wiper pivot, steering axis) is local +Y after glTF export
function loadModel(car, g, fallback, screen) {
  new GLTFLoader().load(`${import.meta.env.BASE_URL}models/car.glb`, (gltf) => {
    car.exterior = [];
    gltf.scene.traverse((o) => {
      if (o.parent === gltf.scene && EXTERIOR.test(o.name)) car.exterior.push(o);
      if (!o.isMesh) return;
      const name = o.material.name;
      if (name === 'Paint') o.material = car.mats.paint;
      else if (o.name === 'TrinketCharm') o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.75, 0.95) }); // inches from your eyes: no bloom
      else if (name === 'Neon') o.material = car.mats.neon;
      else if (name === 'InteriorGlow') o.material = car.mats.interior;
      else if (GLOW[name]) o.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...GLOW[name]) });
      else if (name === 'Glass') Object.assign(o.material, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
      else if (name === 'DashScreen') o.material = screen.material;
      if (o.name === 'Trinket') car.trinket = o;
    });
    const find = (n) => gltf.scene.getObjectByName(n);
    if (find('Eye')) car.eye = find('Eye').position.clone();
    car.wipers = ['X_WiperL', 'X_WiperR'].map(find).filter(Boolean);
    car.yoke = find('Yoke') ?? null;
    for (const o of [...car.wipers, car.yoke]) if (o) o.userData.q0 = o.quaternion.clone();
    car.drops = find('X_Drops') ?? null;
    g.remove(fallback, screen);
    g.add(gltf.scene);
    car.onModel?.();
    car.fallback = null;
    car.applyShape();
  }, undefined, (err) => console.warn('car.glb unavailable, using the procedural car', err));
}

// Procedural shells for the other two body shapes. Boxes are single-sided, so from the driver's seat the
// shell is invisible and the Blender cockpit shows through.
function shell(kind, m) {
  const g = new THREE.Group();
  const add = (w, h, d, mat, x, y, z) => g.add(box(w, h, d, mat, x, y, z));
  const cab = kind === 'cab';
  const W = cab ? 2.5 : 2.9, L = cab ? 4.8 : 6.2;
  if (cab) {
    add(W, 0.8, L, m.paint, 0, 0.05, 0); // hood stays below the driver's eye line
    add(2.4, 0.9, 3.0, m.glass, 0, 0.9, 0.2);
    add(W, 0.12, 3.1, m.paint, 0, 1.42, 0.2);
    for (const [x, z] of [[-1.17, -1.25], [1.17, -1.25], [-1.17, 1.65], [1.17, 1.65]]) add(0.1, 0.75, 0.1, m.dark, x, 1.0, z);
    add(0.8, 0.18, 0.35, m.neon, 0, 1.57, 0.4); // roof light
    add(W + 0.1, 0.25, 0.3, m.dark, 0, -0.25, -L / 2);
  } else {
    add(W, 0.75, L, m.paint, 0, 0.02, 0);
    add(2.6, 0.5, 1.0, m.paint, 0, -0.05, -L / 2 - 0.4);
    add(2.3, 0.8, 2.6, m.glass, 0, 0.8, 0.1);
    add(2.5, 0.1, 2.2, m.paint, 0, 1.24, 0.55);
    for (const x of [-1.25, 1.25]) add(0.12, 0.65, 1.3, m.dark, x, 0.75, L / 2 - 0.6); // tail fins
  }
  const nose = cab ? -L / 2 - 0.01 : -L / 2 - 0.91;
  add(W - 0.4, 0.12, 0.06, m.head, 0, cab ? 0.3 : 0.0, nose);
  add(W - 0.2, 0.12, 0.06, m.tail, 0, 0.35, L / 2 + 0.01);
  for (const sx of [-1, 1]) add(0.04, 0.06, L - 0.6, m.neon, sx * (W / 2 + 0.02), 0.05, 0);
  const pr = cab ? 0.5 : 0.62;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr + 0.1, 0.4, 16), m.dark);
    pod.position.set(x * (W / 2 + 0.05), -0.45, z * (L / 2 - 1));
    const thr = new THREE.Mesh(new THREE.CircleGeometry(pr - 0.05, 16), m.thruster);
    thr.rotation.x = Math.PI / 2;
    thr.position.set(pod.position.x, -0.66, pod.position.z);
    g.add(pod, thr);
  }
  g.visible = false;
  return g;
}

const _q = new THREE.Quaternion();
export const FINISHES = {
  gloss: { metalness: 0.85, roughness: 0.22, clearcoat: 1, iridescence: 0 },
  matte: { metalness: 0.15, roughness: 0.8, clearcoat: 0, iridescence: 0 },
  iridescent: { metalness: 0.9, roughness: 0.2, clearcoat: 1, iridescence: 1 },
};
export const DASH_THEMES = {
  cyan: { bg: '#05080d', big: '#5ff', unit: '#9cf', alt: '#7df', warn: '#f65', text: '#7bd', music: '#cef', eqA: '#f65', eqB: '#3cf' },
  red: { bg: '#0d0505', big: '#ff6a5a', unit: '#f99', alt: '#fa8', warn: '#fff', text: '#d88', music: '#fcc', eqA: '#fff', eqB: '#f54' },
  mono: { bg: '#070708', big: '#eee', unit: '#aaa', alt: '#ccc', warn: '#fff', text: '#999', music: '#ddd', eqA: '#fff', eqB: '#888' },
  amber: { bg: '#0b0703', big: '#ffb347', unit: '#d9a066', alt: '#ffc27a', warn: '#ff5a3c', text: '#c98', music: '#fd9', eqA: '#ff5a3c', eqB: '#ffb347' },
};
export const DEFAULT_LOOK = { name: 'RSQ-7', body: 'coupe', paint: '#adb2b8', finish: 'gloss', underglow: '#1ad9ff', interior: '#ff8a3c', dash: 'cyan', engine: 1 };
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k); // Color() already converts the sRGB hex to linear

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

function buildModel() {
  const root = new THREE.Group();
  const g = new THREE.Group(); // procedural fallback body
  root.add(g);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xadb2b8, metalness: 0.85, roughness: 0.22, clearcoat: 1, iridescenceIOR: 1.8 });
  const neon = glow(0.4, 3.4, 4.2), interior = glow(0.8, 0.34, 0.12);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f14, metalness: 0.5, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1520, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });

  g.add(box(2.4, 0.6, 5.2, paint, 0, 0, 0));
  g.add(box(2.2, 0.35, 1.0, paint, 0, -0.08, -3.0));
  g.add(box(2.0, 0.9, 2.5, glass, 0, 0.75, 0.15));
  g.add(box(2.0, 0.08, 1.3, paint, 0, 1.2, 0.75)); // roof sits behind the driver's head; windshield stays clear
  g.add(box(2.0, 0.12, 0.06, glow(7, 7, 6.2), 0, -0.06, -3.52)); // headlight bar: tucked below the nose line so it doesn't glare in cockpit view
  g.add(box(2.3, 0.12, 0.06, glow(7, 0.25, 0.35), 0, 0.12, 2.62)); // taillight bar
  for (const s of [-1, 1]) g.add(box(0.04, 0.06, 4.6, neon, s * 1.22, 0.05, 0)); // side neon
  for (const [x, z] of [[-1.25, -1.9], [1.25, -1.9], [-1.25, 1.9], [1.25, 1.9]]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 16), dark);
    pod.position.set(x, -0.35, z);
    g.add(pod);
    const thr = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), glow(0.4, 1.6, 4));
    thr.rotation.x = Math.PI / 2;
    thr.position.set(x, -0.53, z);
    g.add(thr);
  }
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 1.3), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  under.rotation.x = Math.PI / 2;
  under.position.y = -0.6;
  g.add(under);

  // Cockpit interior.
  g.add(box(1.9, 0.22, 0.5, dark, 0, 0.48, -1.1));
  for (const s of [-1, 1]) {
    const pillar = box(0.08, 0.95, 0.08, dark, s * 0.95, 0.75, -1.05);
    pillar.rotation.x = -0.35;
    g.add(pillar);
  }
  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 256; dashCanvas.height = 96;
  const dashTex = new THREE.CanvasTexture(dashCanvas);
  dashTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: dashTex, color: new THREE.Color(1.4, 1.4, 1.4) }));
  screen.position.set(0, 0.6, -0.95);
  screen.rotation.x = -0.9;
  root.add(screen);
  root.add(under); // underglow belongs to both car versions (reparented out of the fallback body)

  const cabinLight = new THREE.PointLight(0xff8a3c, 0.6, 3, 2); // warm cozy cabin glow
  cabinLight.position.set(0, 0.9, 0);
  root.add(cabinLight);

  const head = new THREE.SpotLight(0xfff1dc, 900, 180, 0.38, 0.6, 1.4);
  head.position.set(0, 0, -2.7);
  head.target.position.set(0, -4, -40);
  root.add(head, head.target);

  const mats = { paint, dark, glass, neon, interior, under: under.material, cabinLight, head: glow(7, 7, 6.2), tail: glow(7, 0.25, 0.35), thruster: glow(0.4, 1.6, 4) };
  const shells = { cab: shell('cab', mats), cruiser: shell('cruiser', mats) };
  root.add(shells.cab, shells.cruiser);
  return { root, g, screen, dashCanvas, dashTex, mats, shells, under };
}

// Flight model, kept DOM-free so tests can fly it. body = { pos, vel (Vector3), yaw, yawRate }.
export function fly(body, inp, dt, city) {
  const t = inp.axis('forward', 'back');
  const turn = inp.axis('left', 'right');
  const lift = inp.axis('up', 'down');
  const str = inp.axis('strafeR', 'strafeL');
  const boost = inp.held('boost') && t > 0;

  // Steering answers quickly and eases off a little at speed so it stays stable.
  const hs = Math.hypot(body.vel.x, body.vel.z);
  body.yawRate += (turn * (1.5 - Math.min(0.55, hs / 110)) - body.yawRate) * Math.min(1, dt * 6);
  body.yaw += body.yawRate * dt;
  const s = Math.sin(body.yaw), c = Math.cos(body.yaw);
  // Work in the car's frame: low drag along the nose, strong grip sideways, so it goes where it points.
  let fwd = -s * body.vel.x - c * body.vel.z, lat = c * body.vel.x - s * body.vel.z;
  fwd += t * (boost ? 95 : 42) * dt;
  lat += str * 26 * dt;
  fwd *= Math.exp(-0.55 * dt);
  lat *= Math.exp(-3.2 * dt);
  body.vel.x = -s * fwd + c * lat;
  body.vel.z = -c * fwd - s * lat;
  body.vel.y += lift * 32 * dt;
  body.vel.y *= Math.exp(-2.4 * dt); // strong vertical drag = auto-hover
  body.pos.addScaledVector(body.vel, dt);

  if (body.pos.y < 3) { body.pos.y = 3; body.vel.y = Math.max(0, body.vel.y); }
  if (body.pos.y > 650) { body.pos.y = 650; body.vel.y = Math.min(0, body.vel.y); }
  const lim = HALF + 300;
  for (const k of ['x', 'z']) if (Math.abs(body.pos[k]) > lim) body.vel[k] -= Math.sign(body.pos[k]) * 40 * dt;
  body.bumped = resolveCollision(city, body.pos, body.vel, 2.6);
  return { t, str };
}

export class Car {
  constructor() {
    const { root, g, screen, dashCanvas, dashTex, mats, shells, under } = buildModel();
    this.group = root;
    this.mats = mats; this.shells = shells; this.under = under;
    this.fallback = g; this.exterior = [];
    this.look = { ...DEFAULT_LOOK };
    this.trinket = null;
    this.eye = null; this.wipers = []; this.yoke = null; this.drops = null; this.onModel = null;
    this.trinketV = new THREE.Vector2();
    loadModel(this, root, g, screen);
    this.dash = dashCanvas.getContext('2d');
    this.dashTex = dashTex;
    this.dashTimer = 0;
    this.pos = new THREE.Vector3(0, 90, 40);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.yawRate = 0; this.roll = 0; this.pitch = 0;
    this.time = 0;
    this.bumped = false;
  }

  get speed() { return this.vel.length(); }

  update(dt, inp, city) {
    this.time += dt;
    const { t, str } = fly(this, inp, dt, city);

    // Visual attitude: bank into turns, nose dips on thrust; lerp = gentle auto-levelling.
    const k = Math.min(1, dt * 3.5);
    this.roll += (this.yawRate * 0.45 - str * 0.12 - this.roll) * k;
    this.pitch += (-t * 0.05 + this.vel.y * 0.01 - this.pitch) * k;
    this.group.position.copy(this.pos);
    this.group.position.y += Math.sin(this.time * 1.7) * 0.07;
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');

    if (this.yoke) this.yoke.quaternion.copy(this.yoke.userData.q0).multiply(_q.setFromAxisAngle(UP, this.yawRate * 1.6));
    // Dashboard trinket: a damped pendulum pushed by thrust and turning.
    if (this.trinket) {
      const tv = this.trinketV, r = this.trinket.rotation;
      tv.x += (-r.x * 30 + t * 4 - tv.x * 2.5) * dt; // pitch swing (glTF node: x tilts fore/aft)
      tv.y += (-r.z * 30 - this.yawRate * 6 - tv.y * 2.5) * dt;
      r.x += tv.x * dt; r.z += tv.y * dt;
    }

    this.dashTimer -= dt;
    if (this.dashTimer <= 0) { this.dashTimer = 0.1; this.drawDash(); }
  }

  // Wiper arms swing about their pivots (angle from the Windshield sweep, radians up from resting flat).
  setWipers(angle) {
    for (const w of this.wipers) w.quaternion.copy(w.userData.q0).multiply(_q.setFromAxisAngle(UP, angle));
  }

  // Garage look: { name, body, paint, finish, underglow, interior, dash, engine }.
  applyLook(look) {
    Object.assign(this.look, look);
    const L = this.look, m = this.mats;
    m.paint.color.set(L.paint);
    Object.assign(m.paint, FINISHES[L.finish] ?? FINISHES.gloss);
    m.neon.color.copy(hdr(L.underglow, 3.6));
    m.under.color.copy(hdr(L.underglow, 1.3));
    m.interior.color.copy(hdr(L.interior, 0.85)); // stays under the bloom threshold
    m.cabinLight.color.set(L.interior);
    this.applyShape();
  }

  applyShape() {
    const b = this.look.body;
    this.shells.cab.visible = b === 'cab';
    this.shells.cruiser.visible = b === 'cruiser';
    for (const o of this.exterior) o.visible = b === 'coupe';
    if (this.fallback) this.fallback.visible = b === 'coupe';
    this.under.scale.set(b === 'cruiser' ? 1.25 : 1, b === 'cruiser' ? 1.25 : 1, 1);
  }

  drawDash() {
    const d = this.dash, T = DASH_THEMES[this.look.dash] ?? DASH_THEMES.cyan;
    d.fillStyle = T.bg; d.fillRect(0, 0, 256, 96);
    d.fillStyle = T.big; d.font = '200 40px Segoe UI, sans-serif';
    d.fillText(String(Math.round(this.speed * 3.6)).padStart(3, ' '), 12, 44);
    d.font = '13px Segoe UI, sans-serif'; d.fillStyle = T.unit;
    d.fillText('KM/H', 92, 44);
    d.fillStyle = T.alt; d.fillText(`ALT ${Math.round(this.pos.y)} m`, 160, 22);
    d.fillStyle = T.warn; d.fillText(this.bumped ? 'PROXIMITY' : 'CRUISE', 160, 42);
    d.font = '10px Segoe UI, sans-serif'; d.fillStyle = T.text;
    d.fillText(this.look.name.toUpperCase().slice(0, 18), 12, 12);
    d.font = '12px Segoe UI, sans-serif'; d.fillStyle = T.text;
    d.fillText((this.districtName ?? '').toUpperCase(), 12, 66);
    if (this.nowPlaying) { d.fillStyle = T.music; d.fillText(`♪ ${this.nowPlaying}`.slice(0, 26), 12, 86); }
    // EQ bars from the music analyser.
    const eq = this.eq;
    if (eq) for (let i = 0; i < 12; i++) {
      const v = eq[2 + Math.floor((i / 12) ** 1.6 * 200)] / 255, h = 2 + v * 34;
      d.fillStyle = i < 3 ? T.eqA : T.eqB;
      d.fillRect(170 + i * 7, 92 - h, 5, h);
    }
    this.dashTex.needsUpdate = true;
  }
}
