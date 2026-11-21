import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Downloaded models (public/models, see CREDITS.md). Everything here is optional detail: a missing or broken
// file only warns, and whatever was standing in for it stays.
const loader = new GLTFLoader(), cache = new Map();
export const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(assetUrl(path)).catch((e) => { console.warn(`${path} unavailable`, e); return null; }));
  return cache.get(path);
}

// ambientCG PBR set from public/textures/<id>/ (colour, OpenGL normal, roughness), tiled `repeat` times.
const texLoader = new THREE.TextureLoader();
export function pbrMaps(id, repeat) {
  const load = (kind) => {
    const t = texLoader.load(assetUrl(`textures/${id}/${id}_1K-JPG_${kind}.jpg`), undefined, undefined, () => console.warn(`${id} ${kind} map unavailable`));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  };
  const map = load('Color');
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: load('NormalGL'), roughnessMap: load('Roughness') };
}

// A model's meshes baked into model space, scaled so `axis` ('x', 'y', 'z', or 'xz' = the larger footprint side)
// spans `size` metres, standing on y = 0, centred on x/z. One part per material, ready to instance.
export function modelParts(gltf, size, axis = 'xz') {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) parts.push({ geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material: o.material, name: o.material.name ?? '' });
  });
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = size / (axis === 'xz' ? Math.max(sz.x, sz.z) : sz[axis]);
  const m = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  for (const p of parts) { p.geometry.applyMatrix4(m); p.geometry.computeBoundingSphere(); }
  parts.size = sz.multiplyScalar(k);
  return parts;
}

// Same transform on every part of an instanced model. `paint(part)` may swap a part's material.
export class InstancedModel {
  constructor(parts, count, paint = (p) => p.material) {
    this.group = new THREE.Group();
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, paint(p), count);
      mesh.name = p.name;
      mesh.frustumCulled = false; // instances span the whole city
      this.group.add(mesh);
      return mesh;
    });
  }
  setMatrixAt(i, m) { for (const mesh of this.meshes) mesh.setMatrixAt(i, m); }
  setCount(n) { for (const mesh of this.meshes) mesh.count = n; }
  commit() { for (const mesh of this.meshes) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; } }
}
