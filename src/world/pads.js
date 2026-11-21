import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DISTRICTS } from './districts.js';
import { pbrMaps } from './assets.js';

// Places you can land. Colours stay in the cyan/red palette.
export const PAD_TYPES = {
  home: { label: 'HOME', color: [0.35, 0.95, 1], light: 'lamp' },
  pad: { label: 'SKY-PAD', color: [0.1, 0.85, 1], light: 'blue' },
  noodle: { label: 'NOODLE BALCONY', color: [1, 0.22, 0.16], light: 'red' },
  tea: { label: 'TEA BAR', color: [0.3, 0.95, 1], light: 'lamp' },
};
const NAMES = {
  noodle: ['Soma Noodle Balcony', 'Ghost Ramen Ledge', 'Night Broth Deck', 'Yatai 88'],
  tea: ['Yūrei Tea House', 'Rain Shelter Tea Bar', 'Lantern Steep'],
  pad: ['Pad Kōsen-7', 'Pad Halcyon', 'Pad Vesper', 'Pad Akari', 'Pad Mirai', 'Pad Lotus'],
};
export const PAD_R = 6;

const roofOf = (b) => b.tiers?.at(-1) ?? b;
const flatRoof = (b) => !b.hidden && b.shape === 'box' && Math.min(roofOf(b).w, roofOf(b).d) >= 2 * PAD_R + 1;

// Deterministic per seed: one Home in the Stacks near the start, then noodle balconies + tea bars in the
// Market/Stacks and public pads spread out, all at least 140 m apart on roofs wide enough for the car.
export function choosePads(city) {
  const rnd = mulberry32(city.seed ^ 0x9ad5);
  const did = (b) => DISTRICTS[b.district].id;
  const ok = city.buildings.filter((b) => flatRoof(b) && b.top < 200 && !(did(b) === 'spires' && b.top > 120));
  const pads = [];
  const far = (b) => pads.every((p) => Math.hypot(p.x - b.x, p.z - b.z) > 140);
  const add = (type, b, name) => pads.push({ id: `${type}${pads.length}`, type, name, x: b.x, y: b.top, z: b.z, district: b.district });
  const home = ok.filter((b) => did(b) === 'stacks' && b.top > 45).sort((a, b) => Math.hypot(a.x, a.z - 40) - Math.hypot(b.x, b.z - 40))[0];
  if (home) add('home', home, 'Home');
  const shuffled = ok.map((b) => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const want = [['noodle', ['market'], 4], ['tea', ['market', 'stacks'], 3], ['pad', ['spires', 'stacks', 'outskirts', 'docks', 'market'], 6]];
  for (const [type, districts, n] of want) {
    let k = 0;
    for (const b of shuffled) {
      if (k >= n) break;
      if (districts.includes(did(b)) && far(b)) add(type, b, NAMES[type][k++]);
    }
  }
  return pads;
}

// Keep roofs under a pad clear of kit props, fans and vents.
export function clearPadRoofs(city, pads) {
  const free = (o) => pads.every((p) => Math.hypot(o.x - p.x, o.z - p.z) > PAD_R + 2.5 || o.y < p.y - 1);
  for (const k of ['clutter', 'fans', 'vents']) city[k] = city[k].filter(free);
}

function labelTexture(text, color) {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 96 });
  const g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 10;
  g.font = '600 50px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const k = Math.min(1, 470 / g.measureText(text).width);
  g.save(); g.translate(256, 50); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...color.map((v) => v * 2.2)), side: THREE.DoubleSide });
}

let deckMat = null; // made on first use: the textures need a browser (tests import this module under Node)
const deckGeo = new THREE.CylinderGeometry(PAD_R, PAD_R, 0.3, 32);
const ringGeo = new THREE.TorusGeometry(PAD_R - 0.3, 0.12, 6, 48).rotateX(Math.PI / 2);
const rodGeo = new THREE.BoxGeometry(0.35, 1, 0.35);

// A landing deck with a glowing ring, a tall light rod you can spot from far away, and a name board.
export function makePadMesh(p) {
  const T = PAD_TYPES[p.type] ?? PAD_TYPES.pad, col = T.color;
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  deckMat ??= new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.35, metalness: 0.6, ...pbrMaps('MetalPlates006', 3) });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.15;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col.map((v) => v * 4)) }));
  ring.position.y = 0.32;
  const rod = new THREE.Mesh(rodGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col.map((v) => v * 1.6)) })); // dimmer than the ring: no bloom blowout up close
  rod.scale.y = 7;
  rod.position.set(PAD_R + 0.6, 3.5, 0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), labelTexture(p.name.toUpperCase(), col));
  board.position.set(0, 2.2, -PAD_R - 0.4);
  g.add(deck, ring, rod, board);
  g.rotation.y = Math.atan2(p.x, p.z); // name board faces outward, readable on approach from the centre
  return g;
}
