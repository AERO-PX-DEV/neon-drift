import { DISTRICTS, districtAt } from '../world/districts.js';
import { HALF } from '../world/layout.js';
import { SCENIC } from '../car/autopilot.js';
import { PAD_TYPES } from '../world/pads.js';
import { button } from './drawer.js';

const TINT = { market: '#3a1720', spires: '#0f2a40', stacks: '#162235', docks: '#2e2410', outskirts: '#241d12' };
const css = (c) => `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

// Drawer Map tab: districts, the scenic loop, every pad (click one to fly there on autopilot), and you.
export function createMap(pane, { seed, pads, car, onPick }) {
  const S = 284, cv = Object.assign(document.createElement('canvas'), { width: S, height: S, className: 'map' });
  pane.append(cv);
  const g = cv.getContext('2d');
  const toPx = (x) => ((x / (HALF * 1.1)) * 0.5 + 0.5) * S;
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const bg = base.getContext('2d');
  for (let py = 0; py < S; py += 4)
    for (let px = 0; px < S; px += 4) {
      const x = ((px + 2) / S - 0.5) * 2 * HALF * 1.1, z = ((py + 2) / S - 0.5) * 2 * HALF * 1.1;
      bg.fillStyle = Math.max(Math.abs(x), Math.abs(z)) > HALF ? '#05070c' : TINT[DISTRICTS[districtAt(x, z, seed)].id];
      bg.fillRect(px, py, 4, 4);
    }
  const list = document.createElement('div');
  pane.append(list);

  function draw() {
    g.drawImage(base, 0, 0);
    g.strokeStyle = 'rgba(90,220,255,.35)'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath();
    SCENIC.forEach((p, i) => (i ? g.lineTo(toPx(p.x), toPx(p.z)) : g.moveTo(toPx(p.x), toPx(p.z))));
    g.closePath(); g.stroke(); g.setLineDash([]);
    for (const p of pads) {
      g.fillStyle = css(PAD_TYPES[p.type]?.color ?? [1, 1, 1]);
      g.beginPath(); g.arc(toPx(p.x), toPx(p.z), p.type === 'home' ? 5 : 3.5, 0, Math.PI * 2); g.fill();
    }
    const x = toPx(car.pos.x), y = toPx(car.pos.z), s = Math.sin(car.yaw), c = Math.cos(car.yaw);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(x - s * 8, y - c * 8); g.lineTo(x + c * 4 + s * 3, y - s * 4 + c * 3); g.lineTo(x - c * 4 + s * 3, y + s * 4 + c * 3); g.fill();
  }
  function renderList() {
    list.innerHTML = '';
    button(list, 'Scenic loop', () => onPick(null));
    for (const p of pads) button(list, p.name, () => onPick(p));
  }
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * S, my = ((e.clientY - r.top) / r.height) * S;
    let best = null, bd = 12;
    for (const p of pads) { const d = Math.hypot(toPx(p.x) - mx, toPx(p.z) - my); if (d < bd) { bd = d; best = p; } }
    if (best) onPick(best);
  });
  return { draw, renderList };
}
