import * as THREE from 'three';
import { HALF } from '../world/layout.js';

const SHELLS = 14, PER = 110;
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }; // same as the GLSL one
const rate = (s) => 0.11 + hash(s + 0.5) * 0.07;
// Where shell s bursts in cycle `cyc` (mirrored in the shader so sounds line up with what you see).
export function burstAt(s, cyc) {
  return [(hash(cyc * 3.1 + s) - 0.5) * HALF * 1.5, 170 + hash(cyc * 5.7 + s) * 160, (hash(cyc * 7.3 + s) - 0.5) * HALF * 1.5];
}

// Festival fireworks: each shell bursts on its own cycle at a new spot; particles never touch the CPU.
export function createFireworks(uniforms) {
  const n = SHELLS * PER, pos = new Float32Array(n * 3), shell = new Float32Array(n), dir = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    shell[i] = Math.floor(i / PER);
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 0.75 + Math.random() * 0.25;
    dir.set([r * Math.cos(a) * sp, u * sp, r * Math.sin(a) * sp], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aShell', new THREE.BufferAttribute(shell, 1));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  const on = { value: 0 };
  const obj = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uScale: uniforms.uScale, uOn: on, uHalf: { value: HALF } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uScale, uOn, uHalf; attribute float aShell; attribute vec3 aDir; varying vec3 vC; varying float vA;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        float c = uTime * (0.11 + hash(aShell + 0.5) * 0.07) + hash(aShell + 9.0);
        float cyc = floor(c), t = fract(c) * 1.6;           // burst lasts ~1/1.6 of the cycle, then dark
        vec3 o = vec3((hash(cyc * 3.1 + aShell) - 0.5) * uHalf * 1.5, 170.0 + hash(cyc * 5.7 + aShell) * 160.0, (hash(cyc * 7.3 + aShell) - 0.5) * uHalf * 1.5);
        float R = 38.0 + hash(cyc + aShell * 2.0) * 30.0;
        vec3 p = o + aDir * R * (1.0 - exp(-t * 4.0)) + vec3(0.0, -9.0 * t * t, 0.0);
        float pick = hash(cyc * 11.0 + aShell);
        vC = pick < 0.45 ? vec3(0.3, 1.6, 2.6) : pick < 0.75 ? vec3(2.8, 0.45, 0.35) : pick < 0.9 ? vec3(2.4, 2.4, 2.6) : vec3(2.6, 1.3, 0.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(2.0, 5.0 * uScale / -mv.z); // stays visible across the city
        vA = step(t, 1.0) * pow(1.0 - min(t, 1.0), 1.4) * uOn * (0.6 + 0.4 * sin(uTime * 30.0 + aDir.x * 50.0)) * exp(-length(mv.xyz) * 0.0009);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vC; varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.1, r) * vA, 1.0); }`,
  }));
  obj.frustumCulled = false;
  const last = new Array(SHELLS).fill(-1);
  return {
    object: obj,
    target: 0,
    // onBurst(x, y, z) fires once per new burst while the festival is on.
    update(dt, time, onBurst) {
      on.value += (this.target - on.value) * Math.min(1, dt * 0.5);
      obj.visible = on.value > 0.01;
      for (let s = 0; s < SHELLS; s++) {
        const cyc = Math.floor(time * rate(s) + hash(s + 9));
        if (cyc !== last[s]) { if (last[s] >= 0 && this.target > 0.5) onBurst?.(...burstAt(s, cyc)); last[s] = cyc; }
      }
    },
  };
}
