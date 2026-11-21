import { DEFAULT_LOOK, FINISHES, DASH_THEMES } from '../car/car.js';
import { select, slider } from './drawer.js';
import { load, store } from '../core/save.js';

const HEX = /^#[0-9a-f]{6}$/i;
const BODIES = [['coupe', 'Sleek coupe'], ['cab', 'Boxy cab'], ['cruiser', 'Heavy cruiser']];

// Only known values survive a load, so a hand-edited or old save can't break the car.
export function cleanLook(raw) {
  const L = { ...DEFAULT_LOOK };
  if (!raw || typeof raw !== 'object') return L;
  if (typeof raw.name === 'string' && raw.name.trim()) L.name = raw.name.trim().slice(0, 18);
  if (BODIES.some(([k]) => k === raw.body)) L.body = raw.body;
  if (FINISHES[raw.finish]) L.finish = raw.finish;
  if (DASH_THEMES[raw.dash]) L.dash = raw.dash;
  for (const k of ['paint', 'underglow', 'interior']) if (HEX.test(raw[k])) L[k] = raw[k];
  if (Number.isFinite(raw.engine)) L.engine = Math.min(1.5, Math.max(0.6, raw.engine));
  return L;
}

export function createGarage(pane, car) {
  const look = cleanLook(load('nd.car', null));
  car.applyLook(look);
  const set = (k, v) => { look[k] = v; car.applyLook(look); store('nd.car', look); };

  pane.append(Object.assign(document.createElement('h3'), { textContent: 'NAME' }));
  const name = Object.assign(document.createElement('input'), { value: look.name, maxLength: 18, className: 'name' });
  name.onchange = () => { if (name.value.trim()) set('name', name.value.trim()); };
  pane.append(name);

  pane.append(Object.assign(document.createElement('h3'), { textContent: 'BODY' }));
  select(pane, 'Shape', BODIES, look.body, (v) => set('body', v));
  const color = (label, k) => {
    const i = Object.assign(document.createElement('input'), { type: 'color', value: look[k], className: 'swatch' });
    i.oninput = () => set(k, i.value);
    const l = document.createElement('label');
    l.append(Object.assign(document.createElement('span'), { textContent: label }), i);
    pane.append(l);
  };
  color('Paint', 'paint');
  select(pane, 'Finish', [['gloss', 'Gloss'], ['matte', 'Matte'], ['iridescent', 'Iridescent']], look.finish, (v) => set('finish', v));

  pane.append(Object.assign(document.createElement('h3'), { textContent: 'LIGHTS & CABIN' }));
  color('Underglow', 'underglow');
  color('Interior light', 'interior');
  select(pane, 'Dashboard', [['cyan', 'Cyan'], ['red', 'Red alert'], ['amber', 'Amber'], ['mono', 'Mono']], look.dash, (v) => set('dash', v));
  slider(pane, 'Engine hum', { min: 0.6, max: 1.5, step: 0.05, value: look.engine }, (v) => set('engine', v));
  return look;
}
