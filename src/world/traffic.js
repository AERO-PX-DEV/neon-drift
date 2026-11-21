import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { HALF, GRID, roadCoord } from './layout.js';
import { DISTRICTS, districtAt } from './districts.js';
import { lotAt } from './city.js';
import { makeBeam } from '../fx/beam.js';
import { loadModel, modelParts, InstancedModel } from './assets.js';

const CRAFT = { car: 'craft_racer', taxi: 'craft_speederA', hauler: 'craft_cargoA' };
const TYPES = {
  car: { scale: [1, 1, 1], speed: [26, 40], tiers: [40, 65, 95, 130] },
  taxi: { scale: [1, 1, 1], speed: [28, 38], tiers: [40, 65, 95] },
  hauler: { scale: [1.8, 1.7, 3.2], speed: [14, 20], tiers: [165, 205] },
};
const BODY = [0x1c2430, 0x2a1f2e, 0x3a3f48, 0x101418, 0x3b2a1a, 0x24343a];
const WRAP = HALF + 250;

// Yaw so the model's −Z nose points along +axis·dir.
const laneYaw = (axis, dir) => (axis === 0 ? -dir * Math.PI / 2 : dir > 0 ? Math.PI : 0);

export function createTraffic(count, seed, city) {
  const rnd = mulberry32(seed ^ 0x51ed27);
  const group = new THREE.Group();
  const npcs = [];
  for (let i = 0; i < count; i++) {
    const r = rnd(), type = r < 0.18 ? 'taxi' : r < 0.3 ? 'hauler' : 'car', T = TYPES[type];
    const alt = T.tiers[Math.floor(rnd() * T.tiers.length)];
    npcs.push({
      type, T, axis: rnd() < 0.5 ? 0 : 1, lane: roadCoord(1 + Math.floor(rnd() * (GRID - 1))), dir: rnd() < 0.5 ? 1 : -1,
      s: (rnd() * 2 - 1) * HALF, speed: T.speed[0] + rnd() * (T.speed[1] - T.speed[0]), alt, tgtAlt: alt,
      keep: rnd(), vis: 0, laneTimer: 10 + rnd() * 40, landTimer: 20 + rnd() * 240, state: 'lane',
      pos: new THREE.Vector3(), yaw: 0, near: false, target: new THREE.Vector3(), parkT: 0,
    });
  }

  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; group.add(m); return m; };
  const body = mk(new THREE.BoxGeometry(2.2, 0.7, 4.6), new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.35 }));
  const head = mk(new THREE.BoxGeometry(1.9, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 7) }));
  const tail = mk(new THREE.BoxGeometry(2.1, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.2, 0.3) }));
  const nav = mk(new THREE.BoxGeometry(0.35, 0.15, 0.35), new THREE.MeshBasicMaterial());
  const c = new THREE.Color();
  const paintOf = (n, i) => c.set(n.type === 'taxi' ? 0x8a6a1a : n.type === 'hauler' ? 0x2b2b30 : BODY[i % BODY.length]);
  npcs.forEach((n, i) => body.setColorAt(i, paintOf(n, i)));

  // Kenney Space Kit craft replace the boxes once loaded: hull takes the livery, orange trim becomes a neon strip.
  const hulls = {};
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const glass = new THREE.MeshStandardMaterial({ color: 0x06080c, metalness: 0.3, roughness: 0.3, envMapIntensity: 0.4 }); // big panels: no mirrors
  const trim = new THREE.MeshStandardMaterial({ color: 0x15191f, metalness: 0.8, roughness: 0.4 });
  // Satin, not chrome: Kenney's big flat panels mirror the whole sky at the box body's 0.7/0.35.
  const hullMat = new THREE.MeshStandardMaterial({ metalness: 0.55, roughness: 0.55, envMapIntensity: 0.35 });
  const neon = new THREE.MeshBasicMaterial();
  // Kenney's orange trim panels are large: a dim tint of the line colour, not neon (that's the lights' job).
  const NEON = [new THREE.Color(0.02, 0.12, 0.18), new THREE.Color(0.2, 0.03, 0.04)], TAXI = new THREE.Color(0.5, 0.3, 0.05);
  for (const [type, file] of Object.entries(CRAFT)) {
    const idx = npcs.map((n, i) => (n.type === type ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i, k) => (npcs[i].k = k));
    loadModel(`models/kenney-space-kit/${file}.glb`).then((g) => {
      if (!g || !idx.length) return;
      const parts = modelParts(g, 4.6, 'z');
      for (const p of parts) p.geometry.translate(0, -parts.size.y / 2, 0); // Kenney noses already point −Z; centred like the box
      const model = new InstancedModel(parts, idx.length, (p) => ({ metal: hullMat, metalRed: neon, dark: glass }[p.name] ?? trim));
      for (const mesh of model.meshes) {
        if (mesh.name === 'metal') idx.forEach((i, k) => mesh.setColorAt(k, paintOf(npcs[i], i)));
        if (mesh.name === 'metalRed') idx.forEach((i, k) => mesh.setColorAt(k, type === 'taxi' ? TAXI : NEON[i % 2]));
      }
      hulls[type] = model;
      group.add(model.group);
    });
  }

  const offHead = new THREE.Matrix4().makeTranslation(0, 0.05, -2.32);
  const offTail = new THREE.Matrix4().makeTranslation(0, 0.1, 2.32);
  const offNav = new THREE.Matrix4().makeTranslation(0, 0.45, 0.6);
  const m = new THREE.Matrix4(), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  const AMBER = new THREE.Color(5, 2.4, 0.4), GREEN = new THREE.Color(0.3, 5, 0.8), RED = new THREE.Color(6, 0.3, 0.3), OFF = new THREE.Color(0.05, 0.05, 0.05);

  function lanePos(n) {
    const side = n.dir * 4.5; // keep right
    if (n.axis === 0) n.pos.set(n.s, n.alt, n.lane + side);
    else n.pos.set(n.lane - side, n.alt, n.s);
  }

  function step(n, dt) {
    if (n.state === 'lane') {
      n.s += n.dir * n.speed * dt;
      if (n.s > WRAP) n.s = -WRAP; else if (n.s < -WRAP) n.s = WRAP;
      if ((n.laneTimer -= dt) <= 0) { n.laneTimer = 15 + Math.random() * 40; n.tgtAlt = n.T.tiers[Math.floor(Math.random() * n.T.tiers.length)]; }
      n.alt += (n.tgtAlt - n.alt) * Math.min(1, dt * 0.6);
      lanePos(n);
      n.yaw = laneYaw(n.axis, n.dir);
      if (n.type !== 'hauler' && (n.landTimer -= dt) <= 0) {
        n.landTimer = 20;
        const ax = n.axis === 0 ? n.dir * 30 : (Math.random() < 0.5 ? 14 : -14);
        const az = n.axis === 1 ? n.dir * 30 : (Math.random() < 0.5 ? 14 : -14);
        const b = lotAt(city, n.pos.x + ax, n.pos.z + az);
        if (b && !b.hidden && b.shape === 'box' && !b.tiers && b.h > 8 && b.h < n.alt - 8) { // flat roofs only
          n.state = 'descend';
          n.target.set(b.x, b.h + 1.1, b.z);
        }
      }
      return;
    }
    const toX = n.target.x - n.pos.x, toZ = n.target.z - n.pos.z, flat = Math.hypot(toX, toZ);
    if (n.state === 'descend') {
      if (flat > 0.5) { const k = Math.min(flat, 12 * dt) / flat; n.pos.x += toX * k; n.pos.z += toZ * k; n.yaw = Math.atan2(-toX, -toZ); }
      if (flat < 20) n.pos.y += Math.max(-7 * dt, n.target.y - n.pos.y);
      if (flat < 0.6 && n.pos.y - n.target.y < 0.1) { n.state = 'parked'; n.parkT = 12 + Math.random() * 25; }
    } else if (n.state === 'parked') {
      if ((n.parkT -= dt) <= 0) {
        n.state = 'ascend';
        n.s = n.axis === 0 ? n.pos.x : n.pos.z; // rejoin the lane right beside the roof
        const here = n.pos.clone();
        lanePos(n);
        n.target.copy(n.pos);
        n.pos.copy(here);
      }
    } else if (n.state === 'ascend') {
      n.pos.y = Math.min(n.alt, n.pos.y + 8 * dt);
      if (n.pos.y > n.alt - 10 && flat > 0.3) { const k = Math.min(flat, 10 * dt) / flat; n.pos.x += toX * k; n.pos.z += toZ * k; n.yaw = Math.atan2(-toX, -toZ); }
      if (n.pos.y >= n.alt - 0.1 && flat <= 0.3) { n.state = 'lane'; n.landTimer = 60 + Math.random() * 240; }
    }
  }

  // Police patrol drones: never chase you, just sweep searchlights over the buildings.
  const drones = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x15181e, metalness: 0.8, roughness: 0.3 })));
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: RED.clone() }));
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 7) }));
    lr.position.set(-0.8, 0.35, 0); lb.position.set(0.8, 0.35, 0);
    const beam = makeBeam(170, 20, [0.75, 0.85, 1], 0.28);
    g.add(lr, lb, beam);
    group.add(g);
    drones.push({
      g, lr, lb, beam, cx: (rnd() - 0.5) * HALF * 1.3, cz: (rnd() - 0.5) * HALF * 1.3, r: 150 + rnd() * 200,
      alt: 110 + rnd() * 90, w: (rnd() < 0.5 ? 1 : -1) * (0.04 + rnd() * 0.04), a: rnd() * 6.28, ph: rnd() * 10,
    });
  }

  return {
    group,
    npcs,
    update(dt, time, camPos, densityScale, onPass) {
      npcs.forEach((n, i) => {
        step(n, dt);
        const tgt = n.state !== 'lane' || n.keep < (DISTRICTS[districtAt(n.pos.x, n.pos.z, city.seed)].traffic * densityScale) / 1.5 ? 1 : 0;
        n.vis += (tgt - n.vis) * Math.min(1, dt * 1.5);
        const v = n.vis < 0.02 ? 0 : n.vis;
        e.set(0, n.yaw, 0);
        m.compose(n.pos, q.setFromEuler(e), s.set(n.T.scale[0] * v, n.T.scale[1] * v, n.T.scale[2] * v));
        const hull = hulls[n.type];
        if (hull) hull.setMatrixAt(n.k, m);
        body.setMatrixAt(i, hull ? ZERO : m);
        head.setMatrixAt(i, mm.multiplyMatrices(m, offHead));
        tail.setMatrixAt(i, mm.multiplyMatrices(m, offTail));
        nav.setMatrixAt(i, mm.multiplyMatrices(m, offNav));
        const blink = (time * 1.3 + i * 0.37) % 1 < 0.12;
        nav.setColorAt(i, n.type === 'taxi' ? AMBER : blink ? (i % 2 ? GREEN : RED) : OFF);
        const near = v > 0.5 && n.pos.distanceToSquared(camPos) < 625;
        if (near && !n.near) onPass?.(n);
        n.near = near;
      });
      for (const im of [body, head, tail, nav]) im.instanceMatrix.needsUpdate = true;
      for (const h of Object.values(hulls)) h.commit();
      nav.instanceColor.needsUpdate = true;

      for (const d of drones) {
        d.a += d.w * dt;
        d.g.position.set(d.cx + Math.cos(d.a) * d.r, d.alt + Math.sin(time * 0.5 + d.ph) * 3, d.cz + Math.sin(d.a) * d.r);
        d.beam.rotation.set(Math.sin(time * 0.4 + d.ph) * 0.55, 0, Math.cos(time * 0.33 + d.ph) * 0.55);
        const on = Math.floor(time * 3 + d.ph) % 2;
        d.lr.visible = !!on; d.lb.visible = !on;
      }
    },
  };
}
