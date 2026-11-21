import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';
import { BLOCK, ROAD, LOT, GRID, HALF } from './layout.js';
import { DISTRICTS, districtAt } from './districts.js';
import { pbrMaps } from './assets.js';

export { BLOCK, ROAD, LOT, GRID, HALF };
const LOTS = GRID * 2;
export const SIGN_SLOTS = { h: 12, v: 16 }; // must match the atlas in signs.js

// Cyan-dominant with red/coral accents (duplicates = weighting); magenta and amber are rare.
export const NEON = [
  [0.1, 0.85, 1], [0.15, 0.7, 1], [0.35, 0.95, 1], [0.1, 0.85, 1], [0.2, 0.6, 1], [0.3, 0.95, 1],
  [1, 0.22, 0.16], [1, 0.38, 0.3], [1, 0.22, 0.16], [1, 0.1, 0.6], [1, 0.55, 0.15],
];
const CYAN = [[0.1, 0.85, 1], [0.35, 0.95, 1], [0.2, 0.65, 1]];

// Thin light rods running up a building corner to its roof edge.
function addRod(out, b, rnd) {
  const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1;
  const y0 = b.h * (0.25 + rnd() * 0.35), y1 = b.h - 0.2;
  rnd(); // was the above-roof overshoot; still drawn so every seed builds the same city
  const c = rnd() < 0.8 ? pick(CYAN, rnd) : [1, 0.25, 0.2], k = 1.6 + rnd() * 1.4;
  out.push({ x: b.x + sx * (b.w / 2 + 0.15), y: (y0 + y1) / 2, z: b.z + sz * (b.d / 2 + 0.15), sx: 0.3, sy: y1 - y0, sz: 0.3, c: [c[0] * k, c[1] * k, c[2] * k] });
}
const SODIUM = [5, 2.1, 0.4];
const RUST = [[0.35, 0.08, 0.06], [0.08, 0.18, 0.28], [0.3, 0.22, 0.06], [0.12, 0.25, 0.12], [0.25, 0.25, 0.27]];

// ---------------------------------------------------------------- data (pure, no WebGL)

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const roofOf = (b) => b.tiers?.at(-1) ?? b; // topmost box
const roofPoint = (b, rnd) => { const r = roofOf(b); return { x: b.x + (rnd() - 0.5) * r.w * 0.6, y: b.top, z: b.z + (rnd() - 0.5) * r.d * 0.6 }; };
const CONCRETE = [0.13, 0.15, 0.18];

// Setbacks: the base box keeps b.w/b.d/b.h (walls carry signs + strips); narrower tiers stack up to `total`.
// Every tier top gets a ledge (cornice) so the silhouette steps like a real tower.
function addTiers(b, rnd, n, total, o) {
  b.tiers = [];
  let w = b.w, d = b.d, h = b.h;
  const step = (total - b.h) / n;
  for (let i = 0; i < n; i++) {
    w *= 0.62 + rnd() * 0.22; d *= 0.62 + rnd() * 0.22;
    if (w < 5 || d < 5) break;
    h += step * (0.7 + rnd() * 0.6);
    b.tiers.push({ w, d, h });
  }
  b.top = h;
  for (const t of [b, ...b.tiers]) o.props.push({ x: b.x, y: t.h - 0.3, z: b.z, sx: t.w + 0.7, sy: 0.6, sz: t.d + 0.7, c: CONCRETE });
}

function face(b, rnd) {
  const f = Math.floor(rnd() * 4);
  const nx = f === 0 ? 1 : f === 1 ? -1 : 0, nz = f === 2 ? 1 : f === 3 ? -1 : 0;
  return { nx, nz, span: nx ? b.d : b.w };
}

function addStrips(out, b, count, rnd, tall = false) {
  for (let k = 0; k < count; k++) {
    const { nx, nz, span } = face(b, rnd);
    const vertical = tall || rnd() < 0.6;
    const len = tall ? b.h * 0.85 : vertical ? Math.min(b.h * 0.8, 6 + rnd() * 30) : span * (0.4 + rnd() * 0.5);
    const y = tall ? b.h * 0.5 : vertical ? 4 + rnd() * Math.max(1, b.h - len - 4) + len / 2 : 4 + rnd() * Math.max(1, b.h - 6);
    const along = (rnd() - 0.5) * 0.7 * span;
    const thick = tall ? 0.25 : 0.35 + rnd() * 0.4;
    const c = pick(NEON, rnd), k2 = tall ? 1.2 + rnd() * 0.8 : 1.8 + rnd() * 1.6; // bright enough to bloom, not to glare
    out.push({
      x: b.x + nx * (b.w / 2 + 0.2) + (nz ? along : 0), y, z: b.z + nz * (b.d / 2 + 0.2) + (nx ? along : 0),
      sx: nx ? 0.25 : vertical ? thick : len, sy: vertical ? len : thick, sz: nz ? 0.25 : vertical ? thick : len,
      c: [c[0] * k2, c[1] * k2, c[2] * k2],
    });
  }
}

function addSign(out, b, rnd, big) {
  const { nx, nz, span } = face(b, rnd);
  const vertical = rnd() < 0.55;
  let w, h;
  if (vertical) { h = big ? 30 + rnd() * 30 : 8 + rnd() * 12; w = h * 0.2; }
  else { w = big ? 18 + rnd() * 14 : 6 + rnd() * 8; h = w * 0.22; }
  const s = Math.min(1, (span * 0.9) / w, (b.h * 0.85) / h);
  w *= s; h *= s;
  const y = Math.max(h / 2 + 3, Math.min(b.h - h / 2 - 1, (big ? 0.55 + rnd() * 0.35 : rnd()) * b.h));
  const along = (rnd() - 0.5) * Math.max(0, span - w);
  out.push({
    x: b.x + nx * (b.w / 2 + 0.35) + (nz ? along : 0), y, z: b.z + nz * (b.d / 2 + 0.35) + (nx ? along : 0),
    w, h, nx, nz, rotY: Math.atan2(nx, nz), vertical,
    slot: Math.floor(rnd() * (vertical ? SIGN_SLOTS.v : SIGN_SLOTS.h)),
    color: pick(NEON, rnd), k: (big ? 2.2 : 1.7) + rnd() * 1.1, flick: rnd() < 0.12 ? 1 : 0, big, // readable text, soft halo
  });
}

function crane(o, x, z, rnd) {
  const H = 45 + rnd() * 20, c = [0.55, 0.33, 0.08], alongX = rnd() < 0.5;
  const off = (a) => (alongX ? { x: x + a, z } : { x, z: z + a });
  o.props.push({ x, y: H / 2, z, sx: 2.4, sy: H, sz: 2.4, c });
  o.props.push({ ...off(7), y: H + 1, sx: alongX ? 46 : 2.2, sy: 2, sz: alongX ? 2.2 : 46, c });
  o.props.push({ ...off(-13), y: H - 1.5, sx: 4, sy: 3, sz: 4, c: [0.2, 0.2, 0.22] });
  o.props.push({ ...off(0), y: H - 3, sx: 3, sy: 3, sz: 3, c: [0.18, 0.2, 0.24] }); // cab
  o.beacons.push({ ...off(30), y: H + 2.5 });
}

function containers(o, x, z, rnd) {
  let top = 0;
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) {
    const stack = 1 + Math.floor(rnd() * 3);
    for (let s = 0; s < stack; s++) {
      o.props.push({ x: x - 6 + col * 6, y: 1.3 + s * 2.6, z: z - 6.5 + r * 6.5, sx: 2.5, sy: 2.5, sz: 6, c: pick(RUST, rnd) });
    }
    top = Math.max(top, stack * 2.6);
  }
  return { x, z, h: top, vh: top, w: LOT - 2, d: LOT - 2, lit: 0, shape: 'box', hidden: true }; // collision only
}

function genLot(id, x, z, rnd, o) {
  const B = (h, w, d, lit, extra) => ({ x, z, h, vh: h, top: extra?.vh ?? h, w, d, lit, shape: 'box', ...extra });
  switch (id) {
    case 'market': {
      if (rnd() < 0.05) { // open-air food stalls
        for (let k = 3 + Math.floor(rnd() * 4); k--;) {
          const c = pick([[3, 1.4, 0.5], [3, 0.4, 1.6], [0.6, 2.2, 2.6]], rnd);
          const sx_ = x + (rnd() - 0.5) * 16, sz_ = z + (rnd() - 0.5) * 16;
          o.strips.push({ x: sx_, y: 2.6, z: sz_, sx: 3, sy: 0.25, sz: 2, c: c.map((v) => v * 0.7) });
          o.props.push({ x: sx_, y: 1.2, z: sz_, sx: 2.8, sy: 2.4, sz: 1.8, c: [0.12, 0.11, 0.12] }); // the stall itself
        }
        o.vents.push({ x, y: 3, z });
        return null;
      }
      const b = B(10 + rnd() * 20 + rnd() ** 4 * 30, LOT - 2 - rnd() * 3, LOT - 2 - rnd() * 3, 0.5);
      if (rnd() < 0.25) addTiers(b, rnd, 1, b.h + 4 + rnd() * 5, o); // rooftop shack / extension
      addStrips(o.strips, b, 2 + Math.floor(rnd() * 4), rnd);
      if (rnd() < 0.2) addRod(o.strips, b, rnd);
      for (let k = 2 + Math.floor(rnd() * 4); k--;) addSign(o.signs, b, rnd, false);
      if (rnd() < 0.5) o.vents.push(roofPoint(b, rnd));
      if (rnd() < 0.35) o.fans.push({ ...roofPoint(b, rnd), r: 2 + rnd() * 2 });
      if (rnd() < 0.02) o.sparks.push({ x: b.x + b.w / 2 + 0.3, y: b.h * (0.3 + rnd() * 0.6), z: b.z });
      return b;
    }
    case 'spires': {
      if (rnd() < 0.08) return null;
      if (rnd() < 0.1) {
        const h = 140 + rnd() * 140;
        o.beacons.push({ x, y: h + 1, z });
        return B(h * 0.6, LOT - 1, LOT - 1, 0.3, { shape: 'pyramid', vh: h }); // collision box ≈ lower 60%
      }
      const total = 70 + rnd() ** 2 * 230 + (rnd() < 0.08 ? 220 : 0);
      const tiered = rnd() < 0.7;
      const b = B(tiered ? total * (0.45 + rnd() * 0.25) : total, LOT - 1.5 - rnd() * 3, LOT - 1.5 - rnd() * 3, 0.35);
      if (tiered) addTiers(b, rnd, 1 + Math.floor(rnd() * 3), total, o);
      if (rnd() < 0.4) addStrips(o.strips, b, 1 + Math.floor(rnd() * 2), rnd, true);
      if (rnd() < 0.55) addRod(o.strips, b, rnd);
      if (rnd() < 0.3) addSign(o.signs, b, rnd, true);
      let crown = b.top;
      if (b.top > 120 && rnd() < 0.5) { // antenna mast crown
        const mh = 12 + rnd() * 35;
        o.props.push({ x, y: b.top + mh / 2, z, sx: 0.6, sy: mh, sz: 0.6, c: CONCRETE });
        o.props.push({ x, y: b.top + 1.5, z, sx: 3, sy: 3, sz: 3, c: CONCRETE });
        crown += mh;
      }
      if (b.top > 100) o.beacons.push({ x, y: crown + 1.5, z });
      return b;
    }
    case 'stacks': {
      if (rnd() < 0.04) return null;
      const slab = (LOT - 2) * (0.45 + rnd() * 0.3), full = LOT - 2 - rnd() * 2, swap = rnd() < 0.5;
      const b = B(30 + rnd() * 60 + rnd() ** 3 * 70, swap ? slab : full, swap ? full : slab, 0.45);
      if (rnd() < 0.35) addTiers(b, rnd, 1, b.h + 6 + rnd() * 14, o); // setback penthouse floors
      else o.props.push({ x, y: b.h - 0.3, z, sx: b.w + 0.7, sy: 0.6, sz: b.d + 0.7, c: CONCRETE }); // roof parapet
      if (rnd() < 0.3) addStrips(o.strips, b, 1, rnd);
      if (rnd() < 0.3) addRod(o.strips, b, rnd);
      if (rnd() < 0.15) addSign(o.signs, b, rnd, false);
      if (rnd() < 0.3) o.fans.push({ ...roofPoint(b, rnd), r: 2 + rnd() * 2 });
      if (b.top > 110) o.beacons.push({ x, y: b.top + 1.5, z });
      return b;
    }
    case 'docks': {
      const r = rnd();
      if (r < 0.3) { crane(o, x, z, rnd); return null; }
      if (r < 0.55) return containers(o, x, z, rnd);
      const b = B(8 + rnd() * 16, LOT - 1.5, LOT - 1.5, 0.12);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        o.strips.push({ x: x + sx * (b.w / 2 - 1), y: b.h + 1, z: z + sz * (b.d / 2 - 1), sx: 0.7, sy: 0.4, sz: 0.7, c: SODIUM });
      }
      if (rnd() < 0.3) o.vents.push(roofPoint(b, rnd));
      if (rnd() < 0.06) o.sparks.push({ x: b.x + b.w / 2 + 0.3, y: b.h * 0.6, z: b.z });
      return b;
    }
    default: { // outskirts
      if (rnd() < 0.55) return null;
      const b = B(5 + rnd() * 14 + (rnd() < 0.06 ? 40 + rnd() * 60 : 0), LOT - 4 - rnd() * 7, LOT - 4 - rnd() * 7, 0.05);
      if (rnd() < 0.06) addStrips(o.strips, b, 1, rnd);
      if (rnd() < 0.03) { addSign(o.signs, b, rnd, false); o.signs.at(-1).flick = 1; }
      return b;
    }
  }
}

// Rooftop clutter (Blender kit, public/models/kit.glb): which props each district's roofs get, and how many.
export const KIT = ['WaterTank', 'ACUnit', 'Dish', 'StairHouse', 'VentStack', 'Antenna', 'UtilityBox', 'Duct', 'SolarPanel'];
const CLUTTER = {
  market: { n: [1, 3], pick: ['WaterTank', 'ACUnit', 'ACUnit', 'VentStack', 'Dish', 'UtilityBox', 'Duct'] },
  stacks: { n: [1, 4], pick: ['WaterTank', 'Dish', 'StairHouse', 'ACUnit', 'Antenna', 'SolarPanel', 'UtilityBox'] },
  spires: { n: [0, 2], pick: ['ACUnit', 'ACUnit', 'Antenna', 'SolarPanel'] },
  docks: { n: [0, 2], pick: ['VentStack', 'ACUnit', 'Duct', 'UtilityBox'] },
  outskirts: { n: [0, 1], pick: ['WaterTank', 'Antenna', 'SolarPanel'] },
};
function addClutter(out, b, id, rnd) {
  const C = CLUTTER[id], r = roofOf(b);
  if (r.w < 7 || r.d < 7) return;
  for (let k = C.n[0] + Math.floor(rnd() * (C.n[1] - C.n[0] + 1)); k--;) {
    out.push({
      type: pick(C.pick, rnd), x: b.x + (rnd() - 0.5) * (r.w - 6), y: b.top, z: b.z + (rnd() - 0.5) * (r.d - 6),
      rot: Math.floor(rnd() * 4) * Math.PI / 2, s: 0.85 + rnd() * 0.4,
    });
  }
}

export function generateCityData(seed) {
  const rnd = mulberry32(seed);
  const lots = new Array(LOTS * LOTS).fill(null);
  const o = { buildings: [], props: [], strips: [], signs: [], beacons: [], fans: [], vents: [], sparks: [], clutter: [] };
  for (let bz = 0; bz < GRID; bz++)
    for (let bx = 0; bx < GRID; bx++)
      for (let lz = 0; lz < 2; lz++)
        for (let lx = 0; lx < 2; lx++) {
          const x = -HALF + bx * BLOCK + ROAD / 2 + lx * LOT + LOT / 2;
          const z = -HALF + bz * BLOCK + ROAD / 2 + lz * LOT + LOT / 2;
          const di = districtAt(x, z, seed);
          const b = genLot(DISTRICTS[di].id, x, z, rnd, o);
          if (!b) continue;
          if (!b.hidden && b.shape === 'box') addClutter(o.clutter, b, DISTRICTS[di].id, rnd);
          b.seed = rnd();
          b.district = di;
          o.buildings.push(b);
          lots[(bz * 2 + lz) * LOTS + bx * 2 + lx] = b;
        }

  // Sea wall against the dark ocean, sodium lamps facing the city.
  const wall = { x: HALF + 22, z: 0, w: 14, d: HALF * 2 + 800, h: 48 };
  o.props.push({ x: wall.x, y: wall.h / 2, z: 0, sx: wall.w, sy: wall.h, sz: wall.d, c: [0.16, 0.17, 0.19] });
  for (let zz = -HALF - 380; zz < HALF + 380; zz += 32) {
    o.strips.push({ x: wall.x - wall.w / 2 - 0.3, y: wall.h - 3, z: zz, sx: 0.4, sy: 0.6, sz: 3, c: SODIUM });
  }
  return { seed, lots, extras: [wall], ...o };
}

export function lotAt(city, x, z) {
  const bx = Math.floor((x + HALF) / BLOCK), bz = Math.floor((z + HALF) / BLOCK);
  if (bx < 0 || bz < 0 || bx >= GRID || bz >= GRID) return null;
  const lx = x + HALF - bx * BLOCK - ROAD / 2, lz = z + HALF - bz * BLOCK - ROAD / 2;
  if (lx < 0 || lz < 0 || lx >= 2 * LOT || lz >= 2 * LOT) return null;
  return city.lots[(bz * 2 + Math.floor(lz / LOT)) * LOTS + bx * 2 + Math.floor(lx / LOT)];
}

// Soft collision: push the sphere out along the shallowest axis and keep tangential speed (slide).
export function resolveCollision(city, pos, vel, r) {
  let hit = false;
  const seen = new Set();
  for (const dx of [-r, r])
    for (const dz of [-r, r]) {
      const b = lotAt(city, pos.x + dx, pos.z + dz);
      if (!b || seen.has(b)) continue;
      seen.add(b);
      hit = collideBox(b, pos, vel, r) || hit;
      // Tiers shrink upward, so ground-to-top boxes per tier union to the exact stepped shape.
      for (const t of b.tiers ?? []) hit = collideBox({ x: b.x, z: b.z, w: t.w, d: t.d, h: t.h }, pos, vel, r) || hit;
    }
  for (const e of city.extras ?? []) hit = collideBox(e, pos, vel, r) || hit;
  return hit;
}

// Is (x,y,z) inside building b's visible volume (base box or any tier), grown by margin m?
export function solidAt(b, x, y, z, m = 0) {
  if (!b || b.hidden) return false;
  const inBox = (w, d, h) => y < h + m && Math.abs(x - b.x) < w / 2 + m && Math.abs(z - b.z) < d / 2 + m;
  return inBox(b.w, b.d, b.vh) || (b.tiers ?? []).some((t) => inBox(t.w, t.d, t.h));
}

function collideBox(b, pos, vel, r) {
  const hx = b.w / 2 + r, hz = b.d / 2 + r;
  const ox = pos.x - b.x, oz = pos.z - b.z;
  if (Math.abs(ox) >= hx || Math.abs(oz) >= hz || pos.y >= b.h + r) return false;
  const px = hx - Math.abs(ox), pz = hz - Math.abs(oz), py = b.h + r - pos.y;
  if (py <= px && py <= pz) {
    pos.y = b.h + r;
    if (vel.y < 0) vel.y = 0;
  } else if (px <= pz) {
    const s = Math.sign(ox) || 1;
    pos.x = b.x + s * hx;
    if (vel.x * s < 0) vel.x *= -0.15;
    vel.z *= 0.97;
  } else {
    const s = Math.sign(oz) || 1;
    pos.z = b.z + s * hz;
    if (vel.z * s < 0) vel.z *= -0.15;
    vel.x *= 0.97;
  }
  return true;
}

// ---------------------------------------------------------------- meshes

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function buildingMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.45, metalness: 0.35 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed; attribute float aLit; varying float vSeed; varying float vLit; varying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vWN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWPos = (modelMatrix * wp).xyz; vSeed = aSeed; vLit = aLit;`);
    // Facade: one world-space grid (1.7 m × 2.6 m cells) drives structure, grime, glass and the rooms behind it.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWindow; varying float vSeed; varying float vLit; varying vec3 vWPos; varying vec3 vWN;
        float nhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(nhash(i), nhash(i + vec2(1, 0)), f.x), mix(nhash(i + vec2(0, 1)), nhash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 an = abs(vWN);
        bool wall = an.y < 0.5;
        bool axial = max(an.x, an.z) > 0.9; // pyramids' slanted faces skip the room trick
        bool xFace = an.x > an.z;
        float u = xFace ? vWPos.z : vWPos.x;
        vec2 g = vec2(u / 1.7, vWPos.y / 2.6), cell = floor(g), f = fract(g);
        vec2 id = cell + vec2(vSeed * 91.7, (xFace ? sign(vWN.x) : 2.0 * sign(vWN.z)) * 13.1);
        float frame = wall ? step(0.12, f.x) * step(f.x, 0.88) * step(0.2, f.y) * step(f.y, 0.84) : 0.0;
        if (wall) {
          float slab = 1.0 - 0.45 * step(f.y, 0.12);                                   // floor-slab band
          float pil = 1.0 + 0.25 * step(mod(cell.x + floor(vSeed * 7.0), 5.0), 0.5) * step(f.x, 0.12); // structural pilasters
          float streak = vnoise(vec2(u * 0.9, vWPos.y * 0.035 + vSeed * 30.0));             // rain-stain streaks run down
          float grime = mix(1.0, 0.62, smoothstep(0.55, 0.85, streak));
          float wetBase = 1.0 - 0.35 * smoothstep(9.0, 0.0, vWPos.y);
          diffuseColor.rgb *= slab * pil * grime * wetBase;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.018, 0.028), frame);       // dark glass
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vWN.y > 0.5) roughnessFactor = 0.08;              // rain-slick rooftops
        roughnessFactor = mix(roughnessFactor, 0.05, frame);   // glass mirrors the city (env cube)`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.85, frame);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (frame > 0.0) {
          float h = nhash(id);
          float flick = nhash(id + floor(uTime * 0.07 + h * 50.0)); // windows switch on/off over time
          float lit = step(1.0 - vLit * 0.55, h) * step(0.1, flick);
          if (lit > 0.0) {
            vec3 wc = mix(vec3(0.3, 0.68, 1.0), vec3(0.8, 0.93, 1.0), nhash(id + 5.1)); // mostly cool rooms
            if (nhash(id + 7.3) > 0.85) wc = vec3(1.0, 0.55, 0.28);                     // a few warm ones
            float life = nhash(id + 11.7);
            if (life < 0.1) wc = vec3(0.3, 0.45, 1.0) * (0.5 + 0.5 * sin(uTime * (3.0 + life * 60.0) + h * 20.0)); // TV glow
            vec3 room = wc;
            if (axial) {
              // Interior mapping: trace the view ray into a 1.7 × 2.6 × 3.2 m box room behind this window.
              vec3 V = normalize(vWPos - cameraPosition);
              vec3 N = xFace ? vec3(sign(vWN.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(vWN.z));
              vec3 T = xFace ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
              vec3 d = vec3(dot(V, T), V.y, max(dot(V, -N), 1e-3));
              vec3 sz = vec3(1.7, 2.6, 3.2), p = vec3(f * sz.xy, 0.0);
              vec3 tt = (step(0.0, d) * sz - p) / d;
              float t = min(min(tt.x, tt.y), tt.z);
              vec3 hit = p + d * t;
              if (t == tt.z) {                                    // back wall
                room = wc * 0.75;
                float furn = nhash(id + 21.0);                    // sofa / shelves / desk silhouettes
                if (hit.y < 0.55 + furn * 0.5 && abs(hit.x - sz.x * (0.3 + furn * 0.4)) < 0.45) room *= 0.25;
                if (life > 0.5 && life < 0.62) room *= 0.55 + 0.45 * step(0.5, fract(hit.y * 7.0)); // blinds
                if (life > 0.9 && abs(hit.x - sz.x * 0.5) < 0.22 && hit.y < 1.75) room *= 0.07;    // someone standing there
              } else if (t == tt.y) room = d.y < 0.0 ? wc * 0.22                                   // floor
                : wc * (0.6 + 0.9 * exp(-6.0 * dot(hit.xz - sz.xz * 0.5, hit.xz - sz.xz * 0.5) / 4.0)); // ceiling lamp pool
              else room = wc * 0.5;                                                                 // side walls
              room *= mix(1.15, 0.6, hit.z / sz.z);               // falloff into the room
            }
            float bright = 0.22 + 0.6 * pow(nhash(id + 3.1), 2.0); // rooms stay under the bloom threshold: lived-in, not glaring
            totalEmissiveRadiance += room * bright * uWindow;
          }
        }`);
  };
  return mat;
}

function instanced(geo, mat, items, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => place(it, i, mesh));
  return mesh;
}

function buildingMesh(geo, mat, list) {
  const seeds = new Float32Array(list.length), lit = new Float32Array(list.length);
  const mesh = instanced(geo, mat, list, (b, i, m) => {
    m.setMatrixAt(i, _m.compose(_p.set(b.x, b.y0 ?? 0, b.z), _q.identity(), _s.set(b.w, b.vh, b.d)));
    m.setColorAt(i, _c.setHSL(0.58 + b.seed * 0.05, 0.3, 0.28 + b.seed * 0.2)); // blue-steel
    seeds[i] = b.seed; lit[i] = b.lit;
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
  return mesh;
}

function blinkMaterial(uniforms, color) {
  const mat = new THREE.MeshBasicMaterial({ color });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vBl;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vBl = fract(uTime * 0.7 + fract(instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBl;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= step(vBl, 0.12) + 0.03;');
  };
  return mat;
}

export function buildCityMeshes(city) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uWindow: { value: 1 }, uRain: { value: 0.6 } };
  const bMat = buildingMaterial(uniforms);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const pyrGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const visible = city.buildings.filter((b) => !b.hidden);
  // Each tier is one more box instance, sitting on the tier below (windows stay continuous: world-space grid).
  const boxes = visible.filter((b) => b.shape === 'box').flatMap((b) => [b, ...(b.tiers ?? []).map((t, i, all) => {
    const y0 = i ? all[i - 1].h : b.h;
    return { ...b, y0, w: t.w, d: t.d, vh: t.h - y0 };
  })]);
  const pyrs = visible.filter((b) => b.shape === 'pyramid');
  const boxMesh = buildingMesh(boxGeo, bMat, boxes), pyrMesh = buildingMesh(pyrGeo, bMat, pyrs);
  group.add(boxMesh, pyrMesh);

  // Cranes, containers, sea wall.
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45 }), city.props, (p, i, m) => {
    m.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(p.sx, p.sy, p.sz)));
    m.setColorAt(i, _c.setRGB(...p.c));
  }));

  // Neon strips + sodium lamps: HDR colour > 1 so bloom catches them; no real lights.
  const stripMesh = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), city.strips, (st, i, m) => {
    m.setMatrixAt(i, _m.compose(_p.set(st.x, st.y, st.z), _q.identity(), _s.set(st.sx, st.sy, st.sz)));
    m.setColorAt(i, _c.setRGB(...st.c));
  });
  group.add(stripMesh);

  // Amber marker lights lining both edges of every road (the wet street reflects them).
  const markers = [];
  for (let i = 0; i <= GRID; i++) {
    const c = -HALF + i * BLOCK;
    for (let t = -HALF + 4; t < HALF; t += 10) {
      if (Math.abs(((t + HALF) % BLOCK) - BLOCK / 2) > LOT) continue; // skip across intersections
      for (const e of [-ROAD / 2 + 0.6, ROAD / 2 - 0.6]) markers.push([t, c + e], [c + e, t]);
    }
  }
  group.add(instanced(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 2.2, 0.6) }), markers, ([x, z], i, m) => {
    m.setMatrixAt(i, _m.makeTranslation(x, 0.1, z));
  }));

  // Blinking aircraft beacons.
  group.add(instanced(new THREE.SphereGeometry(0.9, 8, 6), blinkMaterial(uniforms, new THREE.Color(7, 0.4, 0.25)), city.beacons, (b, i, m) => {
    m.setMatrixAt(i, _m.makeTranslation(b.x, b.y, b.z));
  }));

  // Rooftop fans: spun in the vertex shader, zero CPU per frame.
  const blade = mergeGeometries([new THREE.BoxGeometry(1, 0.08, 0.16), new THREE.BoxGeometry(0.16, 0.08, 1)]);
  const fanMat = new THREE.MeshStandardMaterial({ color: 0x222830, roughness: 0.6, metalness: 0.5 });
  fanMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float fa = uTime * 4.0 + instanceMatrix[3].x * 0.37;
          transformed.xz = mat2(cos(fa), -sin(fa), sin(fa), cos(fa)) * transformed.xz;
        #endif`);
  };
  group.add(instanced(blade, fanMat, city.fans, (f, i, m) => {
    m.setMatrixAt(i, _m.compose(_p.set(f.x, f.y + 1.2, f.z), _q.identity(), _s.set(f.r * 2, 1, f.r * 2)));
  }));
  group.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1e24, side: THREE.DoubleSide }), city.fans, (f, i, m) => {
    m.setMatrixAt(i, _m.compose(_p.set(f.x, f.y + 0.7, f.z), _q.identity(), _s.set(f.r * 1.05, 1.4, f.r * 1.05)));
  }));

  // Wet ground (stops at the sea wall): noise puddles with animated rain ripples bending the normal.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.4, metalness: 0.6, ...pbrMaps('Asphalt033', 400) });
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uRain; varying vec3 vGW;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float pud = smoothstep(0.48, 0.62, gnoise(vGW.xz * 0.035) * 0.7 + gnoise(vGW.xz * 0.21) * 0.3);
        roughnessFactor = mix(0.42, 0.03, pud);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 rp = vGW.xz / 1.3, rc = floor(rp);
          float rh = h21(rc), rt = fract(uTime * 0.9 + rh);
          vec2 rd = fract(rp) - 0.5 - (vec2(rh, fract(rh * 7.13)) - 0.5) * 0.4;
          float rl = max(length(rd), 1e-3);
          float ring = exp(-pow((rl - rt * 0.45) * 28.0, 2.0)) * (1.0 - rt);
          vec2 g = rd / rl * ring * 0.45 * pud * uRain;
          normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);
        }`);
  };
  const seaEdge = HALF + 29, gw = seaEdge + HALF * 3;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, HALF * 6), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = seaEdge - gw / 2;
  group.add(ground);

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 3, HALF * 6), new THREE.MeshStandardMaterial({ color: 0x02060c, roughness: 0.12, metalness: 0.9 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(seaEdge + HALF * 1.5, -1.5, 0);
  group.add(ocean);

  return { group, uniforms, stripMesh, buildings: [[boxMesh, boxes], [pyrMesh, pyrs]] };
}
