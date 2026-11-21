import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCityData, lotAt, resolveCollision } from '../src/world/city.js';

test('same seed gives the same city', () => {
  const a = generateCityData(2049), b = generateCityData(2049), c = generateCityData(7);
  assert.deepEqual(a.buildings.slice(0, 20), b.buildings.slice(0, 20));
  assert.notDeepEqual(a.buildings[0], c.buildings[0]);
});

test('roads are empty', () => {
  const city = generateCityData(2049);
  assert.equal(lotAt(city, 0, 0), null); // x=0,z=0 is a road intersection
});

test('car inside a building is pushed out and slides', () => {
  const city = generateCityData(2049);
  const b = city.buildings.find((b) => b.h > 40);
  const pos = { x: b.x + b.w / 2 - 0.5, y: b.h / 2, z: b.z };
  const vel = { x: -20, y: 0, z: 10 };
  assert.ok(resolveCollision(city, pos, vel, 2.5));
  assert.ok(pos.x >= b.x + b.w / 2 + 2.5 - 1e-9, 'pushed out of the +x face');
  assert.ok(vel.x > 0 && vel.x < 5, 'bounced softly');
  assert.ok(vel.z > 9, 'kept sliding');
});

test('landing on a roof stops the fall', () => {
  const city = generateCityData(2049);
  const b = city.buildings.find((b) => !b.tiers && !b.hidden && b.shape === 'box');
  const pos = { x: b.x, y: b.h + 1, z: b.z }, vel = { x: 0, y: -5, z: 0 };
  resolveCollision(city, pos, vel, 2.5);
  assert.equal(pos.y, b.h + 2.5);
  assert.equal(vel.y, 0);
});

test('tiered towers collide as their stepped shape', () => {
  const city = generateCityData(2049);
  const b = city.buildings.find((b) => b.tiers?.length && b.w - b.tiers[0].w > 4);
  const t = b.tiers[0];
  // On the setback terrace, outside the upper tier: lands on the base roof.
  const terrace = { x: b.x + (b.w / 2 + t.w / 2) / 2, y: b.h + 1, z: b.z }, v1 = { x: 0, y: -5, z: 0 };
  resolveCollision(city, terrace, v1, 1);
  assert.equal(terrace.y, b.h + 1);
  // Flying into the upper tier's wall above the base: pushed out sideways, not up onto its roof.
  const wall = { x: b.x + t.w / 2 - 0.3, y: b.h + (t.h - b.h) / 2, z: b.z }, v2 = { x: -10, y: 0, z: 0 };
  assert.ok(resolveCollision(city, wall, v2, 1));
  assert.ok(wall.x >= b.x + t.w / 2 + 1 - 1e-9);
  assert.ok(wall.y < t.h);
});
