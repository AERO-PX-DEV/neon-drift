import * as THREE from 'three';
import { HALF, BLOCK, roadCoord } from './layout.js';
import { loadModel, modelParts, InstancedModel } from './assets.js';

// Elevated maglev lines running down road corridors. Trains ease back and forth with
// s(t) = mid + A·sin(ωt): smooth stops at each terminus for free.
const LINES = [
  { axis: 0, c: roadCoord(12), from: -HALF + 40, to: HALF * 0.95, y: 32, col: [0.3, 2.5, 4] },
  { axis: 1, c: roadCoord(20), from: -HALF + 40, to: HALF - 40, y: 24, col: [4, 2, 0.5] },
  { axis: 0, c: roadCoord(25), from: -HALF + 40, to: HALF * 0.9, y: 40, col: [4, 0.6, 2.5] },
];
const CARS = 6, CAR_LEN = 16, GAP = 1.5, PEAK = 28;

export function createTrains() {
  const group = new THREE.Group();
  const total = LINES.length * CARS;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  // Static track + pillars.
  const rails = [], pillars = [];
  for (const L of LINES) {
    const len = L.to - L.from, mid = (L.from + L.to) / 2;
    rails.push({ L, len, mid });
    for (let i = 0; i <= HALF * 2 / BLOCK; i++) {
      const at = roadCoord(i);
      if (at > L.from && at < L.to) pillars.push({ L, at });
    }
  }
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.6, roughness: 0.4 });
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trackMat, rails.length);
  rails.forEach(({ L, len, mid }, i) => {
    p.set(L.axis === 0 ? mid : L.c, L.y - 2.4, L.axis === 0 ? L.c : mid);
    railMesh.setMatrixAt(i, m.compose(p, q.identity(), L.axis === 0 ? s.set(len, 0.8, 3.4) : s.set(3.4, 0.8, len)));
  });
  const pillarMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trackMat, pillars.length);
  pillars.forEach(({ L, at }, i) => {
    const h = L.y - 2.8;
    p.set(L.axis === 0 ? at : L.c, h / 2, L.axis === 0 ? L.c : at);
    pillarMesh.setMatrixAt(i, m.compose(p, q.identity(), s.set(1.6, h, 1.6)));
  });
  // Under-rail guide lights.
  const glowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), rails.length);
  rails.forEach(({ L, len, mid }, i) => {
    p.set(L.axis === 0 ? mid : L.c, L.y - 2.9, L.axis === 0 ? L.c : mid);
    glowMesh.setMatrixAt(i, m.compose(p, q.identity(), L.axis === 0 ? s.set(len, 0.15, 0.3) : s.set(0.3, 0.15, len)));
    glowMesh.setColorAt(i, c.setRGB(...L.col).multiplyScalar(0.4));
  });
  group.add(railMesh, pillarMesh, glowMesh);

  // Moving cars: body + glowing window band.
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 3.2, CAR_LEN), new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.8, roughness: 0.25 }), total);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(3.3, 0.7, CAR_LEN - 2), new THREE.MeshBasicMaterial(), total);
  bodies.frustumCulled = bands.frustumCulled = false;
  LINES.forEach((L, li) => { for (let k = 0; k < CARS; k++) bands.setColorAt(li * CARS + k, c.setRGB(...L.col)); });
  group.add(bodies, bands);

  // Kenney monorail cars (front, passengers, end) replace the boxes once loaded, stretched to CAR_LEN;
  // their windows glow in the line colour.
  const segs = [];
  const silver = bodies.material, windows = new THREE.MeshBasicMaterial();
  const kindOf = (k) => (k === 0 ? 'Front' : k === CARS - 1 ? 'End' : 'Passenger');
  Promise.all(['Front', 'Passenger', 'End'].map((n) => loadModel(`models/kenney-space-kit/monorail_train${n}.glb`))).then((gs) => {
    if (gs.some((g) => !g)) return;
    ['Front', 'Passenger', 'End'].forEach((kind, j) => {
      const parts = modelParts(gs[j], 3.2, 'x');
      for (const p of parts) p.geometry.scale(1, 3.2 / parts.size.y, CAR_LEN / parts.size.z).translate(0, -1.6, 0);
      const ids = [];
      LINES.forEach((L, li) => { for (let k = 0; k < CARS; k++) if (kindOf(k) === kind) ids.push(li * CARS + k); });
      const model = new InstancedModel(parts, ids.length, (p) => (p.name === 'dark' ? windows : silver));
      for (const mesh of model.meshes) if (mesh.name === 'dark') ids.forEach((id, n) => mesh.setColorAt(n, c.setRGB(...LINES[Math.floor(id / CARS)].col)));
      segs.push({ model, ids });
      group.add(model.group);
    });
    bodies.visible = bands.visible = false;
  });

  const band = new THREE.Matrix4().makeTranslation(0, 0.4, 0);
  return {
    group,
    update(time) {
      rails.forEach(({ L, len, mid }, li) => {
        const A = len / 2 - (CARS / 2) * (CAR_LEN + GAP) - 10, w = PEAK / A;
        const sPos = mid + A * Math.sin(time * w + li * 2);
        q.setFromAxisAngle(up, L.axis === 0 ? Math.PI / 2 : 0);
        for (let k = 0; k < CARS; k++) {
          const at = sPos + (k - (CARS - 1) / 2) * (CAR_LEN + GAP);
          p.set(L.axis === 0 ? at : L.c, L.y, L.axis === 0 ? L.c : at);
          m.compose(p, q, s.set(1, 1, 1));
          bodies.setMatrixAt(li * CARS + k, m);
          bands.setMatrixAt(li * CARS + k, m.multiply(band));
        }
      });
      bodies.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = true;
      for (const { model, ids } of segs) {
        ids.forEach((id, n) => model.setMatrixAt(n, bodies.getMatrixAt(id, m)));
        model.commit();
      }
    },
  };
}
