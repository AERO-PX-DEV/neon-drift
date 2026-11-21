import { HALF } from './layout.js';

// fog: tint added to the fog colour while you're inside the district.
export const DISTRICTS = [
  {
    id: 'market', name: 'Neon Market', mood: 'Crowded, hungry, electric', density: 'Very high', traffic: 1.2,
    fog: [0.03, 0.0, 0.02], flavour: 'Steam, noodle smoke and a thousand signs fighting for your eyes.',
  },
  {
    id: 'spires', name: 'Corporate Spires', mood: 'Cold, watchful, immaculate', density: 'High by day, hollow by night', traffic: 1.5,
    fog: [0.0, 0.02, 0.04], flavour: 'Kōsen Dynamics owns the sky above three hundred metres. They rent you the rest.',
  },
  {
    id: 'stacks', name: 'Residential Stacks', mood: 'Lonely, warm, half-asleep', density: 'Extreme', traffic: 0.8,
    fog: [0.0, 0.01, 0.02], flavour: 'Forty million windows. Someone is always awake.',
  },
  {
    id: 'docks', name: 'Industrial Docks', mood: 'Heavy, sodium-lit, tidal', density: 'Low', traffic: 0.6,
    fog: [0.08, 0.04, 0.0], flavour: 'The sea wall hums. Cargo drones never sleep, and neither does the ocean.',
  },
  {
    id: 'outskirts', name: 'The Outskirts', mood: 'Quiet, dusty, forgotten', density: 'Sparse', traffic: 0.15,
    fog: [0.09, 0.05, 0.0], flavour: 'Amber dust and empty towers. Nobody looks for you out here.',
  },
];

function h2(ix, iz, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz, s), b = h2(ix + 1, iz, s), c = h2(ix, iz + 1, s), d = h2(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Spires at the core, docks + sea wall to the east, outskirts at the rim, market/stacks patchwork between.
export function districtAt(x, z, seed) {
  const nx = x / HALF, nz = z / HALF;
  if (nx > 0.62) return 3;
  if (Math.hypot(nx, nz) < 0.3) return 1;
  if (Math.max(Math.abs(nx), Math.abs(nz)) > 0.84) return 4;
  return vnoise(x / 420, z / 420, seed) > 0.5 ? 0 : 2;
}
