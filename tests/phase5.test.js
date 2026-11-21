import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateCityData, lotAt } from '../src/world/city.js';
import { choosePads, clearPadRoofs, PAD_R } from '../src/world/pads.js';
import { createAutopilot, SCENIC, wrapAngle } from '../src/car/autopilot.js';
import { fly } from '../src/car/car.js';
import { burstAt } from '../src/fx/fireworks.js';

const city = generateCityData(2049);
const pads = choosePads(city);

test('pads: deterministic, one Home, spaced out, on roofs wide enough to land', () => {
  assert.deepEqual(choosePads(generateCityData(2049)).map((p) => p.id), pads.map((p) => p.id));
  assert.equal(pads.filter((p) => p.type === 'home').length, 1);
  assert.ok(pads.length >= 10, `only ${pads.length} pads`);
  for (const p of pads) {
    const b = lotAt(city, p.x, p.z);
    assert.ok(b && !b.hidden && b.shape === 'box' && b.top === p.y, `${p.name} not on a roof`);
    const r = b.tiers?.at(-1) ?? b;
    assert.ok(Math.min(r.w, r.d) >= 2 * PAD_R, `${p.name} roof too small`);
    for (const q of pads) if (q !== p) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 140);
  }
});

test('pads: roof props are cleared off the decks', () => {
  const c = generateCityData(2049);
  clearPadRoofs(c, pads);
  for (const o of [...c.clutter, ...c.fans, ...c.vents])
    for (const p of pads) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) > PAD_R + 2.5 || o.y < p.y - 1);
});

test('scenic loop: every leg runs along a road (no buildings on the line)', () => {
  SCENIC.forEach((a, i) => {
    const b = SCENIC[(i + 1) % SCENIC.length];
    assert.ok(a.x === b.x || a.z === b.z, `leg ${i} is diagonal`);
    for (let k = 0; k <= 1; k += 0.01) assert.equal(lotAt(city, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k), null, `leg ${i} hits a lot`);
  });
});

test('wrapAngle keeps angles in (-π, π]', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapAngle(3 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-0.5 - 4 * Math.PI) + 0.5) < 1e-9);
});

const body = (x, y, z, yaw = 0) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw, yawRate: 0, get speed() { return this.vel.length(); } });

test('autopilot flies the real flight model to a pad and docks on it', () => {
  for (const pad of [pads[0], pads.at(-1)]) {
    const car = body(0, 120, 40, 2), ap = createAutopilot(city);
    ap.start(pad, car);
    let docked = false;
    for (let i = 0; i < 30 * 240 && !docked; i++) {
      docked = ap.update(1 / 30, car) === 'docked';
      fly(car, ap.input, 1 / 30, city);
    }
    assert.ok(docked, `never docked at ${pad.name} (ended ${Math.round(Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z))} m away)`);
    assert.ok(Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z) < 6, 'docked off the deck');
  }
});

test('scenic loop keeps going round without stalling', () => {
  const car = body(SCENIC[0].x, 110, SCENIC[0].z), ap = createAutopilot(city);
  ap.start(null, car);
  const seen = new Set();
  for (let i = 0; i < 30 * 600; i++) { ap.update(1 / 30, car); fly(car, ap.input, 1 / 30, city); seen.add(ap.wp); }
  assert.equal(seen.size, SCENIC.length, `only reached ${seen.size} waypoints`);
});

test('fireworks burst above the city', () => {
  for (let c = 0; c < 50; c++) { const [, y] = burstAt(3, c); assert.ok(y >= 170 && y <= 330); }
});
