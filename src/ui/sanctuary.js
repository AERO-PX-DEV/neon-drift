import * as THREE from 'three';
import { Windshield } from '../car/windshield.js';
import { PAD_R, PAD_TYPES } from '../world/pads.js';
import { lotAt } from '../world/city.js';
import { loadModel, modelParts, InstancedModel, pbrMaps } from '../world/assets.js';

// Room lighting presets: [label, colour, intensity]. Warm lamp is the one amber exception: it's a home.
const LIGHTS = {
  lamp: ['Warm lamp', 0xffa45a, 14], blue: ['Blue neon', 0x38c8ff, 16], red: ['Red neon', 0xff3b30, 14],
  candle: ['Candle', 0xff8a3a, 4], off: ['Lights off', 0xffffff, 0],
};
const DRINKS = { tea: ['Tea', 0x6b4a1a], coffee: ['Coffee', 0x1a0e08] };
const W = 5, H = 3, D = 4.5, WX = 1.9, WY0 = 0.8, WY1 = 2.6; // room size and window opening (room-local, window at z = 0)

// Small steam wisps rising off the cup; age = fract(uTime·rate + phase), so it's free on the CPU.
function cupSteam(uniforms, hot) {
  const n = 40, ph = new Float32Array(n), rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) { ph[i] = i / n; rnd[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uScale: uniforms.uScale, uHot: hot },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `uniform float uTime, uScale; attribute float aPhase, aRand; varying float vA;
      void main() {
        float t = fract(uTime * 0.35 + aPhase);
        vec3 p = position + vec3(sin(t * 6.0 + aRand * 9.0) * 0.03 * t, t * 0.35, cos(t * 5.0 + aRand * 7.0) * 0.02 * t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.02 + t * 0.06) * uScale / -mv.z;
        vA = sin(t * 3.14159) * 0.22;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform float uHot; varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.8, 0.85, 0.95) * smoothstep(0.5, 0.0, r) * vA * uHot, 1.0); }`,
  }));
  pts.frustumCulled = false;
  return pts;
}

function glyphMaterial(ch, color) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12;
  g.font = '600 96px "Yu Gothic", "Meiryo", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
}

function buildRoom() {
  const room = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x4a5262, roughness: 0.9, ...pbrMaps('Concrete049', 2) });
  const wood = new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.4, metalness: 0.7 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); room.add(m); return m; };
  box(W, 0.1, D, wood, 0, -0.05, D / 2);                       // floor
  box(W, 0.1, D, wall, 0, H + 0.05, D / 2);                    // ceiling
  box(W, H, 0.1, wall, 0, H / 2, D + 0.05);                    // back wall
  for (const s of [-1, 1]) box(0.1, H, D, wall, s * (W / 2 + 0.05), H / 2, D / 2);
  box(W, WY0, 0.2, wall, 0, WY0 / 2, -0.1);                    // front wall around the window opening
  box(W, H - WY1, 0.2, wall, 0, (WY1 + H) / 2, -0.1);
  for (const s of [-1, 1]) box(W / 2 - WX, WY1 - WY0, 0.2, wall, s * (WX + (W / 2 - WX) / 2), (WY0 + WY1) / 2, -0.1);
  box(0.07, WY1 - WY0, 0.12, metal, 0, (WY0 + WY1) / 2, -0.05); // mullion
  box(2 * WX, 0.05, 0.12, metal, 0, 2.05, -0.05);               // transom
  box(2 * WX + 0.4, 0.06, 0.45, wood, 0, WY0 + 0.03, 0.15);     // sill

  // Cup on the sill; the liquid disc shows once a drink is made.
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.35 });
  const cup = new THREE.Group();
  cup.position.set(0.55, WY0 + 0.06, 0.22);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 20, 1, true), ceramic);
  body.material.side = THREE.DoubleSide;
  body.position.y = 0.05;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 16), ceramic);
  handle.position.set(0.055, 0.05, 0);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20).rotateX(-Math.PI / 2), ceramic);
  base.position.y = 0.002;
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.1 }));
  liquid.position.y = 0.085;
  liquid.visible = false;
  cup.add(body, handle, base, liquid);
  room.add(cup);

  // Floor lamp in the corner and a small red neon glyph on the side wall.
  box(0.03, 1.5, 0.03, metal, -2.0, 0.75, 1.1);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.3, 20, 1, true), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  shade.position.set(-2.0, 1.6, 1.1);
  room.add(shade);
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), glyphMaterial('雨', [3, 0.35, 0.3]));
  glyph.position.set(W / 2 - 0.01, 2.0, 2.4);
  glyph.rotation.y = -Math.PI / 2;
  room.add(glyph);
  box(0.9, 0.45, 0.45, wood, 1.6, 0.225, 3.6);                 // low cabinet
  box(1.6, 0.04, 0.25, wood, -0.6, 1.9, D - 0.13);             // shelf with a few books
  for (let i = 0; i < 7; i++) box(0.05, 0.18 + Math.random() * 0.06, 0.16, new THREE.MeshStandardMaterial({ color: [0x3a2a2a, 0x1f2c3a, 0x2c2c2c, 0x40201c][i % 4] }), -1.25 + i * 0.07, 2.02, D - 0.13);

  const light = new THREE.PointLight(0xffa45a, 14, 10, 1.6);
  light.position.set(-1.4, 2.3, 1.6);
  room.add(light);

  // Rain on the glass: two panes, each its own drop canvas (the windshield drops, no wipers).
  const panes = [-1, 1].map((s) => {
    const ws = new Windshield();
    ws.mesh.rotation.set(0, 0, 0);
    ws.mesh.scale.set(WX / 1.7, (WY1 - WY0) / 1.4, 1);
    ws.mesh.position.set(s * WX / 2, (WY0 + WY1) / 2, 0.0);
    room.add(ws.mesh);
    return ws;
  });
  return { room, cup, liquid, shade, light, panes };
}

// Downloaded furniture (see CREDITS.md), room-local: window wall at z = 0, the viewer sits at z ≈ 2.3 looking out.
// [model, size m, axis the size applies to, x, y, z, yaw]. Optional detail: a missing file leaves that spot empty.
const PH = (n) => `models/polyhaven/${n}/${n}_1k.gltf`, KF = (n) => `models/kenney-furniture-kit/${n}.glb`;
const SILL = WY0 + 0.06;
const FURNITURE = [
  [KF('rugRound'), 1.8, 'xz', -0.3, 0.003, 1.3, 0, 0x4a2230], // Kenney's rug is near-white: dye it
  [PH('coffee_table_round_01'), 0.8, 'xz', -0.75, 0, 1.15, 0],
  [PH('tea_set_01'), 0.5, 'xz', -0.75, 0.302, 1.15, 0.5],
  [PH('potted_plant_04'), 0.85, 'y', -2.05, 0, 0.45, 0],
  [PH('vintage_electric_kettle'), 0.22, 'y', -1.25, SILL, 0.2, 0.6],
  [PH('boombox'), 0.5, 'x', 1.35, SILL, 0.2, -0.2],
  [KF('plantSmall2'), 0.3, 'y', 0.95, SILL, 0.2, 0],
  [PH('sofa_03'), 2.4, 'x', 2.04, 0, 2.1, -Math.PI / 2],
  [PH('throw_pillows_01'), 0.9, 'x', 2.0, 0.42, 2.1, -Math.PI / 2],
  [PH('modern_ceiling_lamp_01'), 0.85, 'y', -1.4, H - 0.85, 1.6, 0],
  [KF('bookcaseOpen'), 1.9, 'y', -2.23, 0, 2.9, Math.PI / 2],
  [PH('desk_lamp_arm_01'), 0.6, 'y', 1.65, 0.45, 3.6, -2.4],
];
function furnish(room) {
  for (const [path, size, axis, x, y, z, yaw, dye] of FURNITURE) {
    loadModel(path).then((g) => {
      if (!g) return;
      const piece = new InstancedModel(modelParts(g, size, axis), 1, (p) => (dye ? new THREE.MeshStandardMaterial({ color: dye, roughness: 0.95 }) : p.material));
      piece.setMatrixAt(0, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
      piece.commit();
      room.add(piece.group);
    });
  }
}

// Of 16 compass directions, the one whose sightline stays clear of taller buildings the longest.
function bestView(city, p) {
  let best = null, bestD = -1;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    let d = PAD_R;
    for (; d < 500; d += 5) {
      const b = lotAt(city, p.x + dx * d, p.z + dz * d);
      if (b && !b.hidden && b !== lotAt(city, p.x, p.z) && (b.shape === 'pyramid' ? b.vh : b.top) > p.y - 2) break;
    }
    const toCentre = -(dx * p.x + dz * p.z) / (Math.hypot(p.x, p.z) || 1); // tie-break toward the skyline
    if (d + toCentre * 20 > bestD) { bestD = d + toCentre * 20; best = [dx, dz]; }
  }
  return best;
}

export function createSanctuary({ scene, camera, uniforms, audio, getInfo, city, logHTML, visited }) {
  const r = buildRoom();
  furnish(r.room);
  const hot = { value: 0 };
  const steam = cupSteam(uniforms, hot);
  steam.position.set(0.55, WY0 + 0.15, 0.22);
  r.room.add(steam);
  r.room.visible = false;
  scene.add(r.room);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="fade"></div>
    <div id="sanct" class="hidden">
      <div class="where"><div class="nm"></div><div class="ds"></div></div>
      <div class="btns">
        <button data-a="tea">Make tea</button><button data-a="coffee">Make coffee</button><button data-a="sip">Sip</button>
        <button data-a="light">Light: Warm lamp</button><button data-a="log">City Log</button><button data-a="leave">Leave (G)</button>
      </div>
      <div class="status"></div>
      <div class="log hidden"></div>
    </div>`);
  const ui = document.getElementById('sanct'), fade = document.getElementById('fade');
  const status = ui.querySelector('.status'), logEl = ui.querySelector('.log'), lightBtn = ui.querySelector('[data-a=light]');
  let pad = null, lightKey = 'lamp', drink = null, sips = 0, steamT = 0, statusT = 0, swayT = 0;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { look.tx = (e.clientX / innerWidth - 0.5) * -0.9; look.ty = (e.clientY / innerHeight - 0.5) * -0.35; });

  const say = (text) => { status.textContent = text; statusT = 5; };
  function setLight(k) {
    lightKey = k;
    const [label, col, I] = LIGHTS[k];
    r.light.color.set(col); r.light.intensity = I;
    r.shade.material.color.set(col).multiplyScalar(I ? 1.4 : 0.05);
    lightBtn.textContent = `Light: ${label}`;
  }
  function make(kind) {
    drink = kind; sips = 0; steamT = 150;
    r.liquid.visible = true;
    r.liquid.material.color.set(DRINKS[kind][1]);
    r.liquid.position.y = 0.085;
    audio?.pour();
    say(`${DRINKS[kind][0]} poured. Let it steam a moment.`);
  }
  function sip() {
    if (!drink) return say('The cup is empty.');
    audio?.sip();
    r.liquid.position.y = 0.085 - ++sips * 0.014;
    if (sips >= 5) { say(`Last of the ${DRINKS[drink][0].toLowerCase()}.`); drink = null; r.liquid.visible = false; hot.value = 0; steamT = 0; }
  }
  const renderLog = () => (logEl.innerHTML = logHTML([...visited]));
  ui.addEventListener('click', (e) => {
    const a = e.target.dataset?.a;
    if (a === 'tea' || a === 'coffee') make(a);
    else if (a === 'sip') sip();
    else if (a === 'light') { const keys = Object.keys(LIGHTS); setLight(keys[(keys.indexOf(lightKey) + 1) % keys.length]); }
    else if (a === 'log') { logEl.classList.toggle('hidden'); if (!logEl.classList.contains('hidden')) renderLog(); }
    else if (a === 'leave') api.exit();
  });

  // Fade to black, swap, fade back. Timed on the game clock (setTimeout is throttled in background tabs).
  let pending = null, fadeT = 0;
  const fadeThen = (fn) => { if (pending) return; fade.classList.add('on'); pending = fn; fadeT = 0.65; };
  const dir = new THREE.Vector3(), eye = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');

  const api = {
    active: false,
    onExit: null,
    enter(p) {
      if (api.active) return;
      fadeThen(() => {
        pad = p; api.active = true; visited.add(p.name);
        // Face the room along the clearest sightline; the window sits at the deck's edge.
        const [vx, vz] = bestView(city, p);
        dir.set(vx, 0, vz);
        r.room.rotation.y = Math.atan2(-dir.x, -dir.z);
        r.room.position.set(p.x + dir.x * (PAD_R + 1.5), p.y, p.z + dir.z * (PAD_R + 1.5));
        r.room.visible = true;
        setLight(PAD_TYPES[p.type]?.light ?? 'lamp');
        ui.querySelector('.nm').textContent = p.name.toUpperCase();
        ui.querySelector('.ds').textContent = getInfo().district.name;
        ui.classList.remove('hidden');
        document.body.classList.add('in-sanctuary');
        say(p.type === 'home' ? 'Home. The rain sounds different from in here.' : `Docked at ${p.name}.`);
      });
    },
    exit() {
      if (!api.active) return;
      fadeThen(() => {
        api.active = false; r.room.visible = false;
        ui.classList.add('hidden'); logEl.classList.add('hidden');
        document.body.classList.remove('in-sanctuary');
        api.onExit?.();
      });
    },
    update(dt, rain) {
      if (pending && (fadeT -= dt) <= 0) { const fn = pending; pending = null; fn(); fade.classList.remove('on'); }
      if (!api.active) return;
      for (const ws of r.panes) ws.update(dt, rain, 0);
      if (steamT > 0) { steamT -= dt; hot.value = Math.min(1, steamT / 30); }
      if (statusT > 0 && (statusT -= dt) <= 0) status.textContent = '';
      // Seated by the window: slow breathing sway; the mouse lets you glance around.
      swayT += dt;
      look.x += (look.tx - look.x) * Math.min(1, dt * 2); look.y += (look.ty - look.y) * Math.min(1, dt * 2);
      eye.set(0.35 + Math.sin(swayT * 0.4) * 0.03, 1.22 + Math.sin(swayT * 0.9) * 0.008, 2.3);
      r.room.localToWorld(camera.position.copy(eye));
      q.setFromEuler(e.set(-0.06 + look.y, look.x + Math.sin(swayT * 0.23) * 0.02, 0));
      camera.quaternion.copy(r.room.quaternion).multiply(q);
      camera.fov += (60 - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    },
    get pad() { return pad; },
  };
  return api;
}
