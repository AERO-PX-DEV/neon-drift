import * as THREE from 'three';

// t ∈ [0,1): 0 deep night → 0.5 smoggy pre-dawn haze (amber/teal) → 1 back to night.
// Night palette follows the user's reference: everything sits in a deep blue haze.
const NIGHT = { horizon: [0.04, 0.11, 0.23], top: [0.006, 0.016, 0.04], fog: [0.02, 0.065, 0.145], hemi: [0.3, 0.5, 0.9], hemiI: 1.7, win: 1 };
const DAWN = { horizon: [0.62, 0.34, 0.16], top: [0.05, 0.1, 0.13], fog: [0.2, 0.24, 0.24], hemi: [0.62, 0.6, 0.52], hemiI: 3.2, win: 0.55 };
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

export function createSky(scene, hemi) {
  const uniforms = {
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uTop: { value: new THREE.Color() },
    uFlash: { value: 0 },
  };
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 16),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uHorizon, uFog, uTop; uniform float uFlash; varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(uFog, uHorizon, smoothstep(-0.04, 0.12, h));
          c = mix(c, uFog, smoothstep(0.12, 0.35, h));
          c = mix(c, uTop, smoothstep(0.22, 0.75, h));
          c += vec3(0.55, 0.6, 0.8) * uFlash * (0.4 + 0.6 * smoothstep(0.0, 0.5, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  ));
  // The dome rides with whichever camera renders it, so the 2200 m far plane never clips it (black dome far from the centre).
  const dome = scene.children.at(-1);
  dome.frustumCulled = false;
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };

  const sky = {
    t: 0.08,
    cycle: false,
    cycleSeconds: 20 * 60,
    uniforms,
    get dawn() { return Math.sin(Math.PI * sky.t) ** 2; },
    update(dt, weather, cityUniforms, tint = [0, 0, 0]) {
      if (sky.cycle) sky.t = (sky.t + dt / sky.cycleSeconds) % 1;
      const d = sky.dawn;
      const thick = Math.min(1, Math.max(0, weather.p.fog - 0.0045) * 140); // 0 = clear-ish, 1 = dense fog
      const fog = mix(NIGHT.fog, DAWN.fog, d).map((v, i) => v * (1 + thick * 1.1) + tint[i]); // dense fog glows; district tints the haze
      const flash = weather.flash;
      uniforms.uFog.value.setRGB(...fog);
      uniforms.uHorizon.value.setRGB(...mix(mix(NIGHT.horizon, DAWN.horizon, d), fog, thick)); // fog swallows the horizon glow
      uniforms.uTop.value.setRGB(...mix(NIGHT.top, DAWN.top, d));
      uniforms.uFlash.value = flash;
      scene.fog.color.setRGB(fog[0] + flash * 0.25, fog[1] + flash * 0.27, fog[2] + flash * 0.35);
      scene.fog.density = weather.p.fog * (1 - d * 0.15);
      hemi.color.setRGB(...mix(NIGHT.hemi, DAWN.hemi, d));
      hemi.intensity = NIGHT.hemiI + (DAWN.hemiI - NIGHT.hemiI) * d + flash * 8;
      cityUniforms.uWindow.value = NIGHT.win + (DAWN.win - NIGHT.win) * d;
    },
    label() { const d = sky.dawn; return d < 0.25 ? 'Deep night' : d < 0.7 ? 'Small hours' : 'Pre-dawn haze'; },
  };
  return sky;
}
