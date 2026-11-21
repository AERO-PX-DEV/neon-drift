import { lotAt } from '../world/city.js';
import { roadCoord } from '../world/layout.js';

// Scenic loop: [roadX, roadZ, altitude]. Consecutive points share a road, so every leg runs down a street
// canyon: the central avenue through the Spires, out along the docks, back through Market and Stacks.
export const SCENIC = [[16, 5, 110], [16, 26, 85], [27, 26, 50], [27, 9, 55], [9, 9, 80], [9, 22, 60], [4, 22, 120], [4, 5, 100]]
  .map(([i, j, alt]) => ({ x: roadCoord(i), z: roadCoord(j), alt }));

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

// Highest roof (+ margin) near the line from (x,z) heading along (dx,dz), looking `range` metres ahead.
function clearance(city, x, z, dx, dz, range) {
  let top = 0;
  const len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  for (let d = 0; d <= range; d += 8)
    for (const side of [-7, 0, 7]) {
      const b = lotAt(city, x + ux * d - uz * side, z + uz * d + ux * side);
      if (b && !b.hidden) top = Math.max(top, (b.shape === 'pyramid' ? b.vh : b.top) + 16);
    }
  return top;
}

// Flies the car by producing the same axis values the keyboard would. Car conventions: yaw 0 faces −Z,
// +turn (left) raises yaw, forward = (−sin yaw, −cos yaw), right = (cos yaw, −sin yaw).
export function createAutopilot(city) {
  const v = {};
  const ap = {
    on: false, dest: null, wp: 0, state: 'off', // dest: null = scenic loop, else a pad
    input: { axis: (p, n) => (v[p] ?? 0) - (v[n] ?? 0), held: () => false },
    get label() { return this.dest ? `→ ${this.dest.name}` : 'Scenic loop'; },
    start(dest, car) {
      ap.on = true; ap.dest = dest ?? null; ap.state = 'cruise';
      if (!ap.dest) ap.wp = SCENIC.reduce((best, p, i) => (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < Math.hypot(SCENIC[best].x - car.pos.x, SCENIC[best].z - car.pos.z) ? i : best), 0);
    },
    stop() { ap.on = false; ap.state = 'off'; for (const k in v) v[k] = 0; },

    // Returns 'docked' on the frame it touches down on its destination pad.
    update(dt, car) {
      for (const k in v) v[k] = 0;
      if (!ap.on) return ap.state;
      const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
      let tx, tz, alt;
      if (ap.dest) ({ x: tx, z: tz } = ap.dest);
      else {
        const p = SCENIC[ap.wp];
        if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 30) ap.wp = (ap.wp + 1) % SCENIC.length;
        ({ x: tx, z: tz, alt } = SCENIC[ap.wp]);
      }
      const dx = tx - car.pos.x, dz = tz - car.pos.z, dist = Math.hypot(dx, dz);
      const fwd = -car.vel.x * s - car.vel.z * c;
      let want = ap.dest ? Math.min(55, Math.max(2, dist * 0.45)) : 24; // scenic: ~85 km/h
      let wantAlt = alt ?? 0;

      if (ap.dest) {
        ap.state = dist < 8 ? 'landing' : 'cruise';
        wantAlt = dist < 6 ? ap.dest.y + 1 : Math.max(ap.dest.y + 18, clearance(city, car.pos.x, car.pos.z, dx, dz, Math.min(dist, 160)));
        // Final approach: trim sideways drift with strafe so it settles on the deck instead of circling.
        if (dist < 25) v.strafeR = clamp((dx * c - dz * s) * 0.15 - (car.vel.x * c - car.vel.z * s) * 0.2);
        if (ap.state === 'landing' && car.pos.y < ap.dest.y + 4 && car.speed < 4) { ap.stop(); return 'docked'; }
      } else {
        wantAlt = Math.max(wantAlt, clearance(city, car.pos.x, car.pos.z, -s, -c, 90), clearance(city, car.pos.x, car.pos.z, dx, dz, 90));
      }

      const err = wrapAngle(Math.atan2(-dx, -dz) - car.yaw);
      if (dist > 6) { const t = clamp(err * 1.6); v.left = Math.max(0, t); v.right = Math.max(0, -t); }
      if (ap.dest && dist < 25) want = clamp((-dx * s - dz * c) * 0.45, -8, 12); // close in along the nose axis, backing up if it overshot
      else want *= 1 - Math.min(1, Math.abs(err) / 1.4) * 0.75; // ease off through tight turns
      if (car.pos.y < wantAlt - 12) want *= 0.25;          // climb before pushing on into taller blocks
      const thrust = clamp((want - fwd) * 0.12 + want * 0.0131); // 0.0131 = forward drag / accel (0.55/42): holds `want` m/s
      v.forward = Math.max(0, thrust); v.back = Math.max(0, -thrust);
      const wantVy = clamp((wantAlt - car.pos.y) * 0.5, -10, 12);
      const lift = clamp((wantVy - car.vel.y) * 0.25 + wantVy / 13.3); // 13.3 = steady climb rate at full lift
      v.up = Math.max(0, lift); v.down = Math.max(0, -lift);
      return ap.state;
    },
  };
  return ap;
}
