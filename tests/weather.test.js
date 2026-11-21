import test from 'node:test';
import assert from 'node:assert/strict';
import { Weather, WEATHER } from '../src/atmosphere/weather.js';

test('weather blends ~all the way in 30 s, not instantly', () => {
  const w = new Weather('drizzle');
  w.auto = false;
  w.set('fog');
  w.update(1 / 60);
  assert.ok(w.p.fog < 0.004, 'no jump on the first frame');
  for (let i = 0; i < 30 * 60; i++) w.update(1 / 60);
  const span = WEATHER.fog.fog - WEATHER.drizzle.fog;
  assert.ok(w.p.fog > WEATHER.drizzle.fog + span * 0.95);
});

test('downpour lightning fires thunder', () => {
  const w = new Weather('downpour');
  w.auto = false;
  let thunder = 0;
  w.onThunder = (delay) => { assert.ok(delay > 0); thunder++; };
  for (let i = 0; i < 60 * 60; i++) w.update(1 / 60);
  assert.ok(thunder >= 2);
});

test('auto weather only picks known states', () => {
  const w = new Weather();
  for (let i = 0; i < 50; i++) { w.autoTimer = 0; w.update(0.01); assert.ok(WEATHER[w.key]); }
});
