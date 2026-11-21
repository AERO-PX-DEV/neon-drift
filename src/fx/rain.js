import * as THREE from 'three';

const RAIN_COL = new THREE.Color(0.62, 0.74, 0.9);
const ASH_COL = new THREE.Color(0.85, 0.85, 0.88);

// GPU rain: each streak wraps inside a box around the camera; the tail trails along
// (rain velocity − car velocity), so streaks slant and stretch with speed. No per-frame CPU work.
export function createRain(count) {
  const off = new Float32Array(count * 6), end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    off.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
  geo.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));

  const uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(90, 70, 90) },
    uFall: { value: new THREE.Vector3(-3, -38, 1) },
    uCarVel: { value: new THREE.Vector3() },
    uLen: { value: 0.045 },
    uWobble: { value: 0 },
    uOpacity: { value: 0.45 },
    uColor: { value: RAIN_COL.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aOff; attribute float aEnd;
      uniform float uTime, uLen, uWobble; uniform vec3 uCam, uBox, uFall, uCarVel;
      varying float vA;
      void main() {
        vec3 p = aOff * uBox + uFall * uTime;
        p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
        p.x += sin(uTime * 1.7 + aOff.y * 40.0) * uWobble;   // ash flakes drift
        p.z += cos(uTime * 1.3 + aOff.x * 37.0) * uWobble;
        p -= (uFall - uCarVel) * uLen * aEnd;
        float d = length(p - uCam);
        vA = (1.0 - aEnd * 0.85) * smoothstep(44.0, 6.0, d) * smoothstep(0.6, 2.0, d);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor; varying float vA;
      void main() { gl_FragColor = vec4(uColor * vA * uOpacity, 1.0); }`,
  });
  const object = new THREE.LineSegments(geo, mat);
  object.frustumCulled = false;

  let density = 1; // graphics preset
  return {
    object,
    uniforms,
    setDensity(k) { density = k; },
    update(time, camPos, carVel, w) {
      uniforms.uTime.value = time % 600; // keep float precision; the jump on wrap is invisible in rain
      uniforms.uCam.value.copy(camPos);
      uniforms.uCarVel.value.copy(carVel);
      uniforms.uFall.value.y = -w.fall;
      uniforms.uLen.value = w.len;
      uniforms.uWobble.value = w.wobble;
      uniforms.uOpacity.value = 0.45 + w.flake * 0.5;
      uniforms.uColor.value.copy(RAIN_COL).lerp(ASH_COL, w.flake);
      geo.setDrawRange(0, 2 * Math.floor(count * Math.min(1, w.rain) * density));
    },
  };
}
