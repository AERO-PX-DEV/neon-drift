import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCityData, lotAt, solidAt } from '../src/world/city.js';
import { chooseFragments, choosePhotoSpots, LORE } from '../src/world/fragments.js';
import { readSave } from '../src/core/save.js';
import { cleanLook } from '../src/ui/garage.js';
import { DEFAULT_LOOK } from '../src/car/car.js';

const city = generateCityData(2049);

test('fragments: one per lore entry, deterministic, spread out, never inside a building', () => {
  const f = chooseFragments(city);
  assert.equal(f.length, LORE.length);
  assert.deepEqual(chooseFragments(generateCityData(2049)), f);
  for (const a of f) {
    assert.ok(!solidAt(lotAt(city, a.x, a.z), a.x, a.y, a.z, 2), 'fragment inside a building');
    for (const b of f) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 180);
  }
});

test('photo spots exist and sit at sensible heights', () => {
  const s = choosePhotoSpots(city);
  assert.equal(s.length, 6);
  for (const p of s) assert.ok(p.y > 0 && p.y < 700 && p.name && p.hint);
});

test('save files: only NEON DRIFT saves with nd.* keys are accepted', () => {
  assert.throws(() => readSave({ app: 'other', data: {} }), /Not a NEON DRIFT save/);
  assert.throws(() => readSave({ app: 'neon-drift', data: { evil: 1 } }), /empty/);
  const e = readSave({ app: 'neon-drift', data: { 'nd.car': { body: 'cab' }, 'nd.world.2049': [], 'x.y': 1, 'nd.<script>': 2 } });
  assert.deepEqual(e.map(([k]) => k).sort(), ['nd.car', 'nd.world.2049']);
});

test('garage: unknown or broken values fall back to the defaults', () => {
  assert.deepEqual(cleanLook(null), DEFAULT_LOOK);
  const L = cleanLook({ body: 'tank', paint: 'red', finish: 'iridescent', engine: 99, name: '  Night Owl  ', dash: 'amber' });
  assert.equal(L.body, DEFAULT_LOOK.body);
  assert.equal(L.paint, DEFAULT_LOOK.paint);
  assert.equal(L.finish, 'iridescent');
  assert.equal(L.engine, 1.5);
  assert.equal(L.name, 'Night Owl');
  assert.equal(L.dash, 'amber');
});
