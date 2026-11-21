import * as THREE from 'three';
import { lotAt } from '../world/city.js';

// Short-lived splash rings on rooftops and streets near the camera.
export function createSplashes(count, city) {
  const pos = new Float32Array(count * 3), age = new Float32Array(count).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  const uniforms = { uScale: { value: 400 }, uOpacity: { value: 0.6 } };
  const object = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aAge; uniform float uScale; varying float vAge;
      void main(){ vAge = aAge; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.25 + aAge * 0.9) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; varying float vAge;
      void main(){ float r = length(gl_PointCoord - 0.5);
        float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.2, 0.4, r);
        gl_FragColor = vec4(vec3(0.6, 0.72, 0.9) * ring * (1.0 - vAge) * uOpacity, 1.0); }`,
  }));
  object.frustumCulled = false;

  return {
    object,
    update(dt, cam, rain, viewportH) {
      uniforms.uScale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      for (let i = 0; i < count; i++) {
        if ((age[i] += dt * 3.5) < 1) continue;
        age[i] = 1;
        if (Math.random() > rain * 0.25) continue; // respawn rate follows rain intensity
        const x = cam.position.x + (Math.random() - 0.5) * 140, z = cam.position.z + (Math.random() - 0.5) * 140;
        const b = lotAt(city, x, z);
        pos.set([x, (b ? b.h : 0) + 0.06, z], i * 3);
        age[i] = Math.random() * 0.2;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAge.needsUpdate = true;
    },
  };
}
