import * as THREE from 'three';

// GPU-animated particles: each point's age is fract(uTime·rate + phase), so the CPU never touches them.
function points(count, attrs, uniforms, vertexShader, fragmentShader) {
  const geo = new THREE.BufferGeometry();
  for (const [name, arr, size] of attrs) geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  const obj = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  obj.frustumCulled = false;
  return obj;
}

// Steam and smoke plumes from vents and food stalls.
export function createSteam(vents, uniforms, per = 14) {
  const n = vents.length * per, pos = new Float32Array(n * 3), ph = new Float32Array(n), rnd = new Float32Array(n);
  vents.forEach((v, i) => { for (let k = 0; k < per; k++) { const j = i * per + k; pos.set([v.x, v.y, v.z], j * 3); ph[j] = k / per + Math.random() * 0.05; rnd[j] = Math.random(); } });
  return points(n, [['position', pos, 3], ['aPhase', ph, 1], ['aRand', rnd, 1]], uniforms, /* glsl */ `
    uniform float uTime, uScale; attribute float aPhase, aRand; varying float vA;
    void main() {
      float t = fract(uTime * 0.12 + aPhase);
      vec3 p = position + vec3(t * 9.0 + (aRand - 0.5) * 4.0 * t, t * 24.0, (fract(aRand * 7.3) - 0.5) * 4.0 * t);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = (2.0 + t * 10.0) * uScale / -mv.z;
      vA = sin(t * 3.14159) * 0.16 * smoothstep(700.0, 150.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, `varying float vA;
    void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.55, 0.6, 0.72) * smoothstep(0.5, 0.0, r) * vA, 1.0); }`);
}

// Welding sparks from repair crews: intermittent bursts falling under gravity.
export function createSparks(emitters, uniforms, per = 70) {
  const n = emitters.length * per, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), ph = new Float32Array(n), em = new Float32Array(n);
  emitters.forEach((e, i) => {
    const gate = Math.random();
    for (let k = 0; k < per; k++) {
      const j = i * per + k;
      pos.set([e.x, e.y, e.z], j * 3);
      vel.set([2 + Math.random() * 5, Math.random() * 4 - 1, (Math.random() - 0.5) * 6], j * 3);
      ph[j] = Math.random(); em[j] = gate;
    }
  });
  return points(n, [['position', pos, 3], ['aVel', vel, 3], ['aPhase', ph, 1], ['aEmit', em, 1]], uniforms, /* glsl */ `
    uniform float uTime, uScale; attribute vec3 aVel; attribute float aPhase, aEmit; varying float vA;
    void main() {
      float t = fract(uTime * 1.1 + aPhase) * 1.4;
      vec3 p = position + aVel * t + vec3(0.0, -4.9, 0.0) * t * t;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = 0.3 * uScale / -mv.z;
      vA = (1.0 - t / 1.4) * step(0.55, fract(uTime * 0.2 + aEmit)) * smoothstep(500.0, 100.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`, `varying float vA;
    void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(5.0, 2.2, 0.6) * step(r, 0.5) * vA, 1.0); }`);
}
