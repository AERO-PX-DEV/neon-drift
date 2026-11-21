import test from 'node:test';
import assert from 'node:assert/strict';
import { districtAt, DISTRICTS } from '../src/world/districts.js';
import { HALF } from '../src/world/layout.js';
import { generateCityData } from '../src/world/city.js';

test('every district exists and the layout is deterministic', () => {
  const seen = new Set();
  for (let x = -HALF; x < HALF; x += 40) for (let z = -HALF; z < HALF; z += 40) {
    const d = districtAt(x, z, 2049);
    assert.equal(d, districtAt(x, z, 2049));
    seen.add(DISTRICTS[d].id);
  }
  assert.equal(seen.size, 5);
  assert.equal(DISTRICTS[districtAt(0, 0, 2049)].id, 'spires');
  assert.equal(DISTRICTS[districtAt(HALF * 0.9, 0, 2049)].id, 'docks');
});

test('city generates district content and a collidable sea wall', () => {
  const c = generateCityData(2049);
  for (const k of ['signs', 'beacons', 'fans', 'vents', 'sparks', 'props', 'strips', 'clutter']) assert.ok(c[k].length > 0, k);
  assert.ok(c.buildings.some((b) => b.tiers?.length), 'some towers have setbacks');
  assert.ok(c.buildings.some((b) => b.shape === 'pyramid'));
  assert.equal(c.extras.length, 1);
});
