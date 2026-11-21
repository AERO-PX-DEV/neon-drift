import * as THREE from 'three';
import { lotAt, solidAt } from '../world/city.js';

// Lightweight lens flare drawn as a 2D overlay after post-processing.
// Occlusion: march the lot grid from camera to source (three's Lensflare can't read half-float targets).
function glowTexture(ring) {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) { grd.addColorStop(0.6, 'rgba(255,255,255,0)'); grd.addColorStop(0.8, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const GHOSTS = [[0, 1.0, 0], [0.35, 0.12, 1], [0.6, 0.07, 0], [0.85, 0.16, 1], [1.25, 0.05, 0]]; // [distance along axis, size, ring?]

export function createFlares(sources, city) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tex = [glowTexture(false), glowTexture(true)];
  const items = sources.map((src) => {
    const sprites = GHOSTS.map(([d, size, ring]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex[ring], color: new THREE.Color(...src.color), blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false, transparent: true, fog: false,
      }));
      sp.userData = { d, size };
      scene.add(sp);
      return sp;
    });
    return { pos: new THREE.Vector3(src.x, src.y, src.z), sprites, vis: 0 };
  });

  const v = new THREE.Vector3(), step = new THREE.Vector3();
  function occluded(from, to) {
    step.subVectors(to, from);
    const n = Math.min(160, Math.ceil(step.length() / 5));
    step.divideScalar(n);
    v.copy(from);
    for (let i = 1; i < n - 1; i++) {
      v.add(step);
      if (solidAt(lotAt(city, v.x, v.z), v.x, v.y, v.z)) return true;
    }
    return false;
  }

  let frame = 0;
  return {
    render(renderer, camera, dt, fogDensity) {
      const aspect = camera.aspect;
      frame++;
      items.forEach((it, k) => {
        v.copy(it.pos).project(camera);
        const dist = it.pos.distanceTo(camera.position);
        const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        if (onScreen && (frame + k) % 6 === 0) it.blocked = occluded(camera.position, it.pos); // staggered checks
        const target = onScreen && !it.blocked ? Math.exp(-dist * fogDensity * 1.5) : 0;
        it.vis += (target - it.vis) * Math.min(1, dt * 6);
        const sx = v.x, sy = v.y;
        it.sprites.forEach((sp) => {
          const { d, size } = sp.userData;
          sp.visible = it.vis > 0.01;
          sp.position.set(sx * (1 - d * 2), sy * (1 - d * 2), 0); // ghosts mirror through the screen centre
          sp.scale.set(size / aspect, size, 1);
          sp.material.opacity = it.vis * (d === 0 ? 0.9 : 0.5);
        });
      });
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, cam);
      renderer.autoClear = auto;
    },
  };
}
