import { BLOCK, HALF } from './layout.js';
import { DISTRICTS, districtAt } from './districts.js';

// District neon intensity + rolling blackouts. Every lit instance (neon strip, sign, building windows via
// aLit) remembers its base value, district and block; a block's power comes back on at its own time so a
// blacked-out district relights block by block, each with a brief flicker.
export function createCityLights(city, cityMeshes, signMesh) {
  const neon = DISTRICTS.map(() => 1);
  const backOn = new Map(); // block → time its power returns (absent = on)
  let clock = 0, active = false, dirty = true;
  const blockOf = (x, z) => Math.floor((x + HALF) / BLOCK) * 1000 + Math.floor((z + HALF) / BLOCK);
  const tag = (x, z) => ({ d: districtAt(x, z, city.seed), b: blockOf(x, z) });

  const colorSets = [
    [cityMeshes.stripMesh, city.strips.map((s) => ({ ...tag(s.x, s.z), c: s.c }))],
    [signMesh, city.signs.map((s) => ({ ...tag(s.x, s.z), c: s.color.map((v) => v * s.k) }))],
  ];
  const litSets = cityMeshes.buildings.map(([mesh, list]) => [mesh.geometry.getAttribute('aLit'), list.map((b) => ({ d: b.district, b: blockOf(b.x, b.z), lit: b.lit }))]);

  const power = (blk) => {
    const t = backOn.get(blk);
    if (t === undefined) return 1;
    if (clock < t) return 0;
    if (clock < t + 0.6) return Math.sin((clock - t) * 47) > 0 ? 1 : 0.15; // stuttering relight
    backOn.delete(blk);
    return 1;
  };

  function apply() {
    for (const [mesh, items] of colorSets) {
      const arr = mesh.instanceColor.array;
      items.forEach((it, i) => { const k = neon[it.d] * power(it.b); arr[i * 3] = it.c[0] * k; arr[i * 3 + 1] = it.c[1] * k; arr[i * 3 + 2] = it.c[2] * k; });
      mesh.instanceColor.needsUpdate = true;
    }
    for (const [attr, items] of litSets) {
      items.forEach((it, i) => (attr.array[i] = it.lit * power(it.b)));
      attr.needsUpdate = true;
    }
  }

  return {
    neon,
    setNeon(d, k) { neon[d] = k; dirty = true; },
    get blackedOut() { return active; },
    // Lights die together, then return in a wave spreading from a random point in the district.
    blackout(d) {
      const blocks = new Map();
      for (const [, items] of colorSets) for (const it of items) if (it.d === d) blocks.set(it.b, true);
      for (const [, items] of litSets) for (const it of items) if (it.d === d) blocks.set(it.b, true);
      const keys = [...blocks.keys()];
      if (!keys.length) return;
      const o = keys[Math.floor(Math.random() * keys.length)], ox = Math.floor(o / 1000), oz = o % 1000;
      for (const k of keys) backOn.set(k, clock + 6 + Math.hypot(Math.floor(k / 1000) - ox, (k % 1000) - oz) * 1.6 + Math.random() * 1.5);
      active = true;
    },
    update(dt) {
      clock += dt;
      if (active || dirty) { apply(); dirty = false; }
      if (active && !backOn.size) active = false;
    },
  };
}
