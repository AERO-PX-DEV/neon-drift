import { load, store } from './save.js';

// Action → key codes. Plain data: the Settings tab rebinds it and saves the changes (nd.bindings).
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['Space'],
  down: ['KeyF', 'ControlLeft', 'ControlRight'],
  strafeL: ['KeyQ'],
  strafeR: ['KeyE'],
  boost: ['ShiftLeft', 'ShiftRight'],
  camera: ['KeyC'],
  hud: ['KeyH'],
  wipers: ['KeyV'],
  radio: ['KeyR'],
  next: ['KeyN'],
  menu: ['Escape'],
  autopilot: ['KeyT'],
  builder: ['KeyB'],
  dock: ['KeyG'],
  place: ['Enter'],
  map: ['KeyM'],
  photo: ['KeyP'],
};
export const bindings = structuredClone(DEFAULT_BINDINGS);
const saved = load('nd.bindings', {});
for (const [a, codes] of Object.entries(saved ?? {})) {
  if (bindings[a] && Array.isArray(codes) && codes.length && codes.every((c) => typeof c === 'string' && c.length < 32)) bindings[a] = codes;
}
export const saveBindings = () => store('nd.bindings', bindings);
export function resetBindings() { Object.assign(bindings, structuredClone(DEFAULT_BINDINGS)); store('nd.bindings', {}); }

// Standard-mapping gamepad: left stick flies, right stick X strafes, triggers climb/descend.
const PAD_BUTTONS = {
  boost: 0, dock: 1, wipers: 2, camera: 3, autopilot: 4, next: 5, hud: 8, menu: 9, photo: 10, radio: 12, map: 13, builder: 14, place: 15,
};
const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

const held = new Set();
const pressed = new Set();
const pad = {}, padPrev = new Set(), padPressed = new Set();
let lastActive = performance.now(), padName = '';
const gameCodes = () => new Set(Object.values(bindings).flat());

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea') && e.code !== 'Escape') return; // typing in the UI
  if (gameCodes().has(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  lastActive = performance.now();
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('pointerdown', () => (lastActive = performance.now()));
addEventListener('blur', () => held.clear());

function pollPad() {
  for (const k in pad) pad[k] = 0;
  padPressed.clear();
  const gp = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
  padName = gp?.id ?? '';
  if (!gp) { padPrev.clear(); return; }
  const ax = (i) => dz(gp.axes[i] ?? 0), btn = (i) => gp.buttons[i]?.value ?? 0;
  const lx = ax(0), ly = ax(1), rx = ax(2);
  pad.left = Math.max(0, -lx); pad.right = Math.max(0, lx);
  pad.forward = Math.max(0, -ly); pad.back = Math.max(0, ly);
  pad.strafeL = Math.max(0, -rx); pad.strafeR = Math.max(0, rx);
  pad.down = btn(6); pad.up = btn(7);
  const now = new Set();
  for (const [a, i] of Object.entries(PAD_BUTTONS)) if (btn(i) > 0.5) { pad[a] = 1; now.add(a); if (!padPrev.has(a)) padPressed.add(a); }
  padPrev.clear();
  now.forEach((a) => padPrev.add(a));
  if (now.size || Object.values(pad).some((v) => v > 0)) lastActive = performance.now();
}

export const input = {
  held: (a) => bindings[a].some((c) => held.has(c)) || (pad[a] ?? 0) > 0.5,
  pressed: (a) => bindings[a].some((c) => pressed.has(c)) || padPressed.has(a),
  // Keys give ±1; a stick gives anything in between. Whichever is pushed harder wins.
  axis(pos, neg) {
    const k = (bindings[pos].some((c) => held.has(c)) ? 1 : 0) - (bindings[neg].some((c) => held.has(c)) ? 1 : 0);
    const g = (pad[pos] ?? 0) - (pad[neg] ?? 0);
    return Math.abs(g) > Math.abs(k) ? g : k;
  },
  poll: pollPad,
  endFrame() { pressed.clear(); },
  get idle() { return (performance.now() - lastActive) / 1000; }, // seconds since the last key, click or stick
  get gamepad() { return padName; },
};
