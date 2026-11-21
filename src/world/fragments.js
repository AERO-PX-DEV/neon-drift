import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DISTRICTS } from './districts.js';
import { HALF } from './layout.js';
import { lotAt, solidAt } from './city.js';

// Twelve memory fragments: each unlocks one City Log entry. All names and brands are invented.
export const LORE = [
  ['The First Rain', 'Nobody alive remembers the city dry. The oldest Kōsen archive just says: "Week 1. Rain began. Expected to clear by Thursday."'],
  ['Night Shift', 'Forty million people in the Stacks, and the lights never all go out. Someone is always on the night shift, and someone is always waiting up for them.'],
  ['Soma\'s Promise', 'Soma Noodle has served the same broth since before the Spires went up. The recipe is in a safe deposit box at Tokumei Bank. The bank closed years ago; the box is still paid for.'],
  ['Koi Season', 'The hologram koi were a Halcyon Bio art project meant to run for one summer. Nobody can find the switch, and nobody has looked very hard.'],
  ['Sea Wall', 'The sea wall was built in three weeks by forty thousand workers and has held for sixty years. On quiet nights it hums at exactly 50 Hz, the same as the grid.'],
  ['Vesper Airways Flight 0', 'Vesper Airways sold tickets for a flight to the stars that never left. The departure board at the old terminal still says ON TIME.'],
  ['Window 4417', 'A light in the Stacks has stayed on for eleven years. People leave flowers on the roof opposite. Nobody knows who lives there; everybody says goodnight to it.'],
  ['Pirate Radio', 'Before the stations, there was one voice on 88.1 that read the weather to the night drivers. Some say the late-night DJ is still the same person.'],
  ['The Blackout of \'31', 'For six hours the whole city went dark and, for the first time in a generation, people saw stars through the clouds. The power company still sends apologies every year.'],
  ['Yūrei Tea House', 'The tea house has no owner on record. The kettle is always warm and the bill is always "pay what the rain is worth."'],
  ['Outskirts', 'Out past the amber dust are towers nobody finished. Drivers who go there come back quieter, and say it was the best night of their year.'],
  ['Memory Reboot', 'Every fragment you found was a piece of somebody\'s ordinary night. The city doesn\'t remember people; people remember the city. Drive safe.'],
];

// Deterministic per seed, ≥ 180 m apart: half float above roofs, half hide low in the street canyons.
export function chooseFragments(city) {
  const rnd = mulberry32(city.seed ^ 0xf4a6);
  const cand = city.buildings.filter((b) => !b.hidden && b.shape === 'box').map((b) => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const out = [];
  for (const b of cand) {
    if (out.length >= LORE.length) break;
    if (out.some((f) => Math.hypot(f.x - b.x, f.z - b.z) < 180)) continue;
    const low = out.length % 2 === 1;
    const side = rnd() < 0.5 ? -1 : 1, alongX = rnd() < 0.5;
    const f = low
      ? { x: b.x + (alongX ? side * (b.w / 2 + 4) : 0), y: 8 + rnd() * 18, z: b.z + (alongX ? 0 : side * (b.d / 2 + 4)), district: b.district }
      : { x: b.x, y: b.top + 5, z: b.z, district: b.district };
    if (solidAt(lotAt(city, f.x, f.z), f.x, f.y, f.z, 3)) continue; // tucked into a neighbour: unreachable
    out.push(f);
  }
  return out;
}

// Photo spots: views worth framing. A capture counts when the target is near and centred in the shot.
export function choosePhotoSpots(city) {
  const by = (id) => city.buildings.filter((b) => DISTRICTS[b.district].id === id && !b.hidden).sort((a, b) => b.top - a.top)[0];
  const spots = [];
  const add = (name, hint, p) => p && spots.push({ name, hint, x: p.x, y: p.y, z: p.z });
  const spire = by('spires'), stack = by('stacks'), market = by('market'), out = by('outskirts');
  add('The Tallest Spire', 'its crown, from close by', spire && { x: spire.x, y: (spire.shape === 'pyramid' ? spire.vh : spire.top), z: spire.z });
  add('Highest Window in the Stacks', 'the top of the tallest residential block', stack && { x: stack.x, y: stack.top, z: stack.z });
  add('Market Rooftops', 'the tallest Neon Market roof', market && { x: market.x, y: market.top, z: market.z });
  add('The Sea Wall', 'the middle of the wall, from over the water', { x: HALF + 22, y: 40, z: 0 });
  add('The Last Tower', 'the tallest building in the Outskirts', out && { x: out.x, y: out.top, z: out.z });
  add('Central Avenue', 'the heart of the city at street-light level', { x: 0, y: 30, z: 0 });
  return spots;
}

export function inShot(camera, spot, maxDist = 220, cone = 0.9) {
  const to = new THREE.Vector3(spot.x - camera.position.x, spot.y - camera.position.y, spot.z - camera.position.z);
  const d = to.length();
  return d < maxDist && to.normalize().dot(camera.getWorldDirection(new THREE.Vector3())) > cone;
}

// Glowing shards that spin and bob; collected by flying within 7 m.
export function createFragments(list, found) {
  const group = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(1.1, 0);
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 3.2, 4.2) });
  const halo = new THREE.SpriteMaterial({ color: new THREE.Color(0.2, 0.9, 1.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, map: haloTex() });
  const items = list.map((f, i) => {
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    const m = new THREE.Mesh(geo, core);
    m.scale.set(0.7, 1.3, 0.7);
    const s = new THREE.Sprite(halo);
    s.scale.setScalar(9);
    g.add(m, s);
    g.visible = !found.has(i);
    group.add(g);
    return { g, m, f, i };
  });
  return {
    group,
    // Returns the index collected this frame, or -1.
    update(time, pos) {
      let got = -1;
      for (const it of items) {
        if (!it.g.visible) continue;
        it.m.rotation.y = time * 1.4 + it.i;
        it.g.position.y = it.f.y + Math.sin(time * 1.2 + it.i) * 0.6;
        if (got < 0 && it.g.position.distanceToSquared(pos) < 49) { it.g.visible = false; got = it.i; }
      }
      return got;
    },
  };
}

function haloTex() {
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
