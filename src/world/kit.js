import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KIT } from './city.js';
import { loadModel, modelParts, InstancedModel } from './assets.js';

// Downloaded rooftop props (see CREDITS.md). `near`: a detailed Poly Haven model, drawn only for the closest
// NEAR_MAX instances within NEAR m (thousands of 19k-triangle aircons would sink any GPU); beyond that the light
// Blender prop of the same name stands in, or nothing for small props the fog hides anyway.
const PH = (n) => `models/polyhaven/${n}/${n}_1k.gltf`;
const MODELS = {
  ACUnit: { path: PH('exterior_aircon_unit'), size: 2, axis: 'x', near: true },
  UtilityBox: { path: PH('utility_box_02'), size: 1.7, axis: 'y', near: true },
  Duct: { path: PH('modular_airduct_circular_01'), size: 4.2, axis: 'xz', near: true },
  Dish: { path: 'models/quaternius-space-kit/Roof%20Radar.glb', size: 4, axis: 'y' },
  Antenna: { path: 'models/quaternius-space-kit/Roof%20Antenna.glb', size: 6, axis: 'y' },
  SolarPanel: { path: 'models/quaternius-space-kit/Solar%20Panel.glb', size: 3.4, axis: 'xz' },
};
const NEAR = 160, NEAR_MAX = 80;

// Rooftop clutter: Blender kit (blender/kit.blend → public/models/kit.glb) plus the downloaded models above,
// one InstancedMesh per prop type. Optional detail: if a file is missing, those roofs stay bare.
export function createKit(clutter) {
  const group = new THREE.Group();
  const items = {};
  for (const c of clutter) (items[c.type] ??= []).push(c);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (c) => m.compose(p.set(c.x, c.y, c.z), q.setFromAxisAngle(up, c.rot), s.setScalar(c.s));

  const far = {}; // type → InstancedMesh of the Blender prop
  new GLTFLoader().load(`${import.meta.env.BASE_URL}models/kit.glb`, (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 });
    for (const type of KIT) {
      const node = gltf.scene.getObjectByName(type), list = items[type];
      if (!node?.isMesh || !list || (MODELS[type] && !MODELS[type].near)) continue; // fully replaced types skip
      const mesh = new THREE.InstancedMesh(node.geometry.clone().applyMatrix4(node.matrixWorld), mat, list.length);
      list.forEach((c, i) => mesh.setMatrixAt(i, place(c)));
      far[type] = mesh;
      group.add(mesh);
    }
  }, undefined, (err) => console.warn('kit.glb unavailable, roofs stay bare', err));

  const lods = [];
  for (const [type, M] of Object.entries(MODELS)) {
    const list = items[type];
    if (!list) continue;
    loadModel(M.path).then((g) => {
      if (!g) return;
      const parts = modelParts(g, M.size, M.axis);
      const model = new InstancedModel(parts, M.near ? NEAR_MAX : list.length);
      if (M.near) { model.setCount(0); lods.push({ type, list, model, cur: [] }); }
      else { list.forEach((c, i) => model.setMatrixAt(i, place(c))); model.commit(); }
      group.add(model.group);
    });
  }

  let wait = 0;
  return {
    group,
    update(dt, cam) {
      if ((wait -= dt) > 0) return;
      wait = 0.25;
      for (const L of lods) {
        const cur = [];
        for (let i = 0; i < L.list.length && cur.length < NEAR_MAX; i++) {
          const c = L.list[i];
          if (Math.abs(c.x - cam.x) < NEAR && Math.abs(c.z - cam.z) < NEAR) cur.push(i);
        }
        cur.forEach((i, n) => L.model.setMatrixAt(n, place(L.list[i])));
        L.model.setCount(cur.length);
        L.model.commit();
        const fm = far[L.type];
        if (fm) { // detailed ones in, their stand-ins out
          for (const i of L.cur) fm.setMatrixAt(i, place(L.list[i]));
          for (const i of cur) fm.setMatrixAt(i, ZERO);
          fm.instanceMatrix.needsUpdate = true;
        }
        L.cur = cur;
      }
    },
  };
}
