import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Film look after tone mapping: edge chromatic aberration, vignette, grain.
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.05 }, uCA: { value: 0.004 }, uVig: { value: 0.9 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uCA, uVig; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec2 o = d * r2 * uCA * 4.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      c = mix(c, c * vec3(0.85, 0.96, 1.15), 0.6) + vec3(0.0, 0.008, 0.02); // cool grade, blue-lifted shadows
      c *= 1.0 - uVig * smoothstep(0.1, 0.6, r2);
      float n = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Guard right after the scene render: NaN/Inf pixels become black and HDR is capped, so one bad pixel can't
// be smeared across the whole screen by bloom (the "screen slowly goes black" bug).
const SafeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // A comparison, not isnan(): Windows shader compilers (ANGLE/D3D) may fold isnan() to false. NaN fails <.
      if (!all(lessThan(abs(c.rgb), vec3(60000.0)))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(40.0)), c.a);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(SafeShader));
  const bloom = new UnrealBloomPass(size, 0.7, 0.55, 1.0); // only true lights glow; tighter halo so the city stays readable
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  return {
    composer,
    bloom,
    film,
    setSize(w, h) { composer.setSize(w, h); },
    render(time) { film.uniforms.uTime.value = time % 100; composer.render(); },
  };
}
